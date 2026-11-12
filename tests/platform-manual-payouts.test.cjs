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
 await db.member.create({data:{id:creator,email:`creator-${tag}@manual.test.invalid`,password_hash:'x',nickname:'수동'+tag,name:'수동 지급 검증',preferred_username:'mp'+tag,email_verified:true,status:'CONFIRMED'}});await db.creator.create({data:{is_verified:true,user_id:creator,display_name:'수동 '+tag,handle:'mp'+tag}});
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

// 2026-11-11: the worker retries a waiting transfer every minute; the manual-pending audit is written once per payout.
test('a waiting manual transfer is audited once however often the worker retries it',async()=>{
 const w=await db.withdrawalRequest.create({data:{creator_id:creator,request_key:randomUUID(),account_id:account.id,account_label:'Synthetic',amount:100000,status:'processing'}});
 for(let i=0;i<3;i++)await finance.payout(w.id,WED);
 assert.equal((await db.withdrawalRequest.findUniqueOrThrow({where:{id:w.id}})).status,'processing','still waits for the operator');
 assert.equal(await db.platformAuditLog.count({where:{entity_id:w.id,action:'provider.manual_pending'}}),1);
 await db.withdrawalRequest.update({where:{id:w.id},data:{status:'rejected'}});});

test('a request made on the payout Wednesday itself waits for the next week (Tuesday 23:59 KST cutoff)',async()=>{
 const w=await db.withdrawalRequest.create({data:{creator_id:creator,request_key:randomUUID(),account_id:account.id,account_label:'Synthetic',amount:10000,status:'requested',created_at:WED}});
 await assert.rejects(finance.manualResult(admins[0],w.id,{result:'paid',reference:'BANK-CUT',transferredAt:WED.toISOString()},WED),code('PAYOUT_SCHEDULED'));
 assert.equal((await db.withdrawalRequest.findUniqueOrThrow({where:{id:w.id}})).status,'requested');
 await db.withdrawalRequest.delete({where:{id:w.id}});});

test('a processing withdrawal can be rejected with a reason, which returns the amount to the available balance',async()=>{
 const w=await db.withdrawalRequest.create({data:{creator_id:creator,request_key:randomUUID(),account_id:account.id,account_label:'Synthetic',amount:10000,status:'processing'}});
 const before=(await finance.finance(creator)).summary.available;
 assert.equal((await api(`/admin/withdrawals/${w.id}/manual-result`,'finance',{result:'rejected'})).errorCode,'INVALID_MANUAL_RESULT','a reject needs a reason');
 assert.equal((await api(`/admin/withdrawals/${w.id}/manual-result`,'finance',{result:'rejected',reason:'예금주 불일치'})).status,201);
 assert.equal((await db.withdrawalRequest.findUniqueOrThrow({where:{id:w.id}})).status,'rejected');assert.equal((await finance.finance(creator)).summary.available,before+10000);});

// 2026-11-07: the manual reject reason fits withdrawal_requests.note VARCHAR(191) together with its prefix.
test('a manual reject reason is limited to what the note column holds after its prefix',async()=>{
 const w=await db.withdrawalRequest.create({data:{creator_id:creator,request_key:randomUUID(),account_id:account.id,account_label:'Synthetic',amount:1000,status:'processing'}});
 assert.equal((await api(`/admin/withdrawals/${w.id}/manual-result`,'finance',{result:'rejected',reason:'가'.repeat(181)})).errorCode,'INVALID_INPUT','181 characters would not fit');
 assert.equal((await db.withdrawalRequest.findUniqueOrThrow({where:{id:w.id}})).status,'processing');
 assert.equal((await api(`/admin/withdrawals/${w.id}/manual-result`,'finance',{result:'rejected',reason:'가'.repeat(180)})).status,201);
 const row=await db.withdrawalRequest.findUniqueOrThrow({where:{id:w.id}});assert.equal(row.status,'rejected');assert.equal(row.note.length,191);});

