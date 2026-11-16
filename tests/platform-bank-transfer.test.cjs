// 2026-11-16 user decisions: bank transfer (무통장입금) for beans, AI 이용권 and advertising. 24-hour deposit window, operator confirms only
// an exact amount, optional cash receipt, refunds to a member account (encrypted) transferred by an operator within 3 business days.
require('reflect-metadata');require('dotenv').config({path:'.local/platform.env',override:true});
const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('crypto'),{ConfigService}=require('@nestjs/config');
assert.equal(process.env.CREFANS_E2E,'true');const source=process.env.DATABASE_URL;assert.match(source||'',/@127\.0\.0\.1:3307\/crefans_platform_dev$/);const url=new URL(source);url.pathname='/crefans_platform_e2e';process.env.DATABASE_URL=url.toString();
const {PrismaClient}=require('@prisma/client'),db=new PrismaClient();
const {BankTransferService,addBusinessDays,BANK_TRANSFER_HOURS}=require('../dist/src/platform/bank-transfer');
const {BeansService}=require('../dist/src/platform/beans.service'),{PlatformService}=require('../dist/src/platform/service'),{PlatformFinanceService}=require('../dist/src/platform/finance.service');
const {AiShopService,AI_SHOP_TERMS}=require('../dist/src/platform/ai-shop'),{AdvertisingPurchaseService}=require('../dist/src/platform/advertising-purchase'),{activateAdPurchase}=require('../dist/src/platform/advertising-use');
const ids=Array.from({length:3},()=>randomUUID()),[fan,creator,adminId]=ids,admin={is_active:true,role:'SUPER_ADMIN',user_sub:adminId},code=c=>e=>e.getResponse?.().code===c;
const config=new ConfigService({BEAN_LEDGER_ENABLED:'true',BETA_MODE:'true'});
const provider={configForClient:()=>({clientKey:'test_ck_synthetic'}),encrypt:x=>'enc:'+Buffer.from(x).toString('base64'),decrypt:x=>Buffer.from(x.slice(4),'base64').toString(),lookup:async()=>{throw Error('a bank-transfer order must never reach the PG');},confirm:async()=>{throw Error('no PG');},cancel:async()=>{throw Error('no PG');}};
const service=new PlatformService(db,undefined,config),transfers=new BankTransferService(service,provider,config),finance=new PlatformFinanceService(service,provider,config,{}),beans=new BeansService(service,finance,provider,{},config,transfers),shop=new AiShopService(service,provider,finance,transfers),ads=new AdvertisingPurchaseService(service,transfers);
beans.maxChargeQuantity=100000;beans.chargeLimits={daily:null,monthly:null};
const order={method:'bank_transfer',depositorName:'홍길동',cashReceipt:{type:'income',number:'010-1234-5678'}},refundAccount={bankName:'국민은행',accountNumber:'123-456-789012',holder:'홍길동'};
const paymentOf=(kind,id)=>db.bankTransferPayment.findUnique({where:{kind_order_id:{kind,order_id:id}}});
const balance=async(member,bucket)=>{const w=await db.beanWallet.findUnique({where:{owner_key:member==='company'?undefined:`member:${member}`,...(member==='company'?{id:'bean-company'}:{})}}).catch(()=>null);const wallet=member==='company'?{id:'bean-company'}:w;if(!wallet)return 0n;const a=await db.beanAccount.findUnique({where:{wallet_id_bucket:{wallet_id:wallet.id,bucket}}});return a?a.balance:0n;};
let product,adProduct;
before(async()=>{await require('./e2e-db-lock.cjs').lockE2EDatabase(source).then(r=>{globalThis.__release=r;});const r=require('child_process').spawnSync(process.execPath,[require.resolve('prisma/build/index.js'),'migrate','deploy'],{env:process.env,encoding:'utf8'});assert.equal(r.status,0,r.stdout+r.stderr);
 for(const id of ids)await db.member.create({data:{id,email:id+'@bank.test.invalid',name:'Synthetic',nickname:'Synthetic',preferred_username:id.slice(0,20),email_verified:true}});
 await db.creator.create({data:{is_verified:true,is_active:true,user_id:creator}});await db.aiPhotoGrant.create({data:{creator_user_id:creator,reason:'은행이체 테스트'}});
 product=await db.aiShopProduct.create({data:{name:'검증용 10회',description:'x',amount:5000,quantity:10,validity_days:30,visible:true,on_sale:true}});
 adProduct=await db.adProduct.create({data:{name:'주목할 크리에이터 7일',description:'x',terms:'사용 전 환불 가능',amount:11000,duration_days:7,visible:true,on_sale:true}});
 await db.bankTransferAccount.deleteMany({where:{id:'default'}});
});
after(async()=>{try{const orders=await db.bankTransferPayment.findMany({where:{member_id:{in:ids}}});await db.manualRefund.deleteMany({where:{member_id:{in:ids}}});await db.bankTransferPayment.deleteMany({where:{member_id:{in:ids}}});await db.bankTransferAccount.deleteMany({where:{id:'default'}});
  await db.adPurchase.deleteMany({where:{creator_id:creator}});await db.adProduct.deleteMany({where:{id:adProduct?.id}});await db.aiShopUse.deleteMany({where:{creator_id:creator}});await db.aiShopOrder.deleteMany({where:{creator_id:creator}});await db.aiShopProduct.deleteMany({where:{id:product?.id}});await db.aiPhotoGrant.deleteMany({where:{creator_user_id:creator}});
  await db.platformAuditLog.deleteMany({where:{entity_id:{in:[...orders.map(o=>o.id),...orders.map(o=>o.order_id),'default']}}});}finally{await db.$disconnect();await globalThis.__release?.();}});

