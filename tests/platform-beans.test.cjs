require('reflect-metadata');require('dotenv').config({path:'.local/platform.env',override:true});
// Payout days relative to the real clock: lots created during the test get release_at=now, so a fixed
// calendar date would fall behind them once that day passes. Next KST Wednesday 09:00 (00:00Z) after now.
const WED=(()=>{const d=new Date();d.setUTCHours(0,0,0,0);do{d.setUTCDate(d.getUTCDate()+1);}while(new Date(d.getTime()+9*3600000).getUTCDay()!==3);return d.toISOString();})(),TUE=new Date(Date.parse(WED)-86400000).toISOString(),THU=new Date(Date.parse(WED)+86400000).toISOString();
const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('crypto'),{PrismaClient}=require('@prisma/client'),{ConfigService}=require('@nestjs/config');
assert.equal(process.env.CREFANS_E2E,'true');const source=process.env.DATABASE_URL;assert.match(source,/@127\.0\.0\.1:3307\/crefans_platform_dev$/);const url=new URL(source);url.pathname='/crefans_platform_e2e';process.env.DATABASE_URL=url.toString();
const {BeansService}=require('../dist/src/platform/beans.service'),{PlatformService}=require('../dist/src/platform/service'),{PlatformFinanceService}=require('../dist/src/platform/finance.service'),{hashPassword}=require('../dist/src/auth/local/credentials');
const db=new PrismaClient(),ids=Array.from({length:4},()=>randomUUID()),[fan,creator,stranger,adminId]=ids,pg=new Map();let release,charges=0,transfers=0,lost=false,bankStatus='paid',account,firstCharge;
const config=new ConfigService({BEAN_LEDGER_ENABLED:'true',BEAN_LIVE_PAYMENTS_APPROVED:'true',BANK_PAYOUTS_ENABLED:'true',BETA_MODE:'false'}),provider={configForClient:()=>({clientKey:'live_ck_synthetic'}),decrypt:x=>x,encrypt:x=>x,lookup:async id=>pg.get(id)||null,confirm:async(key,o)=>{charges++;const r={status:'DONE',currency:'KRW',totalAmount:o.amount,balanceAmount:o.amount,paymentKey:key,orderId:o.id,approvedAt:new Date(Date.now()-8*86400000).toISOString()};pg.set(o.id,r);if(lost){lost=false;throw Error('Synthetic lost response');}return r;}},bank={transfer:async(...args)=>{transfers++;return{status:bankStatus};}},service=new PlatformService(db,undefined,config),finance=new PlatformFinanceService(service,provider,config,bank),beans=new BeansService(service,finance,provider,bank,config),tipNow=beans.tip.bind(beans),admin={is_active:true,role:'SUPER_ADMIN',user_sub:adminId},code=c=>e=>e.getResponse?.().code===c;
// Received beans now wait 7 days from the tip (beanPolicy.tipHoldDays). Payout tests below run as if that week passed: each tip's lots move back 7 days, keeping any later source maturity they test.
beans.tip=async(member,creator,input)=>{const before=new Date();const r=await tipNow(member,creator,input);const lots=await db.beanLot.findMany({where:{member_id:creator,bucket:{in:['earned-paid','earned-promotion']},created_at:{gte:new Date(before.getTime()-1000)}}});for(const lot of lots)await db.beanLot.update({where:{id:lot.id},data:{release_at:new Date(lot.release_at.getTime()-7*86400000)}});return r;};
const charge=async(q)=>{const o=await beans.createCharge(fan,{quantity:q,requestId:randomUUID()});await beans.confirm(fan,o.id,{paymentKey:'synthetic-'+o.id,orderId:o.id,amount:o.amount});return db.beanCharge.findUniqueOrThrow({where:{id:o.id}});};
async function receipt(o){await beans.receipt(admin,o.id,{amount:o.amount*.97,reference:'synthetic-bank-'+o.id,reason:'Isolated provider double',receivedAt:new Date().toISOString()});}
async function payout(q=1000){const input={quantity:q,accountId:account.id},auth=await beans.authorize(creator,{...input,pin:'123456'});return beans.requestPayout(creator,{...input,authorizationId:auth.authorizationId,requestId:randomUUID()});}
before(async()=>{release=await require('./e2e-db-lock.cjs').lockE2EDatabase(source);const r=require('child_process').spawnSync(process.execPath,[require.resolve('prisma/build/index.js'),'migrate','deploy'],{env:process.env,encoding:'utf8'});assert.equal(r.status,0,r.stdout+r.stderr);for(const id of ids)await db.member.create({data:{id,email:id+'@example.invalid',name:'Synthetic',nickname:'Synthetic',preferred_username:id,email_verified:true}});await db.creator.create({data:{user_id:creator}});account=await db.settlementAccount.create({data:{creator_id:creator,bank:'Synthetic',holder_alias:'Synthetic',last_four:'1234',account_encrypted:'synthetic',verified:true}});await db.withdrawalCredential.create({data:{creator_id:creator,pin_hash:await hashPassword('withdrawal-pin:123456')}});});
after(async()=>{try{const wallets=await db.beanWallet.findMany({where:{owner_key:{in:ids.map(id=>'member:'+id)}}});const accounts=await db.beanAccount.findMany({where:{wallet_id:{in:wallets.map(w=>w.id)}}});const balance=accounts.reduce((s,a)=>s+a.balance,BigInt(0));const orders=await db.beanCharge.findMany({where:{member_id:{in:ids}}});const reserved=orders.filter(o=>['pending','processing'].includes(o.status)).reduce((s,o)=>s+o.quantity,0);const movements=await db.beanMovement.findMany({where:{OR:[{actor_id:{in:ids}},{reference_id:{in:orders.map(o=>o.id)}},{id:{in:(await db.beanEntry.findMany({where:{account_id:{in:accounts.map(a=>a.id)}}})).map(e=>e.movement_id)}}]}});const mids=movements.map(m=>m.id);await db.$transaction(async tx=>{await tx.$queryRaw`SELECT id FROM bean_wallets WHERE id=${'bean-company'} FOR UPDATE`;await tx.beanAccount.update({where:{id:'bean-stock'},data:{balance:{increment:balance+BigInt(reserved)}}});const ra=await tx.beanAccount.findUnique({where:{wallet_id_bucket:{wallet_id:'bean-company',bucket:'charge-reserved'}}});if(ra)await tx.beanAccount.update({where:{id:ra.id},data:{balance:{decrement:BigInt(reserved)}}});await tx.beanEntry.deleteMany({where:{movement_id:{in:mids}}});await tx.beanMovement.deleteMany({where:{id:{in:mids}}});});const payouts=await db.beanPayout.findMany({where:{creator_id:{in:ids}}});await db.beanPayoutAllocation.deleteMany({where:{payout_id:{in:payouts.map(p=>p.id)}}});await db.beanPayout.deleteMany({where:{creator_id:{in:ids}}});await db.beanWithdrawalAuthorization.deleteMany({where:{creator_id:{in:ids}}});const tips=await db.beanTip.findMany({where:{sender_id:{in:ids}}});await db.beanTipAllocation.deleteMany({where:{tip_id:{in:tips.map(t=>t.id)}}});await db.beanTip.deleteMany({where:{sender_id:{in:ids}}});await db.beanLot.deleteMany({where:{member_id:{in:ids}}});await db.beanPromotion.deleteMany({where:{member_id:{in:ids}}});await db.beanCharge.deleteMany({where:{member_id:{in:ids}}});await db.beanAccount.deleteMany({where:{wallet_id:{in:wallets.map(w=>w.id)}}});await db.beanWallet.deleteMany({where:{id:{in:wallets.map(w=>w.id)}}});await db.withdrawalCredential.deleteMany({where:{creator_id:{in:ids}}});await db.settlementAccount.deleteMany({where:{creator_id:{in:ids}}});await db.creator.deleteMany({where:{user_id:{in:ids}}});await db.member.deleteMany({where:{id:{in:ids}}});}finally{await db.$disconnect();await release?.();}});
test('disabled feature rejects; unknown/unauthorized charge and tampered amounts cannot mint beans',async()=>{await assert.rejects(new BeansService(service,finance,provider,bank,new ConfigService({})).wallet(fan),code('BEANS_DISABLED'));const o=await beans.createCharge(fan,{quantity:1500,requestId:randomUUID()});firstCharge=o;assert.equal(o.amount,165000);assert.equal((await beans.paymentWindow(fan,o.id)).amount,165000);await assert.rejects(beans.confirm(fan,o.id,{paymentKey:'old-price',orderId:o.id,amount:150000}),code('PAYMENT_MISMATCH'));await assert.rejects(beans.charge(stranger,o.id),code('BEAN_CHARGE_NOT_FOUND'));await assert.rejects(beans.confirm(fan,o.id,{paymentKey:'tamper',orderId:o.id,amount:1}),code('PAYMENT_MISMATCH'));assert.equal(charges,0);});
test('PG lost response recovers from same order exactly once and reservations are conserved',async()=>{lost=true;await assert.rejects(beans.confirm(fan,firstCharge.id,{paymentKey:'synthetic-first',orderId:firstCharge.id,amount:firstCharge.amount}),/Synthetic/);assert.equal(charges,1);await beans.reconcileCharge(firstCharge.id);await beans.confirm(fan,firstCharge.id,{paymentKey:'synthetic-first',orderId:firstCharge.id,amount:firstCharge.amount});assert.equal(charges,1);assert.equal((await beans.wallet(fan)).accounts.find(a=>a.bucket==='purchased').balance,'1500');assert.equal(await db.beanLot.count({where:{charge_id:firstCharge.id}}),1);const wallet=await beans.wallet(fan);assert.equal(wallet.spendableBeans,1500);assert.deepEqual(wallet.spendableBreakdown,{purchased:1500,promotion:0});assert.equal(wallet.withdrawableBeans,0);});
test('promotion first; receipt lineage preserved; duplicate support once; self-support and unavailable balances rejected',async()=>{await assert.rejects(beans.grant({...admin,role:'ADMIN'},{memberId:fan,quantity:100,requestId:randomUUID(),reason:'Test'}),code('ADMIN_PERMISSION_REQUIRED'));await beans.grant(admin,{memberId:fan,quantity:100,requestId:randomUUID(),reason:'Synthetic campaign'});const sourceLot=await db.beanLot.findFirstOrThrow({where:{charge_id:firstCharge.id,bucket:'purchased'}});await db.beanLot.update({where:{id:sourceLot.id},data:{frozen:true}});const held=await beans.wallet(fan);assert.equal(held.spendableBeans,100);assert.deepEqual(held.spendableBreakdown,{purchased:0,promotion:100});await db.beanLot.update({where:{id:sourceLot.id},data:{frozen:false}});await assert.rejects(beans.tip(fan,fan,{quantity:1,requestId:randomUUID()}),code('SELF_TIP'));const input={quantity:1200,requestId:randomUUID(),message:'Synthetic'};const [a,b]=await Promise.all([beans.tip(fan,creator,input),beans.tip(fan,creator,input)]);assert.equal(a.id,b.id);assert.equal(a.promotion_quantity,100);assert.equal(a.paid_quantity,1100);assert.equal((await beans.tips(fan)).items[0].creatorName,'Synthetic');assert.equal((await beans.tips(creator,true)).items[0].senderName,'Synthetic');assert.equal(await db.beanTipAllocation.count({where:{tip_id:a.id}}),2);await assert.rejects(beans.tip(fan,creator,{quantity:401,requestId:randomUUID()}),code('INSUFFICIENT_BEANS'));assert.equal((await beans.studio(creator)).availableBeans,100);assert.equal((await beans.wallet(creator)).withdrawableBeans,100);await db.beanLot.updateMany({where:{member_id:creator,bucket:'earned-promotion'},data:{created_at:new Date('2020-01-01')}});});
test('min1000, actual PG receipt and mature paid sources required; wrong PIN and account version block',async()=>{await assert.rejects(beans.review(creator,{quantity:999,accountId:account.id}),code('BEAN_WITHDRAWAL_MINIMUM'));const o=await db.beanCharge.findUniqueOrThrow({where:{id:firstCharge.id}});await receipt(o);assert.equal((await beans.studio(creator)).availableBeans,1200);assert.equal((await beans.wallet(creator)).withdrawableBeans,1200);const lot=await db.beanLot.findFirstOrThrow({where:{member_id:creator,bucket:'earned-paid'}});await db.beanLot.update({where:{id:lot.id},data:{release_at:new Date(Date.now()+86400000)}});assert.equal((await beans.wallet(creator)).withdrawableBeans,100);await db.beanLot.update({where:{id:lot.id},data:{release_at:lot.release_at,frozen:true}});assert.equal((await beans.wallet(creator)).withdrawableBeans,100);await db.beanLot.update({where:{id:lot.id},data:{frozen:false}});await assert.rejects(beans.authorize(creator,{quantity:1000,accountId:account.id,pin:'000000'}),code('INVALID_PIN'));const auth=await beans.authorize(creator,{quantity:1000,accountId:account.id,pin:'123456'});await db.settlementAccount.update({where:{id:account.id},data:{version:{increment:1}}});await assert.rejects(beans.requestPayout(creator,{quantity:1000,accountId:account.id,authorizationId:auth.authorizationId,requestId:randomUUID()}),code('AUTHORIZATION_EXPIRED'));});
test('payout reserves once, blocks account edits, Wednesday bank success returns full beans and recognizes fee once',async()=>{const p=await payout();assert.deepEqual([p.quantity,p.gross,p.fee,p.net],[1000,100000,20000,80000]);const wallet=await beans.wallet(creator);assert.equal(wallet.withdrawableBeans,200);assert.equal(wallet.accounts.find(a=>a.bucket==='reserved-paid').balance,'1000');await assert.rejects(finance.account(creator,{id:account.id,accountNumber:'123456781234',bank:'Synthetic',holderAlias:'Synthetic'}),code('ACCOUNT_IN_USE'));await assert.rejects(beans.payout(p.id,admin,new Date(TUE)),code('PAYOUT_SCHEDULED'));await beans.payout(p.id,admin,new Date(WED));await beans.payout(p.id,admin,new Date(WED));assert.equal(transfers,1);assert.equal((await db.beanPayout.findUniqueOrThrow({where:{id:p.id}})).status,'paid');assert.equal(await db.beanMovement.count({where:{request_key:'payout-result:'+p.id}}),1);});
test('test-key purchases never qualify for real payouts; receipt role validation',async()=>{const synthetic=new BeansService(service,finance,{...provider,configForClient:()=>({clientKey:'test_ck_synthetic'})},bank,config),o=await synthetic.createCharge(fan,{quantity:2000,requestId:randomUUID()});await synthetic.confirm(fan,o.id,{orderId:o.id,amount:o.amount,paymentKey:'test-'+o.id});await assert.rejects(beans.receipt(admin,o.id,{reference:'x',reason:'Test',amount:o.amount,receivedAt:new Date().toISOString()}),code('RECEIPT_NOT_ELIGIBLE'));});
test('pending bank result retains reserve, admin cannot reject in flight, retry uses same provider identity',async()=>{const o=await charge(3000);await receipt(o);await beans.tip(fan,creator,{quantity:3000,requestId:randomUUID()});const p=await payout();bankStatus='pending';await beans.payout(p.id,admin,new Date(WED));await assert.rejects(beans.rejectPayout(admin,p.id,{reason:'Cannot cancel unknown bank result'}),code('PAYOUT_IN_PROGRESS'));assert.equal((await db.beanPayout.findUniqueOrThrow({where:{id:p.id}})).status,'processing');bankStatus='rejected';await beans.payout(p.id,admin,new Date(THU));assert.equal((await db.beanPayout.findUniqueOrThrow({where:{id:p.id}})).status,'rejected');});
test('charge cancellation freezes downstream lots and blocks unsubmitted payout; explicit rejection restores reservation only',async()=>{const p=await payout();const allocations=await db.beanPayoutAllocation.findMany({where:{payout_id:p.id}}),lot=await db.beanLot.findUniqueOrThrow({where:{id:allocations[0].lot_id}});await beans.freezeCharge(lot.charge_id);assert.equal((await db.beanPayout.findUniqueOrThrow({where:{id:p.id}})).status,'blocked');const before=transfers;await beans.payout(p.id,admin,new Date(WED));assert.equal(transfers,before);await beans.rejectPayout(admin,p.id,{reason:'Source charge cancelled'});assert.equal((await db.beanPayout.findUniqueOrThrow({where:{id:p.id}})).status,'rejected');
 // Earlier tests already paid out beans from this charge, so the dispute also left a receivable (D4); the operator closes it so later payouts can run.
 for(const r of await db.creatorReceivable.findMany({where:{creator_id:creator,kind:'beans',status:'open'}})){assert.ok(r.amount>0);await beans.settleReceivable(admin,r.id,{note:'테스트 회수 확인'});}});
