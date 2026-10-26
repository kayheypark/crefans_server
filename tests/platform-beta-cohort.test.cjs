// Seventeen synthetic accounts, real isolated DB/services, payment provider double only.
require('reflect-metadata');require('dotenv').config({path:'.local/platform.env',override:true});
const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto'),{PrismaClient}=require('@prisma/client'),{ConfigService}=require('@nestjs/config');
assert.equal(process.env.CREFANS_E2E,'true');
const source=process.env.DATABASE_URL;assert.match(source||'',/@127\.0\.0\.1:3307\/crefans_platform_dev$/);
const url=new URL(source);url.pathname='/crefans_platform_e2e';process.env.DATABASE_URL=url.toString();
const {PlatformService}=require('../dist/src/platform/service'),{PlatformFinanceService}=require('../dist/src/platform/finance.service');
const {PlatformAdminGuard}=require('../dist/src/platform/admin.controller'),{adminRevenue}=require('../dist/src/platform/admin-console');
const db=new PrismaClient(),service=new PlatformService(db),roles=['C0','C2','C10','N0','A0',...Array.from({length:12},(_,i)=>`S${String(i+1).padStart(2,'0')}`)];
const ids=Object.fromEntries(roles.map(r=>[r,randomUUID()])),creators=['C0','C2','C10'],plans={},edges=[],approved=new Map();
let release,policy,admin,beforeRevenue,charges=0,cancels=0;
const provider={configForClient:()=>({clientKey:'test-only'}),decrypt:x=>x,charge:async(_key,_customer,o)=>{charges++;const id=o.attempts?o.id+'_'+o.attempts:o.id,r={status:'DONE',orderId:id,totalAmount:o.amount,paymentKey:'test-'+id};approved.set(id,r);return r;},lookup:async id=>approved.get(id),cancel:async key=>{cancels++;const old=[...approved.values()].find(r=>r.paymentKey===key),r={...old,status:'CANCELED',balanceAmount:0};approved.set(r.orderId,r);return r;}};
const finance=new PlatformFinanceService(service,provider,new ConfigService({RENEWAL_MAX_RETRIES:'2',RENEWAL_RETRY_HOURS:'1'}),{});
const code=c=>e=>e.getResponse?.().code===c;
const post=(creator,level,extra={})=>({user_sub:ids[creator],status:'PUBLISHED',is_public:true,is_deleted:false,is_membership:level>0,membership_level:level,...extra});
const edge=r=>edges.find(e=>e.role===r);
before(async()=>{
 release=await require('./e2e-db-lock.cjs').lockE2EDatabase(source);
 policy=await db.financialPolicy.findUniqueOrThrow({where:{id:'platform'}});
 await db.financialPolicy.update({where:{id:'platform'},data:{platform_fee_bps:2000,settlement_hold_days:0}});
 for(const role of roles)await db.member.create({data:{id:ids[role],email:`cohort-${ids[role]}@example.invalid`,name:'',nickname:role,preferred_username:ids[role],email_verified:true,status:'CONFIRMED'}});
 admin=await db.admin.create({data:{user_sub:ids.A0,email:`cohort-${ids.A0}@example.invalid`,name:'A0',role:'SUPER_ADMIN'}});
 beforeRevenue=(await adminRevenue(db,admin,{})).summary;
 for(const creator of creators){await db.creator.create({data:{user_id:ids[creator],display_name:creator}});plans[creator]=[];for(const rank of[1,2,3])plans[creator].push(await db.membershipItem.create({data:{creator_id:ids[creator],name:`${creator} L${rank}`,level:rank,price:10000,benefits:'[]',billing_unit:'MONTH'}}));}
 for(let i=1;i<=12;i++){
  const role=`S${String(i).padStart(2,'0')}`,creator=i<=2?'C2':'C10',rank=i<=2?i:i<=6?1:i<=10?2:3;
  await db.billingMethod.create({data:{member_id:ids[role],customer_key:randomUUID(),billing_key_encrypted:'test-only',label:'Test',last_four:'1234',is_default:true}});
  const order=await finance.createOrder(ids[role],{planId:plans[creator][rank-1].id,requestId:randomUUID()});
  await finance.pay(ids[role],order.id);await finance.pay(ids[role],order.id);
  edges.push({role,creator,rank,order:order.id,sub:await db.subscription.findFirstOrThrow({where:{subscriber_id:ids[role]}})});
 }
});
after(async()=>{try{
 const members=Object.values(ids),ownerIds=creators.map(c=>ids[c]);
 for(const table of['billingNotice','memberNotification'])await db[table].deleteMany({where:{member_id:{in:members}}});
 await db.revenueEntry.deleteMany({where:{creator_id:{in:ownerIds}}});await db.checkoutOrder.deleteMany({where:{member_id:{in:members}}});await db.subscription.deleteMany({where:{subscriber_id:{in:members}}});
 await db.billingMethod.deleteMany({where:{member_id:{in:members}}});await db.membershipItem.deleteMany({where:{creator_id:{in:ownerIds}}});await db.creator.deleteMany({where:{user_id:{in:ownerIds}}});await db.admin.deleteMany({where:{user_sub:{in:members}}});await db.member.deleteMany({where:{id:{in:members}}});
 if(policy)await db.financialPolicy.update({where:{id:'platform'},data:policy});
 }finally{await db.$disconnect();await release?.();}});