test('closed until the operator saves an enabled account; PG card stays hidden while live payments are off',async()=>{
 assert.deepEqual(await transfers.methods(),{bankTransfer:false,card:false,deadlineHours:24,refundBusinessDays:3});
 await assert.rejects(beans.createCharge(fan,{quantity:10,requestId:randomUUID(),...order}),code('BANK_TRANSFER_UNAVAILABLE'));
 await assert.rejects(transfers.saveAccount(admin,{bankName:'기업은행',accountNumber:'abc',holder:'좋아하는일해야지',enabled:true}),code('INVALID_BANK_ACCOUNT'));
 await transfers.saveAccount(admin,{bankName:'기업은행',accountNumber:'000-000000-00-000',holder:'좋아하는일해야지',enabled:false});
 assert.equal((await transfers.methods()).bankTransfer,false,'a disabled account keeps bank transfer closed');
 const saved=await transfers.saveAccount(admin,{bankName:'기업은행',accountNumber:'000-000000-00-000',holder:'좋아하는일해야지',enabled:true});assert.equal(saved.enabled,true);
 assert.equal((await transfers.methods()).bankTransfer,true);
 const audit=await db.platformAuditLog.findFirst({where:{action:'bank_transfer.account_saved'},orderBy:{occurred_at:'desc'}});assert.doesNotMatch(JSON.stringify(audit.metadata),/00000000000/);
});

