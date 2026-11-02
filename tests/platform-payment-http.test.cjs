require('reflect-metadata');require('dotenv').config({path:'.local/platform.env'});
const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),{randomUUID,randomBytes}=require('crypto'),{PrismaClient}=require('@prisma/client'),axios=require('axios');
assert.match(process.env.DATABASE_URL||'',/@127\.0\.0\.1:3307\/crefans_platform_dev$/);
Object.assign(process.env,{TOSS_CLIENT_KEY:'test_ck_http',TOSS_SECRET_KEY:'test_sk_http',PLATFORM_FEE_BPS:'1000',SETTLEMENT_HOLD_DAYS:'0',REFUND_WINDOW_DAYS:'30',RENEWAL_MAX_RETRIES:'2',RENEWAL_RETRY_HOURS:'1'});
const {NestFactory}=require('@nestjs/core'),{PlatformModule}=require('../dist/src/platform/module'),{cookieParser}=require('../dist/src/platform/middleware'),{EnvelopeInterceptor,PlatformExceptionFilter}=require('../dist/src/platform/http'),{digest,hashPassword}=require('../dist/src/auth/local/credentials'),{PlatformFinanceService}=require('../dist/src/platform/finance.service');
const db=new PrismaClient(),creator=randomUUID(),fan=randomUUID(),other=randomUUID(),ids=[creator,fan,other],cookies={},payments=new Map(),original=axios.request;let app,origin,plan,card,order,subscription,charges=0,cancels=0;
async function api(path,body,user=fan,method=body===undefined?'GET':'POST'){
 const r=await fetch(origin+'/api/v1'+path,{method,headers:{'Content-Type':'application/json',...(user?{Cookie:cookies[user]}:{})},body:body===undefined?undefined:JSON.stringify(body)}),data=await r.json();assert.deepEqual(Object.keys(data).sort(),['data','errorCode','errorMessage','success']);assert.ok(!JSON.stringify(data).includes('test_sk_http'));return{...data,status:r.status};
}
before(async()=>{
 axios.request=async options=>{
  const url=new URL(options.url);assert.equal(url.hostname,'api.tosspayments.com','Unexpected external request');const path=url.pathname;
  if(path==='/v1/billing/authorizations/issue')return{data:{customerKey:options.data.customerKey,billingKey:'http-billing-'+randomUUID(),card:{issuerCode:'41',number:'123456******789*'}}};
  if(path.startsWith('/v1/billing/')&&options.method==='DELETE')return{data:''};
  if(path.startsWith('/v1/billing/')){charges++;const data={orderId:options.data.orderId,totalAmount:options.data.amount,status:'DONE',paymentKey:'http-payment-'+randomUUID()};payments.set(data.orderId,data);return{data};}
  if(path.startsWith('/v1/payments/orders/')){const data=payments.get(decodeURIComponent(path.slice('/v1/payments/orders/'.length)));if(!data)throw{response:{status:404,data:{code:'NOT_FOUND_PAYMENT'}}};return{data};}
  if(path.endsWith('/cancel')){cancels++;const key=decodeURIComponent(path.split('/')[3]),entry=[...payments.values()].find(p=>p.paymentKey===key);assert.ok(entry);const data={...entry,status:'CANCELED',balanceAmount:0};payments.set(entry.orderId,data);return{data};}
  throw Error('Unsupported fake-provider operation');
 };
 for(const id of ids){await db.member.create({data:{id,email:id+'@example.invalid',name:'HTTP 검증',nickname:'검증',preferred_username:id,email_verified:true,status:'CONFIRMED'}});const token='la.'+randomBytes(32).toString('base64url');cookies[id]='access_token='+token;await db.memberSession.create({data:{member_id:id,access_hash:digest(token),refresh_hash:digest(randomUUID()),access_until:new Date(Date.now()+3600000),expires_at:new Date(Date.now()+3600000)}});}
 await db.creator.create({data:{user_id:creator}});plan=await db.membershipItem.create({data:{creator_id:creator,name:'HTTP 월 구독',price:10000,benefits:'["혜택"]',billing_unit:'MONTH'}});
 app=await NestFactory.create(PlatformModule,{logger:false});app.setGlobalPrefix('api/v1');app.use(cookieParser());app.useGlobalInterceptors(new EnvelopeInterceptor());app.useGlobalFilters(new PlatformExceptionFilter());await app.listen(process.env.PLATFORM_BROWSER_TEST==='true'?3001:0,'127.0.0.1');origin=await app.getUrl();
});
after(async()=>{
 if(process.env.PLATFORM_BROWSER_TEST==='true'&&app){
  await db.member.update({where:{id:fan},data:{password_hash:await hashPassword('BillingTest123!')}});
  await db.creator.update({where:{user_id:creator},data:{handle:'billing-'+creator.slice(0,8),display_name:'결제 검증 크리에이터'}});
  const finance=app.get(PlatformFinanceService),registration=await finance.startRegistration(fan,{});await finance.addMethod(fan,{...registration,authKey:'browser-test'});const pending=await finance.createOrder(fan,{planId:plan.id,requestId:randomUUID(),creatorProvision:'2026-10-30.1'});
  console.log('BROWSER_FIXTURE '+JSON.stringify({email:fan+'@example.invalid',orderId:pending.id,creatorId:creator}));
  await new Promise(resolve=>{process.once('SIGTERM',resolve);process.once('SIGINT',resolve);});
 }
 if(app)await app.close();axios.request=original;await db.revenueEntry.deleteMany({where:{creator_id:creator}});await db.checkoutOrder.deleteMany({where:{member_id:{in:ids}}});await db.subscription.deleteMany({where:{subscriber_id:{in:ids}}});await db.membershipItem.deleteMany({where:{creator_id:creator}});await db.billingRegistration.deleteMany({where:{member_id:{in:ids}}});await db.billingMethod.deleteMany({where:{member_id:{in:ids}}});await db.billingCustomer.deleteMany({where:{member_id:{in:ids}}});await db.memberNotification.deleteMany({where:{member_id:{in:ids}}});await db.creator.deleteMany({where:{user_id:creator}});await db.member.deleteMany({where:{id:{in:ids}}});await db.$disconnect();
});
test('v1 card authorization binds session and state, publishes masked card without provider secrets',async()=>{
 assert.equal((await api('/billing/registrations',{},null)).status,401);const registration=await api('/billing/registrations',{returnPath:'/service/payment-methods'});assert.equal(registration.success,true);
 assert.equal((await api('/billing/methods',{...registration.data,authKey:'test-auth'},other)).errorCode,'INVALID_REGISTRATION');assert.equal((await api('/billing/methods',{...registration.data,state:'forged',authKey:'test-auth'})).errorCode,'INVALID_REGISTRATION');
 const result=await api('/billing/methods',{...registration.data,authKey:'test-auth'});assert.equal(result.success,true);card=registration.data.registrationId;const common=await api('/common');assert.ok(common.data.paymentMethods.some(m=>m.id===card&&m.description==='•••• 789*'));assert.ok(!JSON.stringify(common).includes('http-billing-'));
});
test('v1 checkout uses server price and isolates member order ownership',async()=>{
 const requestId=randomUUID(),created=await api('/checkout',{planId:plan.id,requestId,creatorProvision:'2026-10-30.1',amount:1});assert.equal(created.data.amount,10000);order=created.data.id;assert.equal((await api('/checkout',{planId:plan.id,requestId,creatorProvision:'2026-10-30.1'})).data.id,order);assert.equal((await api('/checkout/'+order,undefined,other)).status,404);assert.equal((await api('/checkout/'+order+'/pay',{},other)).status,404);
});
test('v1 approval creates real DB subscription, payment history and creator revenue once',async()=>{
 const unagreed=await api('/checkout/'+order+'/pay',{});assert.equal(unagreed.errorCode,'PAYMENT_TERMS_REQUIRED','payment needs the agreement shown on the checkout screen');
 const result=await api('/checkout/'+order+'/pay',{paymentTerms:'2026-11-02.1'});assert.equal(result.success,true);assert.equal(result.data.order.status,'paid');await api('/checkout/'+order+'/pay',{paymentTerms:'2026-11-02.1'});assert.equal(charges,1);subscription=await db.subscription.findFirstOrThrow({where:{subscriber_id:fan}});const boot=await api('/bootstrap');assert.ok(boot.data.subscriptions.some(s=>s.planId===plan.id));assert.ok(boot.data.data.paymentHistory.some(p=>p.orderId===order&&p.paymentStatus==='paid'));assert.equal((await api('/studio/finance',undefined,creator)).data.summary.net,9000);
});
test('worker renewal followed by HTTP cancellation preserves remaining entitlement',async()=>{
 const past=new Date(Date.now()-60000);await db.subscription.update({where:{id:subscription.id},data:{next_billing_date:past,ended_at:past}});await app.get(PlatformFinanceService).renew(subscription.id);assert.equal(charges,2);assert.equal((await api('/subscriptions/'+creator+'/cancel',{})).success,true);assert.equal((await api('/subscriptions/'+creator+'/cancel',{})).success,true);const row=await db.subscription.findUniqueOrThrow({where:{id:subscription.id}});assert.equal(row.auto_renew,false);assert.equal(row.next_billing_date,null);assert.ok(row.ended_at>new Date());
});
test('v1 old-cycle refund preserves newer paid entitlement and current-cycle refund ends it',async()=>{
 assert.equal((await api('/checkout/'+order+'/refund',{},other)).status,404);assert.equal((await api('/checkout/'+order+'/refund',{})).success,true);assert.equal((await db.subscription.findUniqueOrThrow({where:{id:subscription.id}})).status,'CANCELLED');const latest=await db.checkoutOrder.findFirstOrThrow({where:{subscription_id:subscription.id,status:'paid'}});assert.equal((await api('/checkout/'+latest.id+'/refund',{})).success,true);await api('/checkout/'+latest.id+'/refund',{});assert.equal(cancels,2);assert.equal((await db.subscription.findUniqueOrThrow({where:{id:subscription.id}})).status,'EXPIRED');assert.equal((await api('/studio/finance',undefined,creator)).data.summary.reversals,20000);
});
test('card deletion revokes encrypted key and reflected payment history remains refunded',async()=>{
 assert.equal((await api('/billing/methods/'+card,{operation:'delete'},other,'PUT')).status,404);assert.equal((await api('/billing/methods/'+card,{operation:'delete'},fan,'PUT')).success,true);assert.equal((await db.billingMethod.findUniqueOrThrow({where:{id:card}})).billing_key_encrypted,'');const boot=await api('/bootstrap');assert.equal(boot.data.data.paymentHistory.filter(p=>p.paymentStatus==='refunded').length,2);
});
test('v1 refund eligibility and direct media GET/HEAD cannot bypass usage tracking',async()=>{
 const registration=await api('/billing/registrations',{});assert.equal((await api('/billing/methods',{...registration.data,authKey:'test-media-auth'})).success,true);
 const created=await api('/checkout',{planId:plan.id,requestId:randomUUID(),creatorProvision:'2026-10-30.1'}),id=created.data.id;assert.equal((await api('/checkout/'+id+'/pay',{paymentTerms:'2026-11-02.1'})).success,true);
 assert.equal((await api('/checkout/'+id+'/refund-eligibility',undefined,null)).status,401);assert.equal((await api('/checkout/'+id+'/refund-eligibility',undefined,other)).status,404);assert.equal((await api('/checkout/'+id+'/refund-eligibility')).data.eligible,true);
 const media=await db.media.create({data:{user_sub:creator,type:'IMAGE',original_name:'test.webp',file_name:randomUUID(),file_size:1,mime_type:'image/webp',original_url:'/api/v1/media/test/file',s3_upload_key:'local/test',processing_status:'COMPLETED'}});
 const post=await db.posting.create({data:{user_sub:creator,title:'미디어 권한',content:'본문',is_membership:true,access_plan_id:plan.id,status:'PUBLISHED',medias:{create:{media_id:media.id}}}});
 try{
  // Deliberately missing bytes: the authorization boundary must record access before file serving.
  const raw=await fetch(origin+'/api/v1/media/'+media.id+'/file',{method:'HEAD',headers:{Cookie:cookies[fan]}});await raw.arrayBuffer();assert.equal((await api('/checkout/'+id+'/refund-eligibility')).data.reason,'CONTENT_ALREADY_ACCESSED');assert.equal((await api('/checkout/'+id+'/refund',{})).errorCode,'CONTENT_ALREADY_ACCESSED');
  const used=(await db.checkoutOrder.findUniqueOrThrow({where:{id}})).content_accessed_at;
  const denied=await fetch(origin+'/api/v1/media/'+media.id+'/file',{headers:{Cookie:cookies[other]}});assert.equal(denied.status,403);await denied.arrayBuffer();assert.equal((await db.checkoutOrder.findUniqueOrThrow({where:{id}})).content_accessed_at.getTime(),used.getTime());
 }finally{await db.postingMedia.deleteMany({where:{posting_id:post.id}});await db.posting.delete({where:{id:post.id}});await db.media.delete({where:{id:media.id}});}
});