// 2026-11-07: the console shows the reject button only where the server marks the row rejectable.
test('the withdrawal list marks only requested rows of a creator with a negative balance as rejectable',async()=>{
 const available=(await finance.finance(creator)).summary.available;
 const ok=await db.withdrawalRequest.create({data:{creator_id:creator,request_key:randomUUID(),account_id:account.id,account_label:'Synthetic',amount:1000,status:'processing'}});
 let list=await api('/admin/withdrawals?status=open','viewer');assert.equal(list.status,200);assert.equal(list.data.items.find(w=>w.id===ok.id).rejectable,false,'a non-negative balance is not rejectable');
 const w=await db.withdrawalRequest.create({data:{creator_id:creator,request_key:randomUUID(),account_id:account.id,account_label:'Synthetic',amount:available,status:'requested'}});
 list=await api('/admin/withdrawals?status=open','viewer');assert.deepEqual([list.data.items.find(x=>x.id===w.id).rejectable,list.data.items.find(x=>x.id===ok.id).rejectable],[true,false],'requested above the balance only');
 assert.equal((await api(`/admin/withdrawals/${w.id}/reject`,'viewer',{reason:'환불로 잔액 부족'})).status,403);
 assert.equal((await api(`/admin/withdrawals/${w.id}/reject`,'finance',{reason:'환불로 잔액 부족'})).status,201);
 list=await api('/admin/withdrawals','viewer');assert.equal(list.data.items.find(x=>x.id===w.id).rejectable,false);
 await db.withdrawalRequest.deleteMany({where:{id:{in:[ok.id,w.id]}}});});

