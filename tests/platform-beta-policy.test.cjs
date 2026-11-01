require('reflect-metadata');require('dotenv').config({path:'.local/platform.env',override:true});
const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),{randomUUID,randomBytes}=require('crypto');
const {PrismaClient}=require('@prisma/client'),{ConfigService}=require('@nestjs/config');
assert.equal(process.env.CREFANS_E2E,'true');const source=process.env.DATABASE_URL;assert.match(source||'',/@127\.0\.0\.1:3307\/crefans_platform_dev$/);
const url=new URL(source);url.pathname='/crefans_platform_e2e';process.env.DATABASE_URL=url.toString();
Object.assign(process.env,{MARKETING_UNSUBSCRIBE_SECRET:'isolated-test-key-'.repeat(4),MARKETING_MAIL_ENABLED:'false'});
const {signupPolicy}=require('../dist/src/platform/signup-policy'),{PaymentProvider}=require('../dist/src/platform/payment-provider'),{betaPolicy,unusedRefundReason,isPayoutDay,renewalPolicy}=require('../dist/src/platform/beta-policy');
const {PlatformService}=require('../dist/src/platform/service'),{PlatformFinanceService}=require('../dist/src/platform/finance.service'),{PlatformStudioService}=require('../dist/src/platform/studio.service');
const {confirmSettlementReceipt}=require('../dist/src/platform/settlement-receipts'),{updateFinancialPolicy}=require('../dist/src/platform/financial-policy');
const {MarketingService,recordMarketingChoice}=require('../dist/src/platform/marketing.service'),{LegalDocumentsService}=require('../dist/src/platform/legal-documents'),{marketingMail}=require('../dist/src/auth/local/mail/templates'),{publishedCatalog}=require('./legal-fixture.cjs');
const {NestFactory}=require('@nestjs/core'),{PlatformModule}=require('../dist/src/platform/module'),{EnvelopeInterceptor,PlatformExceptionFilter,reject}=require('../dist/src/platform/http'),{cookieParser}=require('../dist/src/platform/middleware'),{digest}=require('../dist/src/auth/local/credentials');
const db=new PrismaClient(),ids=Array.from({length:8},()=>randomUUID()),[owner,fan,late,renewing,recipient,refusing,adminId,stranger]=ids,approved=new Map(),sent=[];
const config=new ConfigService({BETA_MODE:'true',SIGNUP_IDENTITY_MODE:'email-only',TOSS_CLIENT_KEY:'test_ck_local',TOSS_SECRET_KEY:'test_sk_local',MARKETING_MAIL_ENABLED:'true',MARKETING_UNSUBSCRIBE_SECRET:'isolated-test-key-'.repeat(4)});
const legal=new LegalDocumentsService();legal.catalog=publishedCatalog;const service=new PlatformService(db,legal,config),mail={sendMarketing:async(...args)=>sent.push(args)},marketing=new MarketingService(db,mail,config,legal);
let policy,history,release,plan,app,origin,admin,charges=0,cancels=0,decline=false;
const provider={configForClient:()=>({clientKey:'test_ck_local'}),decrypt:x=>x,charge:async(_a,_b,o)=>{charges++;if(decline)reject(400,'PAYMENT_FAILED','Synthetic decline');const r={status:'DONE',orderId:o.attempts?o.id+'_'+o.attempts:o.id,totalAmount:o.amount,paymentKey:'test-'+o.id+'-'+o.attempts};approved.set(r.orderId,r);return r;},lookup:async id=>approved.get(id),cancel:async key=>{cancels++;const prior=[...approved.values()].find(p=>p.paymentKey===key);const r={...prior,status:'CANCELED',balanceAmount:0};approved.set(r.orderId,r);return r;}};
const finance=new PlatformFinanceService(service,provider,config,{transfer:async()=>{throw Error('Real bank must not be invoked');}}),code=c=>e=>e.getResponse?.().code===c;
async function buy(member){const o=await finance.createOrder(member,{planId:plan.id,requestId:randomUUID(),creatorProvision:'2026-10-30.1'});await finance.pay(member,o.id);return db.checkoutOrder.findUniqueOrThrow({where:{id:o.id}});}
async function choice(member,enabled){return db.$transaction(async tx=>{await tx.$queryRaw`SELECT id FROM members WHERE id=${member} FOR UPDATE`;await recordMarketingChoice(tx,member,enabled,'test',legal.signup().documents.marketing);});}
before(async()=>{
 release=await require('./e2e-db-lock.cjs').lockE2EDatabase(source);
 const r=require('child_process').spawnSync(process.execPath,[require.resolve('prisma/build/index.js'),'migrate','deploy'],{env:process.env,encoding:'utf8'});assert.equal(r.status,0,r.stdout+r.stderr);
 policy=await db.financialPolicy.findUniqueOrThrow({where:{id:'platform'}});history=await db.financialPolicyChange.findMany();
 for(const id of ids)await db.member.create({data:{id,email:id+'@example.invalid',name:'Test',nickname:'Test',preferred_username:id,email_verified:true,status:'CONFIRMED'}});
 admin=await db.admin.create({data:{user_sub:adminId,email:adminId+'@example.invalid',name:'Test',role:'SUPER_ADMIN'}});
 await updateFinancialPolicy(db,admin,{expectedVersion:policy.version,platformFeeBps:2000,settlementHoldDays:7,reason:'Isolated selected policy test',confirmation:'정책 변경'});
 await db.creator.create({data:{user_id:owner}});plan=await db.membershipItem.create({data:{creator_id:owner,name:'Test membership',price:10000,benefits:'[]',billing_unit:'MONTH',level:1}});
 for(const member of [fan,late,renewing])await db.billingMethod.create({data:{member_id:member,billing_key_encrypted:'test',last_four:'1234',label:'Test',is_default:true}});
 app=await NestFactory.create(PlatformModule,{logger:false});app.setGlobalPrefix('api/v1');app.use(cookieParser());app.useGlobalInterceptors(new EnvelopeInterceptor());app.useGlobalFilters(new PlatformExceptionFilter());await app.listen(0,'127.0.0.1');origin=await app.getUrl();
});
after(async()=>{try{await app?.close();await db.marketingDelivery.deleteMany({where:{member_id:{in:ids}}});await db.memberConsent.deleteMany({where:{member_id:{in:ids}}});await db.accountPreference.deleteMany({where:{member_id:{in:ids}}});await db.revenueEntry.deleteMany({where:{creator_id:owner}});await db.checkoutOrder.deleteMany({where:{member_id:{in:ids}}});await db.subscription.deleteMany({where:{subscriber_id:{in:ids}}});await db.billingNotice.deleteMany({where:{member_id:{in:ids}}});await db.billingMethod.deleteMany({where:{member_id:{in:ids}}});await db.membershipItem.deleteMany({where:{creator_id:owner}});await db.creator.deleteMany({where:{user_id:owner}});await db.admin.deleteMany({where:{user_sub:adminId}});await db.memberNotification.deleteMany({where:{member_id:{in:ids}}});await db.memberSession.deleteMany({where:{member_id:{in:ids}}});await db.member.deleteMany({where:{id:{in:ids}}});if(policy){await db.financialPolicyChange.deleteMany({where:{version:{gt:policy.version}}});await db.financialPolicy.update({where:{id:'platform'},data:policy});}}finally{await db.$disconnect();await release?.();}});
test('beta empty allowlist fails closed; invitation normalization; test keys only; fixed renewal policy',()=>{
 const empty=signupPolicy(config);assert.equal(empty.inviteOnly,true);assert.throws(()=>empty.assertEmail('a@example.invalid'),code('SIGNUP_INVITE_REQUIRED'));
 const invited=signupPolicy(new ConfigService({BETA_MODE:'true',SIGNUP_EMAIL_ALLOWLIST:' A@EXAMPLE.INVALID '}));invited.assertEmail('a@example.invalid');assert.throws(()=>invited.assertEmail('b@example.invalid'),code('SIGNUP_INVITE_REQUIRED'));
 for(const pair of [['live_ck_x','live_sk_x'],['test_ck_x','live_sk_x'],['','']])assert.throws(()=>new PaymentProvider(new ConfigService({BETA_MODE:'true',TOSS_CLIENT_KEY:pair[0],TOSS_SECRET_KEY:pair[1]})).configForClient(),code('BETA_TEST_KEYS_REQUIRED'));
 assert.equal(new PaymentProvider(config).configForClient().clientKey,'test_ck_local');assert.deepEqual(renewalPolicy(config),{retries:3,hours:24});
});
test('general-content beta blocks even owner adult-media access and explicit adult publication',async()=>{
 assert.equal(await service.access({user_sub:owner,is_sensitive:true},owner),false);
 await assert.rejects(new PlatformStudioService(service).saveContent(owner,{isSensitive:true}),code('BETA_GENERAL_CONTENT_ONLY'));
});
test('refund boundary includes exactly 7 days, rejects later/unknown use; old contract not shortened',()=>{
 const paid=new Date('2026-01-01T00:00:00Z'),row={status:'paid',usage_tracking_started_at:paid,paid_at:paid,snapshot:{refundWindowDays:7}};
 assert.equal(unusedRefundReason(row,new Date('2026-01-08T00:00:00Z')),null);assert.equal(unusedRefundReason(row,new Date('2026-01-08T00:00:00.001Z')),'REFUND_WINDOW_EXPIRED');assert.equal(unusedRefundReason({...row,snapshot:{}},new Date('2027-01-01')),null);assert.equal(unusedRefundReason({...row,paid_at:null}),'REFUND_USAGE_UNKNOWN');assert.equal(unusedRefundReason({...row,content_accessed_at:paid}),'CONTENT_ALREADY_ACCESSED');
});
test('new paid contracts carry 7-day policy, fee20/hold7; DB expired refund blocks without provider call; in-progress refund resumes',async()=>{
 const row=await buy(fan),entry=await db.revenueEntry.findUniqueOrThrow({where:{order_id:row.id}});assert.equal(row.snapshot.refundWindowDays,7);assert.equal(row.snapshot.paymentEnvironment,'test');assert.equal(entry.fees,2000);assert.equal(entry.net,8000);assert.ok(entry.available_at-row.paid_at>=7*86400000-1000);
 assert.equal((await finance.refundEligibility(fan,row.id)).eligible,true);
 await db.checkoutOrder.update({where:{id:row.id},data:{paid_at:new Date(Date.now()-7*86400000-1000)}});
 assert.equal((await finance.refundEligibility(fan,row.id)).reason,'REFUND_WINDOW_EXPIRED');const before=cancels;await assert.rejects(finance.refund(fan,row.id),code('REFUND_WINDOW_EXPIRED'));assert.equal(cancels,before);
 await assert.rejects(finance.refund(stranger,row.id),code('ORDER_NOT_FOUND'));
 await db.checkoutOrder.update({where:{id:row.id},data:{status:'refunding'}});await finance.refund(fan,row.id);await finance.refund(fan,row.id);assert.equal(cancels,before+1);assert.equal((await db.revenueEntry.findUniqueOrThrow({where:{order_id:row.id}})).net,0);
});
test('test subscription never becomes real charge by swapping provider keys; unsettled funds unavailable; receipt validation and audit',async()=>{
 const row=await buy(late),entry=await db.revenueEntry.findUniqueOrThrow({where:{order_id:row.id}});await db.revenueEntry.update({where:{id:entry.id},data:{available_at:new Date(0)}});assert.equal((await finance.finance(owner)).summary.available,0);
 await assert.rejects(confirmSettlementReceipt(db,admin,entry.id,{reference:'test-receipt',reason:'Synthetic',amount:9000,receivedAt:new Date().toISOString()}),code('RECEIPT_NOT_ELIGIBLE'));
 const sub=await db.subscription.findFirstOrThrow({where:{subscriber_id:late}});await db.subscription.update({where:{id:sub.id},data:{ended_at:new Date(Date.now()-60000),next_billing_date:new Date(Date.now()-60000)}});
 const live=new PlatformFinanceService(service,{...provider,configForClient:()=>({clientKey:'live_ck_fixture'})},new ConfigService({RENEWAL_MAX_RETRIES:'3',RENEWAL_RETRY_HOURS:'24'}),{});const count=charges;await assert.rejects(live.renew(sub.id),code('PAYMENT_ENVIRONMENT_CHANGED'));assert.equal(charges,count);
 await db.checkoutOrder.update({where:{id:row.id},data:{snapshot:{...row.snapshot,paymentEnvironment:'live'}}});
 const receipt={reference:'isolated-bank-statement',reason:'Provider double only',amount:9000,receivedAt:new Date().toISOString()};
 await assert.rejects(confirmSettlementReceipt(db,{...admin,role:'ADMIN'},entry.id,receipt),code('ADMIN_PERMISSION_REQUIRED'));
 await assert.rejects(confirmSettlementReceipt(db,admin,entry.id,{...receipt,amount:1000}),code('INVALID_RECEIPT'));
 await confirmSettlementReceipt(db,admin,entry.id,receipt);await confirmSettlementReceipt(db,admin,entry.id,receipt);assert.equal((await finance.finance(owner)).summary.available,8000);
 assert.equal(await db.platformAuditLog.count({where:{action:'settlement.receipt_confirmed',entity_id:entry.id}}),1);
 await assert.rejects(finance.review(owner,{amount:9999}),code('INVALID_AMOUNT'));
 await assert.rejects(finance.payout(randomUUID()),code('BETA_PAYOUT_DISABLED'));
 assert.equal(isPayoutDay(new Date('2026-10-27T15:00:00Z')),true);assert.equal(isPayoutDay(new Date('2026-10-28T15:00:00Z')),false);
});
test('renewal first failure plus exactly three retries; repeated worker before due does not charge',async()=>{
 await buy(renewing);const sub=await db.subscription.findFirstOrThrow({where:{subscriber_id:renewing}}),past=new Date(Date.now()-72*3600000);await db.subscription.update({where:{id:sub.id},data:{ended_at:past,next_billing_date:past}});decline=true;const count=charges;
 await finance.renew(sub.id);await finance.renew(sub.id);assert.equal(charges,count+1);
 for(let i=1;i<=3;i++){await db.checkoutOrder.updateMany({where:{subscription_id:sub.id,status:'failed'},data:{retry_at:new Date(0)}});await finance.renew(sub.id);}
 assert.equal(charges,count+4);await finance.renew(sub.id);assert.equal(charges,count+4);assert.equal((await db.subscription.findUniqueOrThrow({where:{id:sub.id}})).auto_renew,false);decline=false;
});
test('marketing explicit versioned settings, transactional consent/withdrawal and only opted-in queue',async()=>{
 await assert.rejects(service.settings(recipient,{section:'notifications',contentAlert:true,messageAlert:true,marketingAlert:true}),code('POLICY_VERSION_CHANGED'));
 await service.settings(recipient,{section:'notifications',contentAlert:true,messageAlert:true,marketingAlert:true,marketingVersion:legal.signup().versions.marketing});
 const pref=await db.accountPreference.findUniqueOrThrow({where:{member_id:recipient}});assert.ok(pref.marketing_consent_id);
 const result=await marketing.queue(admin,{campaignId:'beta-'+recipient,subject:'초대 행사',body:'Test content',memberIds:[recipient,refusing]});assert.deepEqual([result.queued,result.skipped],[1,1]);
 await marketing.deliver();assert.equal(sent.filter(x=>x[4]===true).length,1);
 await marketing.queue(admin,{campaignId:'withdraw-'+recipient,subject:'Later',body:'Must be suppressed',memberIds:[recipient]});
 await Promise.all([marketing.unsubscribe(marketing.token(recipient)),marketing.unsubscribe(marketing.token(recipient))]);assert.equal((await db.accountPreference.findUniqueOrThrow({where:{member_id:recipient}})).marketing_alert,false);assert.equal(await db.memberConsent.count({where:{member_id:recipient,kind:'marketing-withdrawn'}}),1);
 const count=sent.filter(x=>x[4]===true).length;await marketing.deliver();assert.equal(sent.filter(x=>x[4]===true).length,count);
 assert.equal(await db.marketingDelivery.count({where:{member_id:recipient,kind:'campaign',status:'suppressed'}}),1);
});
test('public unsubscribe GET is non-mutating; POST idempotent, forged link rejected; no login required',async()=>{
 await choice(recipient,true);const token=marketing.token(recipient),path=origin+'/api/v1/marketing/unsubscribe?token='+token;
 const get=await fetch(path);assert.equal(get.status,200);assert.match(await get.text(),/form method="post"/);assert.equal((await db.accountPreference.findUniqueOrThrow({where:{member_id:recipient}})).marketing_alert,true);
 assert.equal((await fetch(path+'x')).status,400);
 const post=await fetch(path,{method:'POST'});assert.equal(post.status,201);assert.equal((await post.json()).success,true);assert.equal((await db.accountPreference.findUniqueOrThrow({where:{member_id:recipient}})).marketing_alert,false);
 const html=await fetch(path,{method:'POST',headers:{Accept:'text/html'}});assert.equal(html.status,201);assert.match(await html.text(),/수신거부를 처리했습니다/);assert.equal((await fetch(path)).status,200);
});
test('mail HTML escapes content, uses ad prefix/contact/unsubscribe headers, contains no em dash',()=>{
 const m=marketingMail('제목\u2014예시','<script>alert(1)</script>\u2014','https://beta.crefans.com/api/v1/marketing/unsubscribe?token=test',true);assert.match(m.subject,/^\(광고\)/);assert.doesNotMatch(m.html,/<script>/);assert.match(m.html,/khpark@crefans.com/);assert.equal(m.headers['List-Unsubscribe-Post'],'List-Unsubscribe=One-Click');assert.doesNotMatch(m.subject+m.text+m.html,/\u2014/);
});
test('two-year notice precedes overdue campaigns; uncertain delivery and interrupted claims are never retried',async()=>{
 await choice(recipient,true);
 const pref=await db.accountPreference.findUniqueOrThrow({where:{member_id:recipient}});
 await db.memberConsent.update({where:{id:pref.marketing_consent_id},data:{accepted_at:new Date('2023-01-01T00:00:00Z')}});
 await marketing.queue(admin,{campaignId:'reminder-'+recipient,subject:'Reminder boundary',body:'Synthetic',memberIds:[recipient]});
 await marketing.deliver();
 assert.equal(await db.marketingDelivery.count({where:{member_id:recipient,kind:'reminder',status:'accepted'}}),1);
 const key='campaign:reminder-'+recipient+':'+recipient;
  // Notices are sent before campaigns in the same batch, so the campaign goes out right after the due notice.
 const notice=await db.marketingDelivery.findFirstOrThrow({where:{member_id:recipient,kind:'reminder',status:'accepted'}}),campaign=await db.marketingDelivery.findUniqueOrThrow({where:{dedupe_key:key}});
 assert.equal(campaign.status,'accepted');assert.ok(notice.completed_at<=campaign.completed_at);
 await marketing.queue(admin,{campaignId:'uncertain-'+recipient,subject:'SMTP ambiguity',body:'Synthetic',memberIds:[recipient]});
 const send=mail.sendMarketing;let attempts=0;
 mail.sendMarketing=async()=>{attempts++;throw Error('Synthetic SMTP connection loss');};
 try{await assert.rejects(marketing.deliver(),/Synthetic SMTP/);await marketing.deliver();assert.equal(attempts,1);}finally{mail.sendMarketing=send;}
 const uncertain=await db.marketingDelivery.findUniqueOrThrow({where:{dedupe_key:'campaign:uncertain-'+recipient+':'+recipient}});assert.equal(uncertain.status,'uncertain');
 await db.marketingDelivery.update({where:{id:uncertain.id},data:{status:'sending',started_at:new Date(Date.now()-16*60000)}});
 const count=sent.length;await assert.rejects(marketing.deliver(),code('MARKETING_DELIVERY_UNCERTAIN'));await marketing.deliver();assert.equal(sent.length,count);
});
test('unsubscribe transaction wins over a claimed but not yet sent campaign',async()=>{
 await marketing.queue(admin,{campaignId:'race-'+recipient,subject:'Race',body:'Must not send',memberIds:[recipient]});
 let release,locked;const gate=new Promise(r=>release=r),ready=new Promise(r=>locked=r);
 const withdrawal=db.$transaction(async tx=>{await tx.$queryRaw`SELECT id FROM members WHERE id=${recipient} FOR UPDATE`;locked();await gate;await recordMarketingChoice(tx,recipient,false,'race-test',null);},{timeout:10000});
 await ready;const delivery=marketing.deliver();
 try{for(let i=0;i<100;i++){const row=await db.marketingDelivery.findUniqueOrThrow({where:{dedupe_key:'campaign:race-'+recipient+':'+recipient}});if(row.status==='sending')break;if(i===99)assert.fail('worker did not claim');await new Promise(r=>setTimeout(r,10));}}finally{release();}
 await Promise.all([withdrawal,delivery]);
 assert.equal((await db.marketingDelivery.findUniqueOrThrow({where:{dedupe_key:'campaign:race-'+recipient+':'+recipient}})).status,'suppressed');
 assert.equal(sent.some(x=>x[1]==='Race'),false);
});