test('17 accounts establish 0/2/10 subscribers with exactly 12 charges and 20 percent fee ledger',async()=>{
 assert.equal(roles.length,17);assert.equal(charges,12);
 for(const [creator,count]of[['C0',0],['C2',2],['C10',10]]){
  assert.equal(await db.subscription.count({where:{membership_item:{creator_id:ids[creator]}}}),count);
  const {summary:s}=await finance.finance(ids[creator]);assert.equal(s.gross,count*10000);assert.equal(s.fees,count*2000);assert.equal(s.net,count*8000);
 }
 const current=(await adminRevenue(db,admin,{})).summary;
 for(const [field,delta]of Object.entries({count:12,gross:120000,platformFees:24000,creatorNet:96000}))assert.equal(current[field]-beforeRevenue[field],delta,field);
});
test('18 roles including guest cross all 3 creators and public/tier/exact/adult/draft/deleted boundaries',async()=>{
 let checks=0;
 for(const role of [...roles,'G0'])for(const creator of creators){
  const subscription=edge(role),owner=role===creator,belongs=subscription?.creator===creator;
  const cases=[...Array.from({length:4},(_,level)=>[post(creator,level),owner||level===0||belongs&&subscription.rank>=level]),
   [post(creator,1,{access_plan_id:plans[creator][0].id}),owner||belongs&&subscription.rank===1],
   [post(creator,1,{is_sensitive:true}),owner],
   [post(creator,1,{status:'DRAFT'}),owner],[post(creator,1,{is_deleted:true}),owner]];
  for(const [p,expected]of cases){assert.equal(await service.access(p,ids[role]),!!expected,`${role}/${creator}/${JSON.stringify(p)}`);checks++;}
 }
 assert.equal(checks,432);
 const guard=new PlatformAdminGuard(service),ctx=role=>({switchToHttp:()=>({getRequest:()=>({user:{sub:ids[role]}})})});
 for(const role of roles.filter(r=>r!=='A0'))await assert.rejects(guard.canActivate(ctx(role)),code('ADMIN_REQUIRED'));
 assert.equal(await guard.canActivate(ctx('A0')),true);
 await db.admin.update({where:{id:admin.id},data:{is_active:false}});await assert.rejects(guard.canActivate(ctx('A0')),code('ADMIN_REQUIRED'));
 await db.admin.update({where:{id:admin.id},data:{is_active:true}});
});
test('same cohort keeps paid access on cancellation, loses expired/refunded rights, renews once and rejects consumed refunds',async()=>{
 const cancelled=edge('S03');await finance.cancelSubscription(ids.S03,ids.C10);assert.equal(await service.access(post('C10',1),ids.S03),true);
 await db.subscription.update({where:{id:cancelled.sub.id},data:{ended_at:new Date(0)}});assert.equal(await service.access(post('C10',1),ids.S03),false);
 const renewed=edge('S04'),past=new Date(Date.now()-60000);await db.subscription.update({where:{id:renewed.sub.id},data:{ended_at:past,next_billing_date:past}});
 await finance.renew(renewed.sub.id);await finance.renew(renewed.sub.id);assert.equal(charges,13);assert.equal(await service.access(post('C10',1),ids.S04),true);
 const refunded=edge('S08');await finance.refund(ids.S08,refunded.order);await finance.refund(ids.S08,refunded.order);assert.equal(cancels,1);assert.equal(await service.access(post('C10',1),ids.S08),false);
 assert.equal(await service.consumeContent(post('C10',2),ids.S09),true);await assert.rejects(finance.refund(ids.S09,edge('S09').order),code('CONTENT_ALREADY_ACCESSED'));
 for(const r of['N0','A0','C0','S01'])await assert.rejects(finance.order(ids[r],edge('S09').order),code('ORDER_NOT_FOUND'));
 assert.equal(await db.subscription.count({where:{subscriber_id:{in:edges.map(e=>ids[e.role])}}}),12);
 const current=(await adminRevenue(db,admin,{})).summary;
 for(const [field,delta]of Object.entries({count:13,gross:130000,refunds:10000,netSales:120000,platformFees:24000,creatorNet:96000}))assert.equal(current[field]-beforeRevenue[field],delta,field);
});