test('bean charge: waits 24h, never touches the PG, exact-amount confirmation credits once with the receipt reconciled',async()=>{
 await assert.rejects(beans.createCharge(fan,{quantity:10,requestId:randomUUID(),...order,depositorName:''}),code('INVALID_DEPOSITOR_NAME'));
 await assert.rejects(beans.createCharge(fan,{quantity:10,requestId:randomUUID(),...order,cashReceipt:{type:'expense',number:'123'}}),code('INVALID_CASH_RECEIPT'));
 const before=await balance(fan,'purchased'),o=await beans.createCharge(fan,{quantity:100,requestId:randomUUID(),...order});
 assert.equal(o.method,'bank_transfer');assert.equal(o.status,'pending');assert.equal(o.environment,'bank');assert.ok(Math.abs(new Date(o.expiresAt)-Date.now()-BANK_TRANSFER_HOURS*3600000)<60000);
 const row=await paymentOf('bean',o.id);assert.equal(row.status,'awaiting');assert.equal(row.amount,11000);assert.equal(row.cash_receipt_type,'income');assert.doesNotMatch(row.cash_receipt_number_encrypted,/01012345678/);
 const view=await transfers.forMember(fan,'bean',o.id);assert.equal(view.account.holder,'좋아하는일해야지');assert.equal(view.depositorName,'홍길동');
 await assert.rejects(transfers.forMember(creator,'bean',o.id),code('BANK_TRANSFER_NOT_FOUND'));
 await assert.rejects(beans.paymentWindow(fan,o.id,{version:'x'}),()=>true);
 await assert.rejects(transfers.confirm(admin,row.id,{amount:10000,receivedAt:new Date().toISOString(),reference:'기업 0001'}),code('DEPOSIT_AMOUNT_MISMATCH'));
 await Promise.all([transfers.confirm(admin,row.id,{amount:11000,receivedAt:new Date().toISOString(),reference:'기업 0001'}),transfers.confirm(admin,row.id,{amount:11000,receivedAt:new Date().toISOString(),reference:'기업 0001'})].map(p=>p.catch(e=>e)));
 const charge=await db.beanCharge.findUniqueOrThrow({where:{id:o.id}});assert.equal(charge.status,'paid');assert.ok(charge.receipt_confirmed_at);assert.equal(charge.received_amount,11000);
 assert.equal(await balance(fan,'purchased')-before,100n,'credited exactly once');assert.equal(await db.beanLot.count({where:{charge_id:o.id}}),1);
 assert.equal((await paymentOf('bean',o.id)).status,'confirmed');
 assert.deepEqual(await transfers.revealCashReceipt(admin,row.id),{type:'income',number:'01012345678'});
 await transfers.recordCashReceipt(admin,row.id,{reference:'홈택스 승인 1',issuedAt:new Date().toISOString()});assert.ok((await paymentOf('bean',o.id)).cash_receipt_issued_at);
 // The PG reconciliation tick and monitor skip bank charges (the provider stub throws if reached).
 await beans.reconcileCharge(o.id);
});

test('an unpaid bean order expires after 24 hours: reservation returns to stock and a late confirmation is refused',async()=>{
 const stock=await balance('company','stock'),o=await beans.createCharge(fan,{quantity:50,requestId:randomUUID(),...order,cashReceipt:undefined});
 assert.equal(await balance('company','stock'),stock-50n);
 const row=await paymentOf('bean',o.id);await db.bankTransferPayment.update({where:{id:row.id},data:{expires_at:new Date(Date.now()-1000)}});
 assert.ok(await transfers.expire()>=1);assert.equal((await paymentOf('bean',o.id)).status,'expired');assert.equal((await db.beanCharge.findUnique({where:{id:o.id}})).status,'cancelled');
 assert.equal(await balance('company','stock'),stock);
 await assert.rejects(transfers.confirm(admin,row.id,{amount:o.amount,receivedAt:new Date().toISOString(),reference:'늦은 입금'}),code('BANK_TRANSFER_CLOSED'));
});

test('bean refund needs an account, stores it encrypted, and completes or restores only through the operator',async()=>{
 const o=await beans.createCharge(fan,{quantity:200,requestId:randomUUID(),...order});const row=await paymentOf('bean',o.id);await transfers.confirm(admin,row.id,{amount:o.amount,receivedAt:new Date().toISOString(),reference:'기업 0002'});
 await assert.rejects(beans.refundCharge(fan,o.id,{requestId:randomUUID()}),code('INVALID_REFUND_ACCOUNT'));
 const refund=await beans.refundCharge(fan,o.id,{requestId:randomUUID(),refundAccount});assert.equal(refund.status,'processing');
 const manual=await db.manualRefund.findFirstOrThrow({where:{kind:'bean',order_id:o.id}});assert.equal(manual.amount,22000);assert.doesNotMatch(manual.account_encrypted+manual.holder_encrypted,/123456789012|홍길동/);
 assert.ok(manual.due_at>=addBusinessDays(manual.created_at,3)-1000);
 assert.deepEqual(await transfers.revealRefundAccount(admin,manual.id),{bankName:'국민은행',accountNumber:'123456789012',holder:'홍길동'});
 await transfers.completeRefund(admin,manual.id,{reference:'환불 이체 1',transferredAt:new Date().toISOString()});
 assert.equal((await db.beanRefund.findUnique({where:{id:refund.id}})).status,'done');assert.equal((await db.manualRefund.findUnique({where:{id:manual.id}})).status,'completed');
 // A rejected manual refund puts the unspent beans back.
 const o2=await beans.createCharge(fan,{quantity:30,requestId:randomUUID(),...order});await transfers.confirm(admin,(await paymentOf('bean',o2.id)).id,{amount:o2.amount,receivedAt:new Date().toISOString(),reference:'기업 0003'});
 const r2=await beans.refundCharge(fan,o2.id,{requestId:randomUUID(),refundAccount});const m2=await db.manualRefund.findFirstOrThrow({where:{kind:'bean',order_id:o2.id}});
 await transfers.rejectRefund(admin,m2.id,{reason:'예금주 불일치'});assert.equal((await db.beanRefund.findUnique({where:{id:r2.id}})).status,'failed');assert.equal((await db.beanLot.findFirst({where:{charge_id:o2.id}})).available,30);
});