test('admin metrics split charge inflow from tips and only paid payout fees, total supply and journal stay balanced',async()=>{const data=await beans.adminData(admin);assert.ok(data.summary.chargeGroups.some(g=>g.environment==='test'));assert.ok(data.summary.chargeGroups.some(g=>g.environment==='live'));assert.ok(data.summary.payoutGroups.some(g=>g.status==='paid'&&g._sum.fee===20000));for(const account of await db.beanAccount.findMany()){const sum=await db.beanEntry.aggregate({where:{account_id:account.id},_sum:{delta:true}});assert.equal(account.balance,sum._sum.delta||BigInt(0));}assert.equal((await db.beanAccount.aggregate({_sum:{balance:true}}))._sum.balance,BigInt(0));});
test('PG approval followed by DB rollback recovers from same provider order without second charge',async()=>{
 const o=await beans.createCharge(fan,{quantity:1000,requestId:randomUUID()}),before=(await beans.wallet(fan)).accounts.find(a=>a.bucket==='purchased').balance,original=beans.transaction.bind(beans);let rounds=0;
 beans.transaction=fn=>original(async tx=>{const result=await fn(tx);if(++rounds===2)throw Error('Synthetic DB commit failure');return result;});
 const calls=charges;try{await assert.rejects(beans.confirm(fan,o.id,{orderId:o.id,amount:o.amount,paymentKey:'db-failure-'+o.id}),/Synthetic DB/);}finally{beans.transaction=original;}
 assert.equal(charges,calls+1);assert.equal((await beans.wallet(fan)).accounts.find(a=>a.bucket==='purchased').balance,before);await beans.reconcileCharge(o.id);await beans.reconcileCharge(o.id);assert.equal(charges,calls+1);assert.equal(await db.beanMovement.count({where:{request_key:'charge-paid:'+o.id}}),1);
});
test('concurrent payout intents reserve available lots once and reject an overdraft',async()=>{
 const o=await charge(3000);await receipt(o);const remaining=Number((await beans.wallet(fan)).spendableBeans);await beans.tip(fan,creator,{quantity:remaining,requestId:randomUUID()});const available=(await beans.studio(creator)).availableBeans,q=Math.max(1000,Math.floor(available/2)+1);assert.ok(q<=available);const input={quantity:q,accountId:account.id},a=await beans.authorize(creator,{...input,pin:'123456'}),b=await beans.authorize(creator,{...input,pin:'123456'});
 const results=await Promise.allSettled([beans.requestPayout(creator,{...input,authorizationId:a.authorizationId,requestId:randomUUID()}),beans.requestPayout(creator,{...input,authorizationId:b.authorizationId,requestId:randomUUID()})]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected'&&code('INSUFFICIENT_SETTLED_BEANS')(r.reason)).length,1);
});

test('account withdrawal cannot strand beans; an empty wallet can deactivate',async()=>{const guarded=new PlatformService(db,undefined,config);await assert.rejects(guarded.withdrawAccount(creator),e=>e.getResponse?.().code==='BEAN_BALANCE_REMAINS'&&/후원받은 콩을 먼저 출금/.test(e.getResponse?.().message));assert.equal((await db.member.findUniqueOrThrow({where:{id:creator}})).enabled,true);await beans.wallet(stranger);await guarded.withdrawAccount(stranger);assert.equal((await db.member.findUniqueOrThrow({where:{id:stranger}})).enabled,false);await assert.rejects(beans.grant(admin,{memberId:stranger,quantity:1,requestId:randomUUID(),reason:'Synthetic'}),code('MEMBER_INACTIVE'));});

test('a missing provider charge cannot pass payout preflight',async()=>{const o=await charge(1500);await receipt(o);const original=provider.lookup;try{provider.lookup=async()=>null;await assert.rejects(beans.reconcileCharge(o.id),code('PAYMENT_UNCERTAIN'));}finally{provider.lookup=original;}assert.equal((await db.beanCharge.findUniqueOrThrow({where:{id:o.id}})).status,'paid');});

test('new charge prices include VAT but historic pending orders keep their snapshot and mint quantity only',async()=>{
 const key=randomUUID(),fresh=await beans.createCharge(fan,{quantity:10,requestId:key,amount:1});assert.equal(fresh.amount,1100);
 await db.beanCharge.update({where:{id:fresh.id},data:{amount:1000}}); // Historical order predating VAT-inclusive pricing.
 const retry=await beans.createCharge(fan,{quantity:10,requestId:key});assert.equal(retry.id,fresh.id);assert.equal(retry.amount,1000);assert.equal((await beans.paymentWindow(fan,retry.id)).amount,1000);
 await assert.rejects(beans.confirm(fan,retry.id,{orderId:retry.id,amount:1100,paymentKey:'legacy-'+retry.id}),code('PAYMENT_MISMATCH'));
 const before=Number((await beans.wallet(fan)).spendableBeans),input={orderId:retry.id,amount:1000,paymentKey:'legacy-'+retry.id};await beans.confirm(fan,retry.id,input);await beans.confirm(fan,retry.id,input);
 assert.equal(Number((await beans.wallet(fan)).spendableBeans),before+10);assert.equal(await db.beanLot.count({where:{charge_id:retry.id}}),1);
 const policy=(await beans.wallet(fan)).policy;assert.equal(policy.chargeKrwPerBean,110);assert.equal(policy.krwPerBean,100);assert.equal(policy.withdrawalFeeBps,2000);
});

test('history filters validate input, apply before pagination, preserve ownership and expose creation time',async()=>{
 const created=[],tipIds=[];
 const from='2020-02-01',to=from,day=Date.parse(from+'T00:00:00+09:00');
 const add=async(member,at)=>{const id=randomUUID();await db.beanCharge.create({data:{id,member_id:member,request_key:'history:'+id,quantity:10,amount:1100,environment:'test',status:'failed',expires_at:new Date(day),created_at:new Date(at)}});created.push(id);return id;};
 try{
  for(let i=0;i<25;i++)await add(fan,day+i*1000);
  await add(fan,day+86400000-1);await add(fan,day-1);await add(fan,day+86400000);const foreign=await add(adminId,day);
  const filter={from,to,status:'failed'},one=await beans.wallet(fan,1,filter),two=await beans.wallet(fan,2,filter);
  assert.equal(one.chargesTotal,26);assert.equal(one.charges.length,20);assert.equal(two.charges.length,6);
  assert.equal(new Set([...one.charges,...two.charges].map(x=>x.id)).size,26);assert.equal(one.charges.some(x=>x.id===foreign),false);
  assert.ok([...one.charges,...two.charges].every(x=>Date.parse(x.createdAt)>=day&&Date.parse(x.createdAt)<day+86400000));
  assert.equal(new Date((await beans.charge(fan,created[0])).createdAt).toISOString(),new Date(day).toISOString());
  await assert.rejects(beans.charge(fan,foreign),code('BEAN_CHARGE_NOT_FOUND'));
  assert.equal((await beans.wallet(fan,1,{...filter,status:'paid'})).chargesTotal,0);
  assert.equal((await beans.wallet(adminId,1,filter)).chargesTotal,1);
  for(const direction of ['in','out']){const result=await beans.wallet(fan,1,{direction});assert.ok(result.entries.every(e=>direction==='in'?BigInt(e.delta)>0:BigInt(e.delta)<0));const accounts=await db.beanAccount.findMany({where:{wallet_id:result.walletId}});assert.equal(result.entriesTotal,await db.beanEntry.count({where:{account_id:{in:accounts.map(x=>x.id)},delta:direction==='in'?{gt:0}:{lt:0}}}));}
  for(let i=0;i<26;i++){const id=randomUUID();tipIds.push(id);await db.beanTip.create({data:{id,request_key:'history:'+id,sender_id:i===25?adminId:fan,creator_id:creator,quantity:1,paid_quantity:1,promotion_quantity:0,message:'HistoryFixture',created_at:new Date(day+i*1000)}});}
  const search={from,to,q:'HistoryFixture'},tips=await beans.tips(fan,false,1,search),tips2=await beans.tips(fan,false,2,search);
  assert.equal(tips.total,25);assert.equal(tips.items.length,20);assert.equal(tips2.items.length,5);assert.ok(tips.items.every(t=>t.sender_id===fan));
  assert.equal((await beans.tips(fan,false,1,{from,to,q:'Synthetic'})).total,25);
  for(const q of ['%','_','missing',"' OR 1=1 --"]){assert.equal((await beans.tips(fan,false,1,{from,to,q})).total,0);}
  for(const bad of [{from:'2020-02-30'},{from:'invalid'},{from:'2020-02-02',to:'2020-02-01'},{status:'paid OR 1=1'},{direction:'any'},{q:['x']},{q:'x'.repeat(101)}])await assert.rejects(beans.wallet(fan,1,bad),code('INVALID_HISTORY_FILTER'));
 }finally{await db.beanTip.deleteMany({where:{id:{in:tipIds}}});await db.beanCharge.deleteMany({where:{id:{in:created}}});}
});

test('post tips count unique supporters and exclude creator-wide tips',async()=>{
 const [supporterA,supporterB]=[randomUUID(),randomUUID()];ids.push(supporterA,supporterB);for(const id of [supporterA,supporterB])await db.member.create({data:{id,email:id+'@example.invalid',name:'Supporter',nickname:'Supporter',preferred_username:id,email_verified:true}});
 const post=await db.posting.create({data:{user_sub:creator,title:'Post tip fixture',content:'Synthetic',is_public:true,status:'PUBLISHED'}});
 try{
  for(const memberId of [supporterA,supporterB])await beans.grant(admin,{memberId,quantity:10,requestId:randomUUID(),reason:'Isolated supporter count test'});
  const input={postId:post.id,quantity:1,requestId:randomUUID(),message:'Post support'};
  const a=await beans.tip(supporterA,creator,input);assert.equal(a.supporterCount,1);
  assert.equal((await beans.tip(supporterA,creator,input)).id,a.id);
  assert.equal((await beans.tip(supporterA,creator,{...input,requestId:randomUUID()})).supporterCount,1);
  assert.equal((await beans.tip(supporterB,creator,{...input,requestId:randomUUID()})).supporterCount,2);
  await beans.tip(supporterB,creator,{quantity:1,requestId:randomUUID()});
  assert.equal((await service.post({...post,medias:[]},undefined,false)).supporterCount,2);
  const {PlatformStudioService}=require('../dist/src/platform/studio.service'),studio=new PlatformStudioService(service);
  const save={id:post.id,title:post.title,body:post.content,media:[],commentsEnabled:true,status:'published',accessPlanId:null,accessLevel:null};
  await studio.saveContent(creator,{...save,tipsEnabled:false});
  assert.equal((await studio.contents(creator)).find(p=>p.id===post.id).tipsEnabled,false);
  const priorBalance=(await beans.wallet(supporterA)).spendableBeans,priorTips=await db.beanTip.count({where:{post_id:post.id}});
  await assert.rejects(beans.tip(supporterA,creator,{...input,requestId:randomUUID()}),code('POST_TIPS_DISABLED'));
  assert.equal((await beans.wallet(supporterA)).spendableBeans,priorBalance);assert.equal(await db.beanTip.count({where:{post_id:post.id}}),priorTips);
  assert.equal((await beans.tip(supporterA,creator,input)).id,a.id);
  await studio.saveContent(creator,save);assert.equal((await db.posting.findUnique({where:{id:post.id}})).allow_tips,false);
  await assert.rejects(studio.saveContent(creator,{...save,tipsEnabled:'true'}),code('INVALID_INPUT'));
  await studio.saveContent(creator,{...save,tipsEnabled:true});
  assert.equal((await beans.tip(supporterA,creator,{...input,requestId:randomUUID()})).supporterCount,2);

  const balance=(await beans.wallet(supporterA)).spendableBeans;await assert.rejects(beans.tip(supporterA,creator,{...input,postId:randomUUID(),requestId:randomUUID()}),code('POST_NOT_FOUND'));assert.equal((await beans.wallet(supporterA)).spendableBeans,balance);
 }finally{await db.posting.delete({where:{id:post.id}});}
});

test('paid post support retains title, links payout allocations, separates metrics and recognizes fee only once',async()=>{
 const [payer,owner]=[randomUUID(),randomUUID()];ids.push(payer,owner);
 for(const id of [payer,owner])await db.member.create({data:{id,email:id+'@example.invalid',name:'Attribution',nickname:'Attribution',preferred_username:id,email_verified:true}});
 await db.creator.create({data:{user_id:owner}});
 const acc=await db.settlementAccount.create({data:{creator_id:owner,bank:'Synthetic',holder_alias:'Synthetic',last_four:'1234',account_encrypted:'synthetic',verified:true}});
 await db.withdrawalCredential.create({data:{creator_id:owner,pin_hash:await hashPassword('withdrawal-pin:123456')}});
 const post=await db.posting.create({data:{user_sub:owner,title:'Original post title',content:'Synthetic',is_public:true,status:'PUBLISHED'}});
 try{
  const before=await beans.adminData(admin),o=await beans.createCharge(payer,{quantity:1500,requestId:randomUUID()});
  await beans.confirm(payer,o.id,{orderId:o.id,amount:o.amount,paymentKey:'synthetic-'+o.id});
  await receipt(await db.beanCharge.findUniqueOrThrow({where:{id:o.id}}));
  await beans.grant(admin,{memberId:payer,quantity:50,requestId:randomUUID(),reason:'Synthetic attribution'});
  const input={quantity:1050,postId:post.id,message:'Post support',requestId:randomUUID()};
  const tip=await beans.tip(payer,owner,input),profile=await beans.tip(payer,owner,{quantity:500,requestId:randomUUID()});
  assert.equal(tip.sourceType,'post');assert.equal(tip.postTitle,'Original post title');assert.equal(tip.postTitleSource,'snapshot');
  assert.equal(profile.sourceType,'profile');assert.equal(profile.postTitle,null);
  assert.equal(tip.paid_quantity,1000);assert.equal(tip.promotion_quantity,50);
  assert.equal((await db.beanMovement.findUniqueOrThrow({where:{request_key:'tip:'+tip.id}})).reason,'게시물 후원');
  assert.equal((await db.beanMovement.findUniqueOrThrow({where:{request_key:'tip:'+profile.id}})).reason,'프로필 후원');
  await db.posting.update({where:{id:post.id},data:{title:'Edited post title'}});
  assert.equal((await beans.tip(payer,owner,input)).postTitle,'Original post title');
  const studio=await beans.studio(owner);assert.equal(studio.availableBeans,1550);
  assert.deepEqual(studio.receivedByType,[{sourceType:'post',count:1,paidQuantity:1000,promotionQuantity:50},{sourceType:'profile',count:1,paidQuantity:500,promotionQuantity:0}]);
  assert.equal((await beans.tips(payer,false,1,{q:'Original post title'})).items[0].id,tip.id);
  assert.ok((await beans.wallet(payer)).entries.some(e=>e.movement?.tip?.id===tip.id&&e.movement.tip.postTitle==='Original post title'));
  assert.equal((await beans.tips(stranger)).items.some(t=>t.id===tip.id),false);
  await assert.rejects(beans.review(owner,{quantity:1551,accountId:acc.id}),code('INSUFFICIENT_SETTLED_BEANS'));
  const auth=await beans.authorize(owner,{quantity:1200,accountId:acc.id,pin:'123456'}),p=await beans.requestPayout(owner,{quantity:1200,accountId:acc.id,authorizationId:auth.authorizationId,requestId:randomUUID()});
  assert.deepEqual([p.gross,p.fee,p.net],[120000,24000,96000]);
  const sources={postQuantity:1050,profileQuantity:150,unattributedQuantity:0};
  assert.deepEqual((await beans.studio(owner)).payouts[0].sources,sources);
  const pending=await beans.adminData(admin),get=(data,type,env)=>data.summary.tipSourceGroups.find(g=>g.sourceType===type&&g.environment===env)?.quantity||0;
  assert.equal(get(pending,'post','live')-get(before,'post','live'),1000);
  assert.equal(get(pending,'post','promotion')-get(before,'post','promotion'),50);
  assert.equal(get(pending,'profile','live')-get(before,'profile','live'),500);
  const fees=data=>data.summary.payoutGroups.filter(g=>g.environment==='live'&&g.status==='paid').reduce((n,g)=>n+(g._sum.fee||0),0);
  assert.equal(fees(pending),fees(before));
  const bankBefore=transfers;bankStatus='paid';await beans.payout(p.id,admin,new Date(WED));await beans.payout(p.id,admin,new Date(WED));
  assert.equal(transfers,bankBefore+1);const completed=await beans.adminData(admin);
  assert.equal(fees(completed)-fees(before),24000);assert.deepEqual(completed.payouts.find(row=>row.id===p.id).sources,sources);
  await db.posting.delete({where:{id:post.id}});
  const historical=(await beans.tips(owner,true)).items.find(t=>t.id===tip.id);assert.equal(historical.postTitle,'Original post title');assert.equal(historical.postAvailable,false);
  assert.deepEqual((await beans.studio(owner)).payouts[0].sources,sources);
 }finally{await db.posting.deleteMany({where:{id:post.id}});}
});
test('legacy post title is labelled current without rewriting history; missing posts never become profile tips',async()=>{
 const p=await db.posting.create({data:{user_sub:creator,title:'Current title only',content:'Synthetic',is_public:true,status:'PUBLISHED'}});
 const t=await db.beanTip.create({data:{request_key:randomUUID(),sender_id:fan,creator_id:creator,post_id:p.id,quantity:1,paid_quantity:0,promotion_quantity:1,message:'Legacy'}});
 try{
  let result=(await beans.tips(fan)).items.find(x=>x.id===t.id);
  assert.equal(result.postTitleSource,'current');assert.equal(result.postTitle,'Current title only');
  assert.equal((await db.beanTip.findUniqueOrThrow({where:{id:t.id}})).post_title_snapshot,null);
  await db.posting.delete({where:{id:p.id}});result=(await beans.tips(fan)).items.find(x=>x.id===t.id);
  assert.equal(result.sourceType,'post');assert.equal(result.postTitleSource,'unavailable');assert.equal(result.postTitle,null);assert.equal(result.postAvailable,false);
 }finally{await db.beanTip.delete({where:{id:t.id}});await db.posting.deleteMany({where:{id:p.id}});}
});


test('all promotional grants including earlier lots can be withdrawn after a real tip, but never directly; bank guards and exact mixed returns hold',async()=>{
 const [sender,owner]=[randomUUID(),randomUUID()];ids.push(sender,owner);
 for(const id of [sender,owner]){await db.member.create({data:{id,email:id+'@example.invalid',name:'Promotion fixture',nickname:'Promotion fixture',preferred_username:id,email_verified:true}});await db.creator.create({data:{user_id:id}});}
 const acc=await db.settlementAccount.create({data:{creator_id:owner,bank:'Synthetic',holder_alias:'Synthetic',last_four:'1234',account_encrypted:'synthetic',verified:true}});
 await db.withdrawalCredential.create({data:{creator_id:owner,pin_hash:await hashPassword('withdrawal-pin:123456')}});
 const grant=await beans.grant(admin,{memberId:sender,quantity:2500,requestId:randomUUID(),reason:'Earlier campaign, company funded'});
 assert.equal((await beans.wallet(sender)).withdrawableBeans,0);
 await assert.rejects(beans.tip(sender,sender,{quantity:1000,requestId:randomUUID()}),code('SELF_TIP'));
 const tip=await beans.tip(sender,owner,{quantity:1500,requestId:randomUUID()});assert.equal(tip.promotion_quantity,1500);
 const lot=await db.beanLot.findFirstOrThrow({where:{member_id:owner,bucket:'earned-promotion'}});
 assert.equal(lot.grant_id,grant.id);assert.equal(lot.charge_id,null);
 const wallet=await beans.wallet(owner);assert.equal(wallet.withdrawableBeans,1500);assert.deepEqual(wallet.withdrawableBreakdown,{paid:0,promotion:1500});
 await db.beanLot.update({where:{id:lot.id},data:{frozen:true}});assert.equal((await beans.wallet(owner)).withdrawableBeans,0);await db.beanLot.update({where:{id:lot.id},data:{frozen:false,release_at:new Date(Date.now()+86400000)}});assert.equal((await beans.wallet(owner)).withdrawableBeans,0);await db.beanLot.update({where:{id:lot.id},data:{release_at:lot.release_at,grant_id:randomUUID()}});assert.equal((await beans.wallet(owner)).withdrawableBeans,0);await db.beanLot.update({where:{id:lot.id},data:{grant_id:grant.id}});
 const input={quantity:1000,accountId:acc.id},request=async()=>{const a=await beans.authorize(owner,{...input,pin:'123456'});return beans.requestPayout(owner,{...input,authorizationId:a.authorizationId,requestId:randomUUID()});};
 const a=await beans.authorize(owner,{...input,pin:'123456'}),key=randomUUID(),both=await Promise.all([beans.requestPayout(owner,{...input,authorizationId:a.authorizationId,requestId:key}),beans.requestPayout(owner,{...input,authorizationId:a.authorizationId,requestId:key})]);assert.equal(both[0].id,both[1].id);
 const pending=both[0];assert.deepEqual([pending.gross,pending.fee,pending.net],[100000,20000,80000]);assert.equal((await beans.wallet(owner)).withdrawableBeans,500);
 const original=beans.transaction.bind(beans);beans.transaction=fn=>original(async tx=>{await fn(tx);throw Error('Synthetic rollback after promotional return');});
 try{await assert.rejects(beans.rejectPayout(admin,pending.id,{reason:'Rollback test'}),/Synthetic rollback/);}finally{beans.transaction=original;}
 assert.equal((await db.beanPayout.findUniqueOrThrow({where:{id:pending.id}})).status,'requested');assert.equal((await beans.wallet(owner)).withdrawableBeans,500);
 await beans.rejectPayout(admin,pending.id,{reason:'Restore promotional origin'});await beans.rejectPayout(admin,pending.id,{reason:'Duplicate rejection'});
 assert.equal((await beans.wallet(owner)).accounts.find(a=>a.bucket==='earned-promotion').balance,'1500');assert.equal((await beans.wallet(owner)).accounts.find(a=>a.bucket==='earned-paid').balance,'0');
 const next=await request();const disabled=new BeansService(service,finance,provider,bank,new ConfigService({BEAN_LEDGER_ENABLED:'true',BANK_PAYOUTS_ENABLED:'true',BETA_MODE:'true'}));await assert.rejects(disabled.payout(next.id,admin,new Date(WED)),code('BETA_PAYOUT_DISABLED'));
 await db.beanLot.update({where:{id:lot.id},data:{frozen:true}});const bankBefore=transfers;await assert.rejects(beans.payout(next.id,admin,new Date(WED)),code('PAYOUT_BLOCKED'));assert.equal(transfers,bankBefore);await db.beanLot.update({where:{id:lot.id},data:{frozen:false}});
 bankStatus='pending';await beans.payout(next.id,admin,new Date(WED));bankStatus='rejected';await beans.payout(next.id,admin,new Date(THU));assert.equal((await beans.wallet(owner)).withdrawableBeans,1500);assert.equal((await beans.wallet(owner)).accounts.find(a=>a.bucket==='earned-paid').balance,'0');
 const paid=await request(),pre=await beans.adminData(admin),beforeCalls=transfers;bankStatus='paid';const noPg=new BeansService(service,finance,{...provider,configForClient:()=>({clientKey:''})},bank,config);
 await noPg.payout(paid.id,admin,new Date(WED));await noPg.payout(paid.id,admin,new Date(WED));assert.equal(transfers,beforeCalls+1);
 const completed=await beans.adminData(admin),group=data=>data.summary.payoutFundingGroups.find(g=>g.environment==='live'&&g.status==='paid'&&g.source==='promotion')||{quantity:0,gross:0,fee:0,net:0};
 assert.deepEqual(['quantity','gross','fee','net'].map(k=>group(completed)[k]-group(pre)[k]),[1000,100000,20000,80000]);assert.deepEqual(completed.summary.chargeGroups,pre.summary.chargeGroups);
 assert.deepEqual(completed.payouts.find(p=>p.id===paid.id).funding,{paidQuantity:0,promotionQuantity:1000,unknownQuantity:0});
 assert.equal((await beans.wallet(owner)).withdrawableBeans,500);assert.equal((await beans.wallet(sender)).withdrawableBeans,0);
});

test('mixed paid and promotional payout returns original accounts on bank and admin rejection, preserves source sums and rejects concurrent overdraw',async()=>{
 const [sender,owner]=[randomUUID(),randomUUID()];ids.push(sender,owner);
 for(const id of [sender,owner])await db.member.create({data:{id,email:id+'@example.invalid',name:'Mixed fixture',nickname:'Mixed fixture',preferred_username:id,email_verified:true}});
 await db.creator.create({data:{user_id:owner}});const acc=await db.settlementAccount.create({data:{creator_id:owner,bank:'Synthetic',holder_alias:'Synthetic',last_four:'1234',account_encrypted:'synthetic',verified:true}});await db.withdrawalCredential.create({data:{creator_id:owner,pin_hash:await hashPassword('withdrawal-pin:123456')}});
 const order=await beans.createCharge(sender,{quantity:600,requestId:randomUUID()});await beans.confirm(sender,order.id,{orderId:order.id,amount:order.amount,paymentKey:'mixed-'+order.id});await receipt(await db.beanCharge.findUniqueOrThrow({where:{id:order.id}}));await beans.grant(admin,{memberId:sender,quantity:600,requestId:randomUUID(),reason:'Mixed payout'});await beans.tip(sender,owner,{quantity:1200,requestId:randomUUID()});
 const input={quantity:1200,accountId:acc.id},make=async()=>{const a=await beans.authorize(owner,{...input,pin:'123456'});return beans.requestPayout(owner,{...input,authorizationId:a.authorizationId,requestId:randomUUID()});};
 const a=await beans.authorize(owner,{...input,pin:'123456'}),b=await beans.authorize(owner,{...input,pin:'123456'});const results=await Promise.allSettled([beans.requestPayout(owner,{...input,authorizationId:a.authorizationId,requestId:randomUUID()}),beans.requestPayout(owner,{...input,authorizationId:b.authorizationId,requestId:randomUUID()})]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected'&&code('INSUFFICIENT_SETTLED_BEANS')(r.reason)).length,1);const p=results.find(r=>r.status==='fulfilled').value;
 assert.deepEqual((await beans.studio(owner)).payouts.find(x=>x.id===p.id).funding,{paidQuantity:600,promotionQuantity:600,unknownQuantity:0});await beans.rejectPayout(admin,p.id,{reason:'Mixed restore'});
 assert.deepEqual((await beans.wallet(owner)).withdrawableBreakdown,{paid:600,promotion:600});const next=await make();bankStatus='rejected';await beans.payout(next.id,admin,new Date(WED));bankStatus='paid';assert.deepEqual((await beans.wallet(owner)).withdrawableBreakdown,{paid:600,promotion:600});
 for(const account of await db.beanAccount.findMany()){const sum=await db.beanEntry.aggregate({where:{account_id:account.id},_sum:{delta:true}});assert.equal(account.balance,sum._sum.delta||BigInt(0));}assert.equal((await db.beanAccount.aggregate({_sum:{balance:true}}))._sum.balance,BigInt(0));
});
test('FIN-02: one failing charge reconciliation is reported and the rest of the bean queue still runs',async()=>{
 const seen=[],reported=[],touched=[],charges=[{id:'bad',status:'processing'},{id:'good',status:'processing'}];
 const fake={config:new ConfigService({BEAN_LEDGER_ENABLED:'true',BETA_MODE:'true'}),reconcileCharge:async id=>{if(id==='bad')throw Error('synthetic provider outage');seen.push(id);},
  db:{beanRefund:{findMany:async()=>[]},beanCharge:{findMany:async q=>q.where.status==='paid'?[{id:'paid-1',status:'paid'}]:charges,findUnique:async({where})=>({status:where.id==='good'?'paid':'processing'}),update:async({where})=>{touched.push(where.id);}}}};
 const count=await BeansService.prototype.tick.call(fake,async(job,error)=>{reported.push([job,error.message]);});
 assert.deepEqual(seen,['good','paid-1']);assert.deepEqual(reported,[['beans-charge','synthetic provider outage']]);assert.deepEqual(touched,['bad','good','paid-1']);assert.equal(count,1);
});

test('received beans, paid or promotion, become withdrawable 7 days after the tip, not after the charge',async()=>{
 const [owner,sender]=[randomUUID(),randomUUID()];ids.push(owner,sender);for(const id of [owner,sender])await db.member.create({data:{id,email:id+'@example.invalid',name:'Hold fixture',nickname:'Hold fixture',preferred_username:id,email_verified:true}});await db.creator.create({data:{user_id:owner}});
 await beans.grant(admin,{memberId:sender,quantity:300,requestId:randomUUID(),reason:'보류 검증'});
 const at=Date.now();await tipNow(sender,owner,{quantity:300,requestId:randomUUID()});
 const lots=await db.beanLot.findMany({where:{member_id:owner,bucket:'earned-promotion'}});assert.equal(lots.length,1);
 assert.ok(Math.abs(lots[0].release_at.getTime()-(at+7*86400000))<60000,'hold counts from the tip');
 assert.equal((await beans.wallet(owner)).withdrawableBeans,0,'a promotion tip is not withdrawable at once');
 await db.beanLot.update({where:{id:lots[0].id},data:{release_at:new Date(Date.now()-1000)}});assert.equal((await beans.wallet(owner)).withdrawableBeans,300);});

// D6 (2026-10-30): unused purchased beans refund in full within 7 days of payment, 10% kept after (waived for company fault); 5-year validity.
test('unused purchased beans refund through a partial PG cancel: full within 7 days, 10% kept after, operator waiver, refusal restores',async()=>{
 const member=randomUUID();ids.push(member);await db.member.create({data:{id:member,email:member+'@example.invalid',name:'Refund fixture',nickname:'Refund fixture',preferred_username:member,email_verified:true}});
 const cancels=[];let cancelError=null;provider.cancel=async(key,reason,idem,amount)=>{if(cancelError)throw cancelError;cancels.push({key,idem,amount});return{status:'PARTIAL_CANCELED'};};
 const buy=async(q,daysAgo)=>{const o=await beans.createCharge(member,{quantity:q,requestId:randomUUID()});await beans.confirm(member,o.id,{paymentKey:'synthetic-'+o.id,orderId:o.id,amount:o.amount});await db.beanCharge.update({where:{id:o.id},data:{paid_at:new Date(Date.now()-daysAgo*86400000)}});return o;};
 const recent=await buy(100,1);await beans.tip(member,creator,{quantity:30,requestId:randomUUID()});
 const quote=await beans.refundQuote(member,recent.id);assert.deepEqual([quote.quantity,quote.gross,quote.deduction,quote.amount,quote.fullRefundWindow],[70,7700,0,7700,true]);
 const key=randomUUID(),done=await beans.refundCharge(member,recent.id,{requestId:key});assert.deepEqual([done.quantity,done.amount,done.status],[70,7700,'done']);
 assert.deepEqual(cancels.map(c=>[c.key,c.amount]),[['synthetic-'+recent.id,7700]]);
 assert.deepEqual((await beans.refundCharge(member,recent.id,{requestId:key})).id,done.id,'the same request is answered once');assert.equal(cancels.length,1);
 await assert.rejects(beans.refundCharge(member,recent.id,{requestId:randomUUID()}),code('NO_REFUNDABLE_BEANS'));
 const charged=await db.beanCharge.findUniqueOrThrow({where:{id:recent.id}});assert.deepEqual([charged.refunded_quantity,charged.refunded_amount],[70,7700]);
 assert.equal((await beans.wallet(member)).spendableBreakdown.purchased,0);
 const old=await buy(100,8);const late=await beans.refundCharge(member,old.id,{requestId:randomUUID(),waived:true});assert.deepEqual([late.gross,late.deduction,late.amount,late.waived],[11000,1100,9900,false],'a member cannot waive the deduction');
 const fault=await buy(50,30);const waived=await beans.refundCharge(null,fault.id,{requestId:randomUUID(),waived:true,reason:'결제 오류(회사 귀책)'},admin);assert.deepEqual([waived.deduction,waived.amount,waived.waived],[0,5500,true]);
 const refused=await buy(10,1);cancelError={getResponse:()=>({code:'PROVIDER_REJECTED'}),getStatus:()=>400};await assert.rejects(beans.refundCharge(member,refused.id,{requestId:randomUUID()}),code('PROVIDER_REJECTED'));
 const lot=await db.beanLot.findFirstOrThrow({where:{charge_id:refused.id,bucket:'purchased'}});assert.deepEqual([lot.available,lot.reserved],[10,0],'a refused cancel puts the beans back');
 cancelError={getResponse:()=>({code:'PAYMENT_UNCERTAIN'}),getStatus:()=>503};await assert.rejects(beans.refundCharge(member,refused.id,{requestId:randomUUID()}),code('PAYMENT_UNCERTAIN'));
 assert.deepEqual(Object.values(await db.beanLot.findUniqueOrThrow({where:{id:lot.id},select:{available:true,reserved:true}})),[0,10],'an unknown outcome stays reserved');
 await assert.rejects(beans.refundCharge(member,refused.id,{requestId:randomUUID()}),code('BEAN_REFUND_IN_PROGRESS'));cancelError=null;
 await db.beanRefund.deleteMany({where:{member_id:member}});
});
test('purchased and promotion beans expire 5 years after payment or grant, with one notice 30 days ahead',async()=>{
 const member=randomUUID();ids.push(member);await db.member.create({data:{id:member,email:member+'@example.invalid',name:'Expiry fixture',nickname:'Expiry fixture',preferred_username:member,email_verified:true}});
 await beans.grant(admin,{memberId:member,quantity:40,requestId:randomUUID(),reason:'만료 검증'});const lot=await db.beanLot.findFirstOrThrow({where:{member_id:member,bucket:'promotion'}});
 const years=(lot.expires_at-lot.created_at)/86400000/365.25;assert.ok(years>4.99&&years<5.01,'promotion beans get 5 years');
 await db.beanLot.update({where:{id:lot.id},data:{expires_at:new Date(Date.now()+10*86400000)}});
 await beans.expireLots();await beans.expireLots();
 const notes=await db.memberNotification.findMany({where:{member_id:member,type:'bean-expiry'}});assert.equal(notes.length,1);assert.match(notes[0].text,/콩 40개가 .+에 유효기간이 끝납니다/);
 assert.equal(await db.memberNotice.count({where:{member_id:member,kind:'bean-expiry'}}),1,'the mail is queued once');
 assert.equal((await beans.wallet(member)).expiringSoon.quantity,40);
 await db.beanLot.update({where:{id:lot.id},data:{expires_at:new Date(Date.now()-1000)}});
 assert.equal((await beans.wallet(member)).spendableBeans,0,'expired beans are not spendable');
 await assert.rejects(beans.tip(member,creator,{quantity:1,requestId:randomUUID()}),code('INSUFFICIENT_BEANS'));
 const before=await db.beanAccount.findFirst({where:{wallet_id:'bean-company',bucket:'expired'}});await beans.expireLots();
 assert.equal((await db.beanLot.findUniqueOrThrow({where:{id:lot.id}})).available,0);
 const after=await db.beanAccount.findFirstOrThrow({where:{wallet_id:'bean-company',bucket:'expired'}});assert.equal(Number(after.balance)-Number(before?.balance||0),40);
 // Undo the expiry posting so the shared teardown (member balances back to stock) leaves every account equal to its entries.
 const mv=await db.beanMovement.findUniqueOrThrow({where:{request_key:`bean-expire:${lot.id}`}}),entries=await db.beanEntry.findMany({where:{movement_id:mv.id}});
 for(const e of entries)await db.beanAccount.update({where:{id:e.account_id},data:{balance:{decrement:e.delta}}});await db.beanEntry.deleteMany({where:{movement_id:mv.id}});await db.beanMovement.delete({where:{id:mv.id}});
 await db.memberNotice.deleteMany({where:{member_id:member}});
});
test('a chargeback after a paid payout records a receivable, notifies the creator and stops bean payouts until an operator settles it',async()=>{
 const member=randomUUID();ids.push(member);await db.member.create({data:{id:member,email:member+'@example.invalid',name:'Dispute fixture',nickname:'Dispute fixture',preferred_username:member,email_verified:true}});
 const o=await beans.createCharge(member,{quantity:100,requestId:randomUUID()});await beans.confirm(member,o.id,{paymentKey:'synthetic-'+o.id,orderId:o.id,amount:o.amount});
 await beans.tip(member,creator,{quantity:100,requestId:randomUUID()});const earned=await db.beanLot.findFirstOrThrow({where:{member_id:creator,charge_id:o.id}});
 const p=await db.beanPayout.create({data:{request_key:randomUUID(),creator_id:creator,account_id:account.id,account_version:1,account_label:'Synthetic',quantity:100,gross:10000,fee:2000,net:8000,fee_bps:2000,environment:'live',status:'paid'}});await db.beanPayoutAllocation.create({data:{payout_id:p.id,lot_id:earned.id,quantity:100}});
 await beans.freezeCharge(o.id);
 const r=await db.creatorReceivable.findFirstOrThrow({where:{creator_id:creator,kind:'beans',source_id:o.id}});assert.deepEqual([r.amount,r.status],[8000,'open']);
 assert.ok((await db.memberNotification.findMany({where:{member_id:creator,type:'settlement'}})).some(n=>n.text.includes('8,000원')));
 await assert.rejects(beans.review(creator,{quantity:1000,accountId:account.id}),code('RECEIVABLE_OPEN'));
 assert.ok((await beans.receivables(admin)).some(x=>x.id===r.id));
 await beans.settleReceivable(admin,r.id,{note:'크리에이터 반환 입금 확인'});assert.equal((await db.creatorReceivable.findUniqueOrThrow({where:{id:r.id}})).status,'settled');
 await db.creatorReceivable.deleteMany({where:{creator_id:creator}});await db.beanPayoutAllocation.deleteMany({where:{payout_id:p.id}});await db.beanPayout.deleteMany({where:{id:p.id}});
});

// 2026-10-30 hotfix: our own partial cancels must not look like a dispute; unknown-outcome refunds are reconciled; refunds survive a sales stop.
test('after a member refund the PG monitor keeps the charge paid; only a cancel beyond our refunds freezes it',async()=>{
 const member=randomUUID();ids.push(member);await db.member.create({data:{id:member,email:member+'@example.invalid',name:'Monitor fixture',nickname:'Monitor fixture',preferred_username:member,email_verified:true}});
 provider.cancel=async()=>({status:'PARTIAL_CANCELED'});
 const o=await beans.createCharge(member,{quantity:100,requestId:randomUUID()});await beans.confirm(member,o.id,{paymentKey:'synthetic-'+o.id,orderId:o.id,amount:o.amount});await db.beanCharge.update({where:{id:o.id},data:{paid_at:new Date()}});
 await beans.tip(member,creator,{quantity:30,requestId:randomUUID()});const r=await beans.refundCharge(member,o.id,{requestId:randomUUID()});assert.equal(r.amount,7700);
 pg.set(o.id,{...pg.get(o.id),status:'PARTIAL_CANCELED',balanceAmount:o.amount-7700});await db.beanCharge.update({where:{id:o.id},data:{locked_until:null}});
 await beans.reconcileCharge(o.id);
 assert.equal((await db.beanCharge.findUniqueOrThrow({where:{id:o.id}})).status,'paid','our own refund is not a dispute');
 assert.equal(await db.beanLot.count({where:{charge_id:o.id,frozen:true}}),0);
 pg.set(o.id,{...pg.get(o.id),status:'PARTIAL_CANCELED',balanceAmount:o.amount-7700-1100});await beans.reconcileCharge(o.id);
 assert.equal((await db.beanCharge.findUniqueOrThrow({where:{id:o.id}})).status,'disputed','a cancel we did not make is still a dispute');
 await db.creatorReceivable.deleteMany({where:{source_id:o.id}});await db.beanRefund.deleteMany({where:{member_id:member}});
});
test('an unknown-outcome refund is finished from the PG record or resent with the same key; a refused one answers 409 on retry',async()=>{
 const member=randomUUID();ids.push(member);await db.member.create({data:{id:member,email:member+'@example.invalid',name:'Reconcile fixture',nickname:'Reconcile fixture',preferred_username:member,email_verified:true}});
 const calls=[];let fail=null;provider.cancel=async(key,reason,idem,amount)=>{calls.push({idem,amount});if(fail)throw fail;return{status:'PARTIAL_CANCELED'};};
 const buy=async q=>{const o=await beans.createCharge(member,{quantity:q,requestId:randomUUID()});await beans.confirm(member,o.id,{paymentKey:'synthetic-'+o.id,orderId:o.id,amount:o.amount});await db.beanCharge.update({where:{id:o.id},data:{paid_at:new Date()}});return o;};
 const uncertain={getResponse:()=>({code:'PAYMENT_UNCERTAIN'}),getStatus:()=>503};
 // The PG did refund: the tick finds it and finishes once.
 const a=await buy(20);fail=uncertain;await assert.rejects(beans.refundCharge(member,a.id,{requestId:randomUUID()}),code('PAYMENT_UNCERTAIN'));fail=null;
 const ra=await db.beanRefund.findFirstOrThrow({where:{charge_id:a.id}});assert.equal(ra.status,'processing');
 pg.set(a.id,{...pg.get(a.id),status:'CANCELED',balanceAmount:0});await Promise.all([beans.reconcileRefund(ra.id),beans.reconcileRefund(ra.id)]);// two ticks at once must apply it once
 assert.equal((await db.beanRefund.findUniqueOrThrow({where:{id:ra.id}})).status,'done');assert.equal(calls.length,1,'no second cancel when the PG already shows it');
 const ca=await db.beanCharge.findUniqueOrThrow({where:{id:a.id}});assert.deepEqual([ca.refunded_quantity,ca.refunded_amount,ca.status],[20,2200,'paid']);
 assert.equal((await db.beanLot.findFirstOrThrow({where:{charge_id:a.id,bucket:'purchased'}})).reserved,0);
 // The PG has no cancel yet: resent with the same idempotency key.
 const b=await buy(10);fail=uncertain;await assert.rejects(beans.refundCharge(member,b.id,{requestId:randomUUID()}),code('PAYMENT_UNCERTAIN'));fail=null;
 const rb=await db.beanRefund.findFirstOrThrow({where:{charge_id:b.id}});await beans.reconcileRefund(rb.id);
 assert.equal((await db.beanRefund.findUniqueOrThrow({where:{id:rb.id}})).status,'done');assert.deepEqual(calls.slice(-2).map(c=>c.idem),[`bean-refund-${rb.id}`,`bean-refund-${rb.id}`]);
 // A refused refund answers 409 when the same request comes back.
 const c=await buy(10),key=randomUUID();fail={getResponse:()=>({code:'PROVIDER_REJECTED'}),getStatus:()=>400};await assert.rejects(beans.refundCharge(member,c.id,{requestId:key}),code('PROVIDER_REJECTED'));fail=null;
 await assert.rejects(beans.refundCharge(member,c.id,{requestId:key}),code('BEAN_REFUND_FAILED'));
 assert.equal((await beans.refundCharge(member,c.id,{requestId:randomUUID()})).status,'done','a new request can refund after a refusal');
 await db.beanRefund.deleteMany({where:{member_id:member}});
});
test('refunds still work after live sales approval is switched off',async()=>{
 const member=randomUUID();ids.push(member);await db.member.create({data:{id:member,email:member+'@example.invalid',name:'Stop fixture',nickname:'Stop fixture',preferred_username:member,email_verified:true}});
 provider.cancel=async()=>({status:'PARTIAL_CANCELED'});
 const o=await beans.createCharge(member,{quantity:10,requestId:randomUUID()});await beans.confirm(member,o.id,{paymentKey:'synthetic-'+o.id,orderId:o.id,amount:o.amount});await db.beanCharge.update({where:{id:o.id},data:{paid_at:new Date()}});
 const stopped=new BeansService(service,finance,provider,bank,new ConfigService({BEAN_LEDGER_ENABLED:'true',BEAN_LIVE_PAYMENTS_APPROVED:'false',BANK_PAYOUTS_ENABLED:'true',BETA_MODE:'false'}));
 await assert.rejects(stopped.createCharge(member,{quantity:10,requestId:randomUUID()}),code('BEAN_LIVE_APPROVAL_REQUIRED'),'new sales stop');
 assert.equal((await stopped.refundCharge(member,o.id,{requestId:randomUUID()})).status,'done','but refunds owed still go through');
 await db.beanRefund.deleteMany({where:{member_id:member}});
});
test('account withdrawal: purchased beans point to the wallet refund, received beans must be withdrawn, promotion beans lapse',async()=>{
 const guarded=new PlatformService(db,undefined,config),[promo,buyer]=[randomUUID(),randomUUID()];ids.push(promo,buyer);
 for(const id of [promo,buyer])await db.member.create({data:{id,email:id+'@example.invalid',name:'Leave fixture',nickname:'Leave fixture',preferred_username:id,email_verified:true}});
 await beans.grant(admin,{memberId:promo,quantity:5,requestId:randomUUID(),reason:'Lapse fixture'});await guarded.withdrawAccount(promo);assert.equal((await db.member.findUniqueOrThrow({where:{id:promo}})).enabled,false,'promotion beans do not block leaving');
 const o=await beans.createCharge(buyer,{quantity:10,requestId:randomUUID()});await beans.confirm(buyer,o.id,{paymentKey:'synthetic-'+o.id,orderId:o.id,amount:o.amount});
 await assert.rejects(guarded.withdrawAccount(buyer),e=>e.getResponse?.().code==='BEAN_BALANCE_REMAINS'&&/지갑의 충전 내역에서 환불/.test(e.getResponse?.().message));
});
test('a membership receivable does not stop bean payouts; a bean receivable does',async()=>{
 const membership=await db.creatorReceivable.create({data:{creator_id:creator,kind:'membership',source_id:randomUUID(),amount:1000}});
 const notBlocked=await beans.review(creator,{quantity:1000,accountId:account.id}).then(()=>null,e=>e.getResponse?.().code);assert.notEqual(notBlocked,'RECEIVABLE_OPEN');
 const bean=await db.creatorReceivable.create({data:{creator_id:creator,kind:'beans',source_id:randomUUID(),amount:1000}});
 await assert.rejects(beans.review(creator,{quantity:1000,accountId:account.id}),code('RECEIVABLE_OPEN'));
 await db.creatorReceivable.deleteMany({where:{id:{in:[membership.id,bean.id]}}});
});