// 2026-11-10: weekly payout list and audited full-number reveal for the operator's manual bank transfer.
test('payout list shows the transfer amount per creator without the account number; reveal is limited and audited',async()=>{
 await db.withdrawalRequest.updateMany({where:{creator_id:creator,status:{in:['requested','processing']}},data:{status:'rejected'}});
 assert.equal((await api(`/admin/settlement-accounts/${account.id}/reveal`,'finance',{})).errorCode,'NO_OPEN_PAYOUT','no open payout, no number');
 const {nextPayoutCutoff}=require('../dist/src/platform/beta-policy'),cutoff=nextPayoutCutoff();
 const w1=await db.withdrawalRequest.create({data:{creator_id:creator,request_key:randomUUID(),account_id:account.id,account_label:'Synthetic',amount:70000,status:'requested',created_at:new Date(cutoff.getTime()-8*86400000)}});
 // 2026-11-11: a request after the batch cutoff and a payout to an unverified account are listed apart and kept out of the total.
 const late=await db.withdrawalRequest.create({data:{creator_id:creator,request_key:randomUUID(),account_id:account.id,account_label:'Synthetic',amount:5000,status:'requested',created_at:new Date(cutoff.getTime()+60000)}});
 const unverified=await db.settlementAccount.create({data:{creator_id:creator,bank:'Synthetic',holder_alias:'미확인',last_four:'9999',account_encrypted:'x',verified:false}});
 const held=await db.withdrawalRequest.create({data:{creator_id:creator,request_key:randomUUID(),account_id:unverified.id,account_label:'Synthetic',amount:9000,status:'processing'}});
 const w2=await db.withdrawalRequest.create({data:{creator_id:creator,request_key:randomUUID(),account_id:account.id,account_label:'Synthetic',amount:30000,status:'processing'}});
 const res=await fetch(origin+'/api/v1/admin/payouts/due',{headers:{Origin:'https://beta.crefans.com',cookie:cookies.viewer}});assert.equal(res.status,200);assert.match(res.headers.get('cache-control')||'',/no-store/);
 const list=(await res.json()).data;assert.equal(JSON.stringify(list).includes('110123455678'),false,'no full number in the list');assert.equal(list.beans,false,'no bean rows without bean permission');
 const mine=list.items.filter(i=>i.creatorId===creator),due=mine.filter(i=>i.due);assert.deepEqual(due.map(i=>i.amount).sort(),[30000,70000]);assert.equal(due[0].creatorName,'수동 '+tag);assert.equal(due[0].account.lastFour,'5678');assert.equal(due[0].account.verified,true);
 assert.equal(mine.find(i=>i.id===late.id).holdReason,'next-batch');assert.equal(mine.find(i=>i.id===held.id).holdReason,'account-unverified');assert.equal(new Date(list.batchCutoff).getTime(),cutoff.getTime());
 const group=list.creators.find(g=>g.creatorId===creator);assert.equal(group.amount,100000,'only this batch on a verified account is in the transfer total');assert.equal(group.count,2);
 assert.equal((await api(`/admin/settlement-accounts/${account.id}/reveal`,'viewer',{})).status,403,'view permission cannot reveal');
 const before=await db.platformAuditLog.count({where:{entity_id:account.id,action:'account.number_revealed'}});
 const shown=await fetch(origin+`/api/v1/admin/settlement-accounts/${account.id}/reveal`,{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://beta.crefans.com',cookie:cookies.finance},body:'{}'});
 assert.equal(shown.status,200);assert.match(shown.headers.get('cache-control')||'',/no-store/);assert.equal((await shown.json()).data.accountNumber,'110123455678');
 const audit=await db.platformAuditLog.findMany({where:{entity_id:account.id,action:'account.number_revealed'}});assert.equal(audit.length,before+1);assert.equal(JSON.stringify(audit).includes('110123455678'),false,'the number is not written to the audit log');
 await db.withdrawalRequest.deleteMany({where:{id:{in:[w1.id,w2.id,late.id,held.id]}}});await db.settlementAccount.delete({where:{id:unverified.id}});});

// 2026-11-12 user decision (ask-me): the verified badge marks a signed partnership contract and only partners withdraw.
// Accounts and the PIN stay open; a request already accepted before the badge is removed is held, not rejected.
test('without the partner badge: PIN check and request are refused, open requests are held, paid recording is refused, reject still works',async()=>{
 assert.equal((await finance.finance(creator)).payoutPartner,true);
 await db.creator.update({where:{user_id:creator},data:{is_verified:false}});
 try{
  assert.equal((await api('/studio/finance','creator')).data.payoutPartner,false,'the studio shows the contract notice');
  await assert.rejects(finance.verifyPin(creator,{amount:100000,accountId:account.id,pin:'000000'}),code('PARTNER_CONTRACT_REQUIRED'));
  await assert.rejects(finance.requestWithdrawal(creator,{requestId:randomUUID(),amount:100000,accountId:account.id,authorizationId:randomUUID()}),code('PARTNER_CONTRACT_REQUIRED'));
  const http=await api('/studio/withdraw/verify','creator',{amount:100000,accountId:account.id,pin:'000000'});assert.equal(http.status,403);assert.equal(http.errorCode,'PARTNER_CONTRACT_REQUIRED');assert.match(http.errorMessage,/파트너 계약/);
  const w=await db.withdrawalRequest.create({data:{creator_id:creator,request_key:randomUUID(),account_id:account.id,account_label:'Synthetic',amount:1000,status:'requested',created_at:new Date(WED.getTime()-8*86400000)}});
  await finance.payout(w.id,WED);// the worker path holds it quietly
  assert.equal((await db.withdrawalRequest.findUniqueOrThrow({where:{id:w.id}})).status,'requested','held, not claimed');
  await assert.rejects(finance.manualResult(admins[0],w.id,{result:'paid',reference:'BANK-P',transferredAt:WED.toISOString()},WED),code('PARTNER_CONTRACT_REQUIRED'));
  assert.equal((await db.withdrawalRequest.findUniqueOrThrow({where:{id:w.id}})).status,'requested');
  const list=(await api('/admin/payouts/due','viewer')).data;const row=list.items.find(i=>i.id===w.id);assert.equal(row.holdReason,'partner-unverified');assert.equal(row.due,false);
  assert.equal(list.creators.find(g=>g.creatorId===creator)?.amount||0,0,'held rows stay out of the transfer total');
  await finance.manualResult(admins[0],w.id,{result:'rejected',reason:'파트너 계약 종료'},WED);
  assert.equal((await db.withdrawalRequest.findUniqueOrThrow({where:{id:w.id}})).status,'rejected','an operator can still reject');
  await db.withdrawalRequest.delete({where:{id:w.id}});
 }finally{await db.creator.update({where:{user_id:creator},data:{is_verified:true}});}
 // with the badge back the same checks pass the partner gate (they fail later on PIN or authorization instead)
 await assert.rejects(finance.requestWithdrawal(creator,{requestId:randomUUID(),amount:100000,accountId:account.id,authorizationId:randomUUID()}),code('AUTHORIZATION_EXPIRED'));
});