test('AI 이용권: bank order survives the 30-minute PG expiry, uses start at confirmation, refund by transfer',async()=>{
 const o=await shop.create(creator,{productId:product.id,version:product.version,termsVersion:AI_SHOP_TERMS,requestId:randomUUID(),...order});
 assert.equal(o.method,'bank_transfer');assert.equal(o.statusLabel,'입금 대기');await assert.rejects(shop.window(creator,o.id),code('ORDER_UNAVAILABLE'));
 await db.aiShopOrder.update({where:{id:o.id},data:{created_at:new Date(Date.now()-3600000)}});await shop.reconcile();assert.equal((await shop.order(creator,o.id)).status,'pending');
 await transfers.confirm(admin,(await paymentOf('ai-shop',o.id)).id,{amount:5000,receivedAt:new Date().toISOString(),reference:'기업 0004'});
 const paid=await shop.order(creator,o.id);assert.equal(paid.status,'paid');assert.equal(paid.remaining,10);assert.ok(paid.expires_at>new Date(Date.now()+29*86400000));
 await assert.rejects(shop.refund(creator,o.id,{}),code('INVALID_REFUND_ACCOUNT'));
 const refunding=await shop.refund(creator,o.id,{refundAccount});assert.equal(refunding.status,'refunding');assert.equal(refunding.statusLabel,'환불 이체 대기');
 const m=await db.manualRefund.findFirstOrThrow({where:{kind:'ai-shop',order_id:o.id}});assert.equal(m.amount,5000);
 await transfers.completeRefund(admin,m.id,{reference:'환불 이체 2',transferredAt:new Date().toISOString()});assert.equal((await shop.order(creator,o.id)).status,'refunded');
 const late=await shop.create(creator,{productId:product.id,version:product.version,termsVersion:AI_SHOP_TERMS,requestId:randomUUID(),...order});await db.bankTransferPayment.update({where:{id:(await paymentOf('ai-shop',late.id)).id},data:{expires_at:new Date(Date.now()-1)}});await transfers.expire();assert.equal((await shop.order(creator,late.id)).status,'cancelled');
});

test('advertising: creators only, usable after the deposit, refundable before use, operator rejection restores it',async()=>{
 await assert.rejects(ads.create(fan,{productId:adProduct.id,version:adProduct.version,requestId:randomUUID(),...order}),()=>true);
 await assert.rejects(ads.create(creator,{productId:adProduct.id,version:adProduct.version,requestId:randomUUID(),method:'card'}),code('PAYMENT_METHOD_UNAVAILABLE'));
 const p=await ads.create(creator,{productId:adProduct.id,version:adProduct.version,requestId:randomUUID(),...order});
 assert.equal(p.status,'pending');assert.equal(p.useStatus,'unavailable');assert.equal(p.statusLabel,'입금 대기');
 await assert.rejects(activateAdPurchase(db,creator,p.id),code('AD_PURCHASE_NOT_PAID'));
 await transfers.confirm(admin,(await paymentOf('ad',p.id)).id,{amount:11000,receivedAt:new Date().toISOString(),reference:'기업 0005'});
 const refunding=await ads.refund(creator,p.id,{refundAccount});assert.equal(refunding.status,'refunding');
 const m=await db.manualRefund.findFirstOrThrow({where:{kind:'ad',order_id:p.id}});await transfers.rejectRefund(admin,m.id,{reason:'계좌 확인 필요'});
 const restored=await db.adPurchase.findUnique({where:{id:p.id}});assert.equal(restored.status,'paid');
 const started=await activateAdPurchase(db,creator,p.id);assert.equal(started.useStatus,'active');
 await assert.rejects(ads.refund(creator,p.id,{refundAccount}),code('AD_REFUND_UNAVAILABLE'));
});

