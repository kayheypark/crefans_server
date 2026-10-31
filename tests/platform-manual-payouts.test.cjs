require('reflect-metadata');require('dotenv').config({path:'.local/platform.env',override:true});
// 2026-10-31 user decision: the beta keeps its invite/content rules while real payments (LIVE_PAYMENTS_ENABLED) and
// operator-recorded payouts (MANUAL_PAYOUTS_ENABLED) open by switch. No bank API: accounts are confirmed and transfers
// recorded by an operator in the console, through the same withdrawal checks as a bank payout.
process.env.BETA_MODE='true';process.env.MANUAL_PAYOUTS_ENABLED='true';
const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),{randomUUID,randomBytes}=require('node:crypto'),{PrismaClient}=require('@prisma/client'),{ConfigService}=require('@nestjs/config');
const source=process.env.DATABASE_URL;assert.match(source||'',/@127\.0\.0\.1:3307\/crefans_platform_dev$/);const url=new URL(source);url.pathname='/crefans_platform_e2e';process.env.DATABASE_URL=url.toString();
const {NestFactory}=require('@nestjs/core'),{PlatformModule}=require('../dist/src/platform/module'),{cookieParser}=require('../dist/src/platform/middleware'),{EnvelopeInterceptor,PlatformExceptionFilter}=require('../dist/src/platform/http'),{digest}=require('../dist/src/auth/local/credentials'),{requestContext}=require('../dist/src/platform/request-context');
const {PlatformFinanceService}=require('../dist/src/platform/finance.service'),{PaymentProvider}=require('../dist/src/platform/payment-provider'),{assertBetaPayment}=require('../dist/src/platform/beta-policy');
const db=new PrismaClient(),tag=randomBytes(4).toString('hex'),creator=randomUUID(),admins=[],cookies={};let app,origin,release,finance,account;
const WED=(()=>{const d=new Date();d.setUTCHours(1,0,0,0);do{d.setUTCDate(d.getUTCDate()+1);}while(new Date(d.getTime()+9*3600000).getUTCDay()!==3);return d;})();
const code=c=>e=>e.getResponse?.().code===c;
async function api(path,actor,body,method=body?'POST':'GET'){const res=await fetch(origin+'/api/v1'+path,{method,headers:{'Content-Type':'application/json',Origin:'https://beta.crefans.com',...(actor?{cookie:cookies[actor]}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});return{status:res.status,...await res.json()};}
before(async()=>{release=await require('./e2e-db-lock.cjs').lockE2EDatabase(source);
 const r=require('node:child_process').spawnSync(process.execPath,[require.resolve('prisma/build/index.js'),'migrate','deploy'],{env:process.env,encoding:'utf8'});assert.equal(r.status,0,r.stdout+r.stderr);
 await db.member.create({data:{id:creator,email:`creator-${tag}@manual.test.invalid`,password_hash:'x',nickname:'수동'+tag,name:'수동 지급 검증',preferred_username:'mp'+tag,email_verified:true,status:'CONFIRMED'}});await db.creator.create({data:{user_id:creator,display_name:'수동 '+tag,handle:'mp'+tag}});
 const token='la.'+randomBytes(32).toString('base64url');cookies.creator='access_token='+token;await db.memberSession.create({data:{member_id:creator,access_hash:digest(token),refresh_hash:digest(randomUUID()),access_until:new Date(Date.now()+3600000),expires_at:new Date(Date.now()+3600000)}});
 for(const [name,permissions] of [['finance',{revenue:{view:true,create:true}}],['viewer',{revenue:{view:true}}]]){const a=await db.admin.create({data:{user_sub:randomUUID(),name,email:randomUUID()+'@manual.test.invalid',role:'ADMIN',permissions}});admins.push(a);cookies[name]=await require('./admin-session.cjs')(db,a.id);}
 app=await NestFactory.create(PlatformModule,{logger:false});app.setGlobalPrefix('api/v1');app.use(cookieParser());app.use((req,res,next)=>requestContext.run({ip:'127.0.0.1',peerIp:'127.0.0.1',requestId:randomUUID()},next));app.useGlobalInterceptors(new EnvelopeInterceptor());app.useGlobalFilters(new PlatformExceptionFilter());await app.listen(0,'127.0.0.1');origin=await app.getUrl();
 finance=app.get(PlatformFinanceService);
 account=await db.settlementAccount.create({data:{creator_id:creator,bank:'Synthetic',holder_alias:'수동 지급 검증',last_four:'5678',account_encrypted:app.get(PaymentProvider).encrypt('110123455678'),verified:false}});
 const plan=await db.membershipItem.create({data:{creator_id:creator,name:'수동 지급 검증',price:150000,billing_unit:'MONTH',benefits:''}});
 const order=await db.checkoutOrder.create({data:{member_id:creator,membership_id:plan.id,snapshot:{name:'수동 지급 검증',paymentEnvironment:'live'},amount:150000,status:'paid',idempotency_key:randomUUID(),expires_at:new Date(),paid_at:new Date(Date.now()-20*86400000)}});
 await db.revenueEntry.create({data:{creator_id:creator,order_id:order.id,title:'수동 지급 검증',gross:150000,fees:30000,net:120000,available_at:new Date(Date.now()-10*86400000),receipt_confirmed_at:new Date(),received_amount:120000}});});
after(async()=>{await app?.close();const plans=(await db.membershipItem.findMany({where:{creator_id:creator},select:{id:true}})).map(p=>p.id);const ws=(await db.withdrawalRequest.findMany({where:{creator_id:creator},select:{id:true}})).map(w=>w.id);
 await db.platformAuditLog.deleteMany({where:{entity_id:{in:[...ws,account?.id,creator].filter(Boolean)}}});await db.withdrawalRequest.deleteMany({where:{creator_id:creator}});await db.revenueEntry.deleteMany({where:{creator_id:creator}});await db.checkoutOrder.deleteMany({where:{membership_id:{in:plans}}});await db.membershipItem.deleteMany({where:{id:{in:plans}}});await db.settlementAccount.deleteMany({where:{creator_id:creator}});
 await db.creator.deleteMany({where:{user_id:creator}});await db.memberSession.deleteMany({where:{member_id:creator}});await db.admin.deleteMany({where:{id:{in:admins.map(a=>a.id)}}});await db.member.deleteMany({where:{id:creator}});await db.$disconnect();await release?.();});

test('payment keys: beta stays on test keys unless LIVE_PAYMENTS_ENABLED, which then requires live keys',()=>{
 const cfg=v=>new ConfigService({BETA_MODE:'true',...v});
 assert.doesNotThrow(()=>assertBetaPayment(cfg({TOSS_CLIENT_KEY:'test_ck_a',TOSS_SECRET_KEY:'test_sk_a'})));
 assert.throws(()=>assertBetaPayment(cfg({TOSS_CLIENT_KEY:'live_ck_a',TOSS_SECRET_KEY:'live_sk_a'})),code('BETA_TEST_KEYS_REQUIRED'),'live keys stay blocked without the switch');
 assert.doesNotThrow(()=>assertBetaPayment(cfg({LIVE_PAYMENTS_ENABLED:'true',TOSS_CLIENT_KEY:'live_ck_a',TOSS_SECRET_KEY:'live_sk_a'})));
 assert.throws(()=>assertBetaPayment(cfg({LIVE_PAYMENTS_ENABLED:'true',TOSS_CLIENT_KEY:'test_ck_a',TOSS_SECRET_KEY:'live_sk_a'})),code('LIVE_KEYS_REQUIRED'),'no mixed keys');});

test('accounts are confirmed by an operator: the creator check explains the manual review; version and permission enforced',async()=>{
 const self=await api(`/studio/accounts/${account.id}/verify`,'creator',{});assert.equal(self.status,409);assert.equal(self.errorCode,'MANUAL_ACCOUNT_REVIEW');
 assert.equal((await api('/admin/me','finance')).data.manualPayouts,true);
 const list=await api('/admin/settlement-accounts','viewer');assert.equal(list.status,200);const row=list.data.find(a=>a.id===account.id);assert.ok(row);assert.equal(row.lastFour,'5678');assert.equal(JSON.stringify(row).includes('110123455678'),false,'no full account number in the list');
 assert.equal((await api(`/admin/settlement-accounts/${account.id}/verify`,'viewer',{expectedVersion:1,reason:'통장 사본 확인'})).status,403);
 assert.equal((await api(`/admin/settlement-accounts/${account.id}/verify`,'finance',{expectedVersion:9,reason:'통장 사본 확인'})).errorCode,'ACCOUNT_CHANGED');
 assert.equal((await api(`/admin/settlement-accounts/${account.id}/verify`,'finance',{expectedVersion:1,reason:'통장 사본 확인'})).status,201);
 assert.equal((await db.settlementAccount.findUniqueOrThrow({where:{id:account.id}})).verified,true);
 assert.equal((await api(`/admin/settlement-accounts/${account.id}/verify`,'finance',{expectedVersion:1,reason:'다시'})).errorCode,'ACCOUNT_CHANGED','a confirmed account is not confirmed twice');
 assert.equal(await db.platformAuditLog.count({where:{entity_id:account.id,action:'account.manual_verified'}}),1);});

test('membership withdrawal: claimed on Wednesday with the usual checks, then the operator transfer is recorded once',async()=>{
 const w=await db.withdrawalRequest.create({data:{creator_id:creator,request_key:randomUUID(),account_id:account.id,account_label:'Synthetic',amount:100000,status:'requested'}});
 const today=await api(`/admin/withdrawals/${w.id}/manual-result`,'finance',{result:'paid',reference:'BANK-1'});
 if(new Date(Date.now()+9*3600000).getUTCDay()!==3)assert.equal(today.errorCode,'PAYOUT_SCHEDULED','outside Wednesday a new request is not claimed');
 assert.equal((await api(`/admin/withdrawals/${w.id}/manual-result`,'viewer',{result:'paid',reference:'BANK-1'})).status,403);
 const admin=admins[0];
 await assert.rejects(finance.manualResult(admin,w.id,{result:'paid'},WED),code('INVALID_MANUAL_RESULT'),'paid needs the transfer reference');
 await finance.manualResult(admin,w.id,{result:'paid',reference:'BANK-REF-7',transferredAt:WED.toISOString()},WED);
 const row=await db.withdrawalRequest.findUniqueOrThrow({where:{id:w.id}});assert.equal(row.status,'paid');assert.match(row.note,/수동 이체 완료 · BANK-REF-7/);
 assert.equal((await api(`/admin/withdrawals/${w.id}/manual-result`,'finance',{result:'paid',reference:'BANK-REF-7'})).errorCode,'WITHDRAWAL_NOT_PROCESSING','recorded once');
 assert.equal(await db.platformAuditLog.count({where:{entity_id:w.id,action:'withdrawal.manual_result'}}),1);
 assert.equal((await finance.finance(creator)).summary.paid,100000);});

test('a processing withdrawal can be rejected with a reason, which returns the amount to the available balance',async()=>{
 const w=await db.withdrawalRequest.create({data:{creator_id:creator,request_key:randomUUID(),account_id:account.id,account_label:'Synthetic',amount:10000,status:'processing'}});
 const before=(await finance.finance(creator)).summary.available;
 assert.equal((await api(`/admin/withdrawals/${w.id}/manual-result`,'finance',{result:'rejected'})).errorCode,'INVALID_MANUAL_RESULT','a reject needs a reason');
 assert.equal((await api(`/admin/withdrawals/${w.id}/manual-result`,'finance',{result:'rejected',reason:'예금주 불일치'})).status,201);
 assert.equal((await db.withdrawalRequest.findUniqueOrThrow({where:{id:w.id}})).status,'rejected');assert.equal((await finance.finance(creator)).summary.available,before+10000);});