test('operator cancel before a deposit and the business-day due date',async()=>{
 const o=await beans.createCharge(fan,{quantity:10,requestId:randomUUID(),...order});const row=await paymentOf('bean',o.id);
 await transfers.adminCancel(admin,row.id,{reason:'구매자 요청 취소'});assert.equal((await paymentOf('bean',o.id)).status,'cancelled');assert.equal((await db.beanCharge.findUnique({where:{id:o.id}})).status,'cancelled');
 // Friday 10:00 KST + 3 business days = Wednesday 10:00 KST.
 assert.equal(addBusinessDays(new Date('2026-11-20T01:00:00Z'),3).toISOString(),'2026-11-25T01:00:00.000Z');
});

test('operator Telegram outbox: deposit wait, 6 hours left (once), expiry and refund request — amount and kind only, no name or account',async()=>{
 const {operationsAlertText}=require('../dist/src/platform/operations.service');
 const events=async(type,targetId)=>db.platformOperationalEvent.findMany({where:{type,data:{path:'$.targetId',equals:targetId}}});
 const o=await shop.create(creator,{productId:product.id,version:product.version,termsVersion:AI_SHOP_TERMS,requestId:randomUUID(),...order});const pay=await paymentOf('ai-shop',o.id);
 const [opened]=await events('bank_transfer.opened',pay.id);assert.ok(opened,'alert on every new deposit wait');assert.deepEqual(Object.keys(opened.data).sort(),['amount','dueAt','kind','targetId']);assert.equal(opened.data.amount,5000);assert.equal(opened.data.kind,'ai-shop');
 const text=operationsAlertText(opened,'test','secret');assert.match(text,/무통장 입금 대기 주문 접수/);assert.match(text,/kind: AI 이용권/);assert.match(text,/amount: 5,000원/);assert.doesNotMatch(text,/홍길동|010-1234|@bank\.test/,'no depositor name, receipt number or email');
 assert.equal(await transfers.remind(),0,'more than 6 hours left: no reminder');
 await db.bankTransferPayment.update({where:{id:pay.id},data:{expires_at:new Date(Date.now()+5*3600000)}});
 await transfers.remind();await transfers.remind();assert.equal((await events('bank_transfer.expiring',pay.id)).length,1,'one reminder per order');
 await db.bankTransferPayment.update({where:{id:pay.id},data:{expires_at:new Date(Date.now()-1)}});await transfers.expire();await transfers.expire();
 assert.equal((await events('bank_transfer.expired',pay.id)).length,1);
 const b=await beans.createCharge(fan,{quantity:10,requestId:randomUUID(),...order});const bp=await paymentOf('bean',b.id);await transfers.confirm(admin,bp.id,{amount:bp.amount,receivedAt:new Date().toISOString(),reference:'기업 0009'});
 assert.equal((await events('bank_transfer.expired',bp.id)).length,0,'a confirmed order never raises the expiry alert');
 const p=await shop.create(creator,{productId:product.id,version:product.version,termsVersion:AI_SHOP_TERMS,requestId:randomUUID(),...order});await transfers.confirm(admin,(await paymentOf('ai-shop',p.id)).id,{amount:5000,receivedAt:new Date().toISOString(),reference:'기업 0010'});
 await shop.refund(creator,p.id,{refundAccount});const m=await db.manualRefund.findFirstOrThrow({where:{kind:'ai-shop',order_id:p.id}});
 const [refund]=await events('manual_refund.requested',m.id);assert.ok(refund);assert.equal(refund.data.amount,5000);assert.equal(refund.data.dueAt,m.due_at.toISOString());assert.doesNotMatch(JSON.stringify(refund.data),/국민은행|123456789012|홍길동/);
 await db.platformOperationalEvent.deleteMany({where:{type:{in:['bank_transfer.opened','bank_transfer.expiring','bank_transfer.expired','manual_refund.requested']},data:{path:'$.kind',equals:'ai-shop'}}}).catch(()=>{});
});
