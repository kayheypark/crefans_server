require('reflect-metadata');require('dotenv').config({path:'.local/platform.env',override:true});
const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),{randomUUID,randomBytes}=require('node:crypto'),{PrismaClient}=require('@prisma/client');
const source=process.env.DATABASE_URL;assert.match(source||'',/@127\.0\.0\.1:3307\/crefans_platform_dev$/);const url=new URL(source);url.pathname='/crefans_platform_e2e';process.env.DATABASE_URL=url.toString();Object.assign(process.env,{LOCAL_AUTH_SECRET:'p'.repeat(64),DATA_ENCRYPTION_KEY:'d'.repeat(64)});
const {NestFactory}=require('@nestjs/core'),{PlatformModule}=require('../dist/src/platform/module'),{cookieParser}=require('../dist/src/platform/middleware'),{EnvelopeInterceptor,PlatformExceptionFilter}=require('../dist/src/platform/http'),{digest}=require('../dist/src/auth/local/credentials'),{revenuePeriod}=require('../dist/src/platform/admin-console'),{adminDashboard,dashboardPeriod}=require('../dist/src/platform/admin-dashboard');
const adminCookie=require('./admin-session.cjs'),db=new PrismaClient(),members=[],creatorIds=[],orders=[],cookies={},tickets=[],reports=[],documents=[];let app,origin,release,fan,creator;
async function api(path,user='super',body,method=body?'POST':'GET'){const res=await fetch(origin+'/api/v1/admin/'+path,{method,headers:{...(cookies[user]?{Cookie:cookies[user]}:{}),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return{status:res.status,...await res.json()};}
async function order(creatorId,at,amount,fees,status='paid',entry=true){const id=randomUUID();orders.push(id);await db.checkoutOrder.create({data:{id,member_id:fan,membership_id:'synthetic-plan',snapshot:{secret:'must-not-leak'},amount,status,payment_key:'private-payment-'+id,paid_at:at?new Date(at):null,created_at:new Date('2005-01-01T00:00:00+09:00'),idempotency_key:id,expires_at:new Date('2005-02-01')}});if(entry)await db.revenueEntry.create({data:{creator_id:creatorId,order_id:id,title:'Admin fixture',gross:amount,reversals:status==='refunded'?amount:0,fees:status==='refunded'?0:fees,net:status==='refunded'?0:amount-fees,available_at:new Date(),created_at:new Date('2020-01-01')}});return id;}
before(async()=>{
 release=await require('./e2e-db-lock.cjs').lockE2EDatabase(source);
 const fs=require('node:fs/promises'),path=require('node:path'),temp=await fs.mkdtemp(path.join(require('node:os').tmpdir(),'crefans-admin-schema-'));
 try{await fs.copyFile('prisma/schema.prisma',path.join(temp,'schema.prisma'));await fs.cp('prisma/migrations',path.join(temp,'migrations'),{recursive:true});const r=require('node:child_process').spawnSync(process.execPath,[require.resolve('prisma/build/index.js'),'migrate','deploy','--schema',path.join(temp,'schema.prisma')],{cwd:temp,env:process.env,encoding:'utf8'});assert.equal(r.status,0,'isolated migrations must pass');}finally{await fs.rm(temp,{recursive:true,force:true});}
 for(const [key,role]of[['super','SUPER_ADMIN'],['admin','ADMIN'],['moderator','MODERATOR'],['disabled','SUPER_ADMIN'],['fan',null]]){const id=randomUUID();members.push(id);await db.member.create({data:{id,email:id+'@example.invalid',name:'Admin fixture',nickname:'Admin fixture',preferred_username:id,password_hash:'private-password-hash',identity_hash:digest(id),email_verified:true,status:'CONFIRMED'}});const row=role?await db.admin.create({data:{user_sub:id,email:id+'@example.invalid',name:'Admin fixture',role,is_active:key!=='disabled'}}):null;const token='la.'+randomBytes(32).toString('base64url');cookies[key]='access_token='+token;await db.memberSession.create({data:{member_id:id,access_hash:digest(token),refresh_hash:digest(randomUUID()),access_until:new Date(Date.now()+3600000),expires_at:new Date(Date.now()+3600000)}});if(row)cookies[key]=await adminCookie(db,row.id);if(key==='fan')fan=id;}
 creator=randomUUID();creatorIds.push(creator);await db.creator.create({data:{user_id:creator,display_name:'검증 크리에이터'}});
 await order(creator,'2005-01-01T00:00:00+09:00',10000,1000);await order(creator,'2005-01-02T23:59:59.999+09:00',20000,2000,'refunding');await order(creator,'2005-01-01T12:00:00+09:00',30000,3000,'refunded');
 await order(creator,'2004-12-31T23:59:59.999+09:00',99999,1);await order(creator,'2005-01-03T00:00:00+09:00',99999,1);await order(creator,null,99999,1,'failed',false);await order(creator,null,99999,1,'processing',false);await order(creator,null,99999,1,'pending',false);
 for(let i=0;i<21;i++){const id=randomUUID();creatorIds.push(id);await db.creator.create({data:{user_id:id,display_name:'페이지 검증 '+i}});await order(id,'2005-01-02T09:00:00+09:00',1,0);}
 app=await NestFactory.create(PlatformModule,{logger:false});app.setGlobalPrefix('api/v1');app.use(cookieParser());app.use((req,res,next)=>require('../dist/src/platform/request-context').requestContext.run({ip:'127.0.0.1',peerIp:'127.0.0.1',requestId:randomUUID()},next));app.useGlobalInterceptors(new EnvelopeInterceptor());app.useGlobalFilters(new PlatformExceptionFilter());await app.listen(0,'127.0.0.1');origin=await app.getUrl();
});
after(async()=>{await app?.close();await db.platformOperationalEvent.deleteMany({where:{OR:[...tickets,...reports,...documents].map(id=>({data:{path:'$.targetId',equals:id}}))}});await db.supportTicket.deleteMany({where:{id:{in:tickets}}});await db.userReport.deleteMany({where:{id:{in:reports}}});await db.serviceDocument.deleteMany({where:{id:{in:documents}}});await db.revenueEntry.deleteMany({where:{order_id:{in:orders}}});await db.checkoutOrder.deleteMany({where:{id:{in:orders}}});await db.creator.deleteMany({where:{user_id:{in:creatorIds}}});await db.admin.deleteMany({where:{user_sub:{in:members}}});await db.member.deleteMany({where:{id:{in:members}}});await db.$disconnect();await release?.();});
test('every console endpoint rejects anonymous, ordinary member and inactive admin',async()=>{for(const path of['me','overview','dashboard','members','posts','revenue','payments','withdrawals'])for(const user of['none','fan','disabled']){const r=await api(path,user);assert.equal(r.status,401,path+' '+user);assert.equal(r.success,false);assert.equal(r.data,null);}});
test('financial views require financial role on server even for crafted URLs',async()=>{for(const path of['dashboard','revenue','payments','withdrawals']){assert.equal((await api(path,'moderator')).status,403);assert.equal((await api(path,'admin')).status,200);}assert.equal((await api('me','moderator')).data.role,'MODERATOR');});
test('KST boundaries, paid-at basis, pending refunds, full reversal and fee/net invariant',async()=>{const r=await api('revenue?from=2005-01-01&to=2005-01-02');assert.equal(r.status,200);assert.deepEqual(r.data.summary,{count:24,gross:60021,refunds:30000,netSales:30021,platformFees:3000,creatorNet:27021});assert.equal(r.data.summary.netSales,r.data.summary.platformFees+r.data.summary.creatorNet);assert.deepEqual(r.data.daily.map(d=>d.date),['2005-01-01','2005-01-02']);assert.equal(r.data.daily.reduce((n,d)=>n+d.gross,0),60021);assert.equal(r.data.basis,'approval-cohort-current-ledger');assert.equal(r.data.period.timeZone,'Asia/Seoul');assert.equal(r.data.creators.total,22);assert.equal(r.data.creators.items[0].id,creator);assert.equal(r.data.creators.items.length,20);});
test('creator paging is stable and does not change whole-period totals',async()=>{const a=(await api('revenue?from=2005-01-01&to=2005-01-02&page=1')).data,b=(await api('revenue?from=2005-01-01&to=2005-01-02&page=2')).data;assert.deepEqual(a.summary,b.summary);assert.equal(b.creators.items.length,2);assert.equal(new Set([...a.creators.items,...b.creators.items].map(c=>c.id)).size,22);});
test('empty approval period is real zero without sample fallback',async()=>{const r=await api('revenue?from=2005-06-01&to=2005-06-02');assert.equal(r.status,200);assert.equal(r.data.summary.count,0);assert.equal(r.data.summary.gross,0);assert.deepEqual(r.data.daily,[]);});
test('invalid date, injection, overlong range, reversed range and malformed pages fail',async()=>{for(const q of['from=2005-02-30','from=2005-01-01&to=2006-01-02','from=2005-03-01&to=2005-02-01','from=2005-01-01%27%20OR%201=1','page=0','page=-1','page=1.2','page=1&page=2','from=2005-01-01&from=2005-01-02'])assert.equal((await api('revenue?'+q)).status,400,q);const p=revenuePeriod({},new Date('2026-10-31T15:00:00Z'));assert.equal(p.from,'2026-11-01');assert.equal(p.to,'2026-11-01');});
test('member and payment lists never expose password, identity, snapshot or PG keys',async()=>{const m=await api('members?search='+fan),p=await api('payments?from=2005-01-01&to=2005-01-02');assert.equal(m.status,200);assert.equal(m.data.items.length,1);const all=JSON.stringify([m,p]);for(const secret of['password_hash','identity_hash','payment_key','must-not-leak','private-payment-','private-password-hash','billing_key_encrypted','snapshot'])assert.equal(all.includes(secret),false,secret);assert.equal(p.data.pageSize,20);assert.ok(p.data.total>=29);});

test('support/report/document writes record administrator and target without raw content',async()=>{
 const ticket=await db.supportTicket.create({data:{member_id:fan,category:'기타',title:'검증 문의',message:'private inquiry body'}});tickets.push(ticket.id);
 const report=await db.userReport.create({data:{reporter_id:fan,target_type:'POSTING',target_id:randomUUID(),reason:'OTHER'}});reports.push(report.id);
 assert.equal((await api(`inquiries/${ticket.id}/reply`,'super',{reply:'private reply body'})).status,201);
 const results=await Promise.all(['super','admin'].map(user=>api(`reports/${report.id}/resolve`,user,{status:'RESOLVED',note:'private report memo'})));assert.deepEqual(results.map(r=>r.status).sort(),[201,409]);
 const told=await db.memberNotification.findMany({where:{member_id:fan,type:'moderation',created_at:{gte:report.created_at}}});assert.equal(told.length,1,'the reporter is told once that review finished');assert.equal(told[0].text,'신고하신 내용을 검토하고 조치했습니다.');assert.equal(told[0].text.includes('private'),false,'the internal note stays private');await db.memberNotification.deleteMany({where:{id:told[0].id}});
 const doc=await api('documents','super',{kind:'notice',title:'검증 공지',published:false,content:{paragraphs:['private document body']}});assert.equal(doc.status,201);documents.push(doc.data.id);
 const stored=await db.platformOperationalEvent.findMany({where:{OR:[...tickets,...reports,...documents].map(id=>({data:{path:'$.targetId',equals:id}}))}});assert.equal(stored.length,3);assert.equal(new Set(stored.map(e=>e.type)).size,3);for(const event of stored){assert.ok(event.data.memberId);assert.ok(event.data.targetId);assert.equal(JSON.stringify(event).includes('private '),false);}
 assert.equal((await api('documents','moderator',{kind:'notice',title:'denied',published:true,content:{paragraphs:['denied']}})).status,403);
});


test('dashboard separates first subscriptions, renewals and refunds, zero fills and compares equal elapsed time',async()=>{
 const first=randomUUID(),second=randomUUID(),third=randomUUID();
 async function paid(at,amount,sub,status='paid'){const id=await order(creator,at,amount,Math.floor(amount/10),status);await db.checkoutOrder.update({where:{id},data:{subscription_id:sub}});}
 await paid('2006-03-01T09:00:00+09:00',1000,first);
 await paid('2006-04-01T09:00:00+09:00',2000,second);
 await paid('2006-04-01T18:00:00+09:00',4000,third);
 await paid('2006-04-02T00:00:00+09:00',1000,first);
 await paid('2006-04-02T11:59:59.999+09:00',3000,randomUUID(),'refunded');
 await paid('2006-04-02T12:00:00+09:00',8000,randomUUID());
 const failed=await order(creator,'2006-04-02T10:00:00+09:00',999999,0,'failed',false);await db.checkoutOrder.update({where:{id:failed},data:{subscription_id:randomUUID()}});
 const partial=await adminDashboard(db,{role:'SUPER_ADMIN'},{date:'2006-04-02',days:'7'},new Date('2006-04-02T12:00:00+09:00'));
 assert.deepEqual(partial.summary,{newSubscriptions:1,paymentCount:2,gross:4000,refunds:3000,netSales:1000,platformFees:100});
 assert.deepEqual(partial.previous,{newSubscriptions:1,paymentCount:1,gross:2000,refunds:0,netSales:2000,platformFees:200});
 assert.equal(partial.period.partial,true);assert.equal(partial.period.previousCutoff,'2006-04-01T03:00:00.000Z');assert.equal(partial.trend.length,7);assert.equal(partial.trend[0].date,'2006-03-27');assert.equal(partial.trend[0].gross,0);
 // Prior chart day includes its whole day, while comparison intentionally stops at noon.
 assert.equal(partial.trend[5].gross,6000);
 const full=await api('dashboard?date=2006-04-02&days=30');assert.equal(full.status,200);assert.equal(full.data.summary.gross,12000);assert.equal(full.data.summary.newSubscriptions,2);assert.equal(full.data.summary.paymentCount,3);assert.equal(full.data.previous.gross,6000);assert.equal(full.data.period.partial,false);assert.equal(full.data.trend.length,30);
 const empty=await api('dashboard?date=2007-05-01&days=90');assert.equal(empty.data.trend.length,90);assert.equal(empty.data.summary.gross,0);assert.ok(empty.data.trend.every(r=>r.paymentCount===0&&r.gross===0));assert.equal(empty.data.basis,'subscription-approval-cohort-current-ledger');
});
test('dashboard rejects malformed dates and ranges and handles KST month boundary',async()=>{
 for(const q of ['date=2006-02-30','date=2099-12-31','date=2006-04-01&date=2006-04-02','days=1','days=366','days=7&days=90','days=7%27%20OR%201=1'])assert.equal((await api('dashboard?'+q)).status,400,q);
 const p=dashboardPeriod({},new Date('2026-10-31T15:01:00Z'));assert.equal(p.day,'2026-11-01');assert.equal(p.previousEnd.toISOString(),'2026-10-30T15:01:00.000Z');assert.equal(+p.end-+p.start,60000);
});

test('dashboard live subscription snapshot includes cancellation reservations but not expired or future periods',async()=>{
 const now=new Date('2008-05-01T12:00:00+09:00'),plan=randomUUID(),subs=[];
 const baseline=(await adminDashboard(db,{role:'ADMIN'},{date:'2008-05-01',days:'7'},now)).currentActive;
 await db.membershipItem.create({data:{id:plan,creator_id:creator,name:'dashboard fixture',price:1000,billing_unit:'MONTH',benefits:''}});
 try{
  for(const [status,start,end]of[['ONGOING',-1000,1000],['CANCELLED',-1000,1000],['EXPIRED',-1000,1000],['ONGOING',1000,2000],['CANCELLED',-1000,0]]){
   const id=randomUUID();subs.push(id);await db.subscription.create({data:{id,subscriber_id:randomUUID(),membership_item_id:plan,status,amount:1000,started_at:new Date(+now+start),ended_at:new Date(+now+end)}});
  }
  const data=await adminDashboard(db,{role:'ADMIN'},{date:'2008-05-01',days:'7'},now);assert.equal(data.currentActive-baseline,2);assert.equal(data.summary.gross,0);
 }finally{await db.subscription.deleteMany({where:{id:{in:subs}}});await db.membershipItem.delete({where:{id:plan}});}
});


test('creator verification requires an active administrator, persists both transitions and cannot be self-assigned',async()=>{
 const category=await db.creatorCategory.create({data:{name:'verification-'+randomUUID()}});
 await db.creator.create({data:{user_id:fan,display_name:'Badge fixture',handle:'badge_'+fan.replaceAll('-','').slice(0,16),category_id:category.id}});
 const endpoint=`creators/${fan}/verification`;
 async function publicGet(path){const r=await fetch(origin+'/api/v1/'+path);assert.equal(r.status,200);return(await r.json()).data;}
 try{
  assert.equal((await db.creator.findUnique({where:{user_id:fan}})).is_verified,false);
  assert.equal((await publicGet('profiles/'+fan)).isVerified,false);
  for(const [user,status]of[['none',401],['fan',401],['disabled',401],['moderator',403]])assert.equal((await api(endpoint,user,{isVerified:true},'PUT')).status,status,user);
  for(const isVerified of [undefined,null,'true',1,{},[]])assert.equal((await api(endpoint,'admin',{isVerified},'PUT')).status,400);
  assert.equal((await api(`creators/${randomUUID()}/verification`,'admin',{isVerified:true},'PUT')).status,404);
  assert.equal((await api(`creators/${members[0]}/verification`,'admin',{isVerified:true},'PUT')).status,404,'ordinary member has no creator record');
  const input={name:'Badge fixture',handle:'badge_'+fan.replaceAll('-','').slice(0,16),category:category.name,isVerified:true,is_verified:true};
  const attempt=await fetch(origin+'/api/v1/studio/profile',{method:'PUT',headers:{Cookie:cookies.fan,'Content-Type':'application/json'},body:JSON.stringify(input)});assert.equal(attempt.status,200);
  assert.equal((await db.creator.findUnique({where:{user_id:fan}})).is_verified,false,'studio allowlist ignores privileged fields');
  const grant=await api(endpoint,'admin',{isVerified:true,promoted:true},'PUT');assert.equal(grant.status,200);assert.equal(grant.data.isVerified,true);
  assert.equal((await db.creator.findUnique({where:{user_id:fan}})).promoted,false,'badge mutation accepts no unrelated fields');
  assert.equal((await publicGet('profiles/'+fan)).isVerified,true);
  assert.equal((await publicGet('creators?query=Badge')).creators.find(c=>c.id===fan).isVerified,true);
  assert.equal((await publicGet('bootstrap')).data.creators.find(c=>c.id===fan).isVerified,true);
  assert.equal((await api('members?search='+fan)).data.items[0].creator.is_verified,true);
  const concurrent=await Promise.all([api(endpoint,'super',{isVerified:false},'PUT'),api(endpoint,'admin',{isVerified:false},'PUT')]);assert.ok(concurrent.every(r=>r.status===200));
  assert.equal((await publicGet('profiles/'+fan)).isVerified,false);
  const logs=await db.platformAuditLog.findMany({where:{entity_id:fan,action:'admin.creator_verification_changed'},orderBy:{occurred_at:'asc'}});
  assert.equal(logs.length,2,'no-op duplicate revocation produces no false change record');
  assert.deepEqual(logs.map(l=>[l.metadata.before.is_verified,l.metadata.after.is_verified]),[[false,true],[true,false]]);
  for(const log of logs){assert.ok(members.includes(log.actor_id));assert.ok(['ADMIN','SUPER_ADMIN'].includes(log.actor_role));assert.equal(log.ip,'127.0.0.1');assert.ok(log.request_id);}
 }finally{
  await db.platformAuditLog.deleteMany({where:{OR:[{entity_id:fan},{actor_id:{in:members}}]}});
  await db.platformOperationalEvent.deleteMany({where:{data:{path:'$.memberId',equals:fan}}});
  await db.creator.delete({where:{user_id:fan}});await db.creatorCategory.delete({where:{id:category.id}});
 }
});

test('activity fields enforce list/create/update permissions, validation, uniqueness and audit records',async()=>{
 const name='qa-'+randomUUID().slice(0,28),other='qa-'+randomUUID(),deleted='qa-'+randomUUID();
 const admin=await db.admin.findFirstOrThrow({where:{user_sub:members[1]}});
 try{
  for(const user of ['none','fan','disabled'])assert.equal((await api('categories',user)).status,401,user);
  assert.equal((await api('categories','moderator')).status,200);
  assert.equal((await api('categories','moderator',{name})).status,403);
  await db.admin.update({where:{id:admin.id},data:{permissions:{settings:{view:true,update:true}}}});
  assert.equal((await api('categories','admin')).status,403,'financial settings permission does not grant category access');
  assert.equal((await api('categories','admin',{name})).status,403);
  await db.admin.update({where:{id:admin.id},data:{permissions:{content:{view:true,create:true}}}});
  for(const input of [{},{name:''},{name:'   '},{name:'가'.repeat(41)},{name:123}])assert.equal((await api('categories','admin',input)).status,400);
  const concurrent=await Promise.all([1,2,3].map(()=>api('categories','admin',{name:'  '+name+'  '})));
  assert.deepEqual(concurrent.map(r=>r.status).sort(),[201,409,409]);
  assert.ok(concurrent.filter(r=>r.status===409).every(r=>r.errorCode==='CATEGORY_EXISTS'));
  const row=await db.creatorCategory.findUniqueOrThrow({where:{name}});
  assert.equal(row.is_active,true);
  assert.equal((await api('categories','admin',{name,active:false})).status,403,'create is not update');
  for(const active of [null,'false',0,{}])assert.equal((await api('categories','moderator',{name,active})).status,400);
  const missing=await api('categories','moderator',{name:other,active:false});assert.equal(missing.status,404);assert.equal(missing.errorCode,'CATEGORY_NOT_FOUND');
  assert.equal(await db.creatorCategory.count({where:{name:other}}),0,'update cannot create');
  assert.equal((await api('categories','moderator',{name,active:false})).status,201);
  assert.equal((await api('categories','admin',{name})).status,409);
  assert.equal((await db.creatorCategory.findUniqueOrThrow({where:{name}})).is_active,false,'duplicate creation cannot reactivate');
  const deactivated=await Promise.all([1,2].map(()=>api('categories','moderator',{name,active:false})));assert.ok(deactivated.every(r=>r.status===201));
  await db.creatorCategory.create({data:{name:deleted,is_deleted:true,is_active:true}});
  assert.equal((await api('categories','admin',{name:deleted})).status,409);
  assert.equal((await api('categories','moderator',{name:deleted,active:true})).status,404);
  const list=(await api('categories','moderator')).data;
  assert.deepEqual(list.find(c=>c.id===row.id),{id:row.id,name,active:false,sortOrder:row.sort_order,iconUrl:null,customIcon:false});assert.equal(list.some(c=>c.name===deleted),false);
  for(const item of list)assert.deepEqual(Object.keys(item).sort(),['active','customIcon','iconUrl','id','name','sortOrder']);
  const logs=await db.platformAuditLog.findMany({where:{entity_id:row.id,action:'admin.category_saved'},orderBy:{occurred_at:'asc'}});
  assert.equal(logs.length,2,'duplicates and no-op updates do not add false changes');
  assert.equal(logs[0].metadata.after.is_active,true);assert.equal(logs[1].metadata.before.is_active,true);assert.equal(logs[1].metadata.after.is_active,false);
  for(const log of logs){assert.ok(members.includes(log.actor_id));assert.ok(['ADMIN','MODERATOR'].includes(log.actor_role));assert.equal(log.ip,'127.0.0.1');assert.ok(log.request_id);}
 }finally{
  await db.admin.update({where:{id:admin.id},data:{permissions:require('@prisma/client').Prisma.DbNull}});
  const rows=await db.creatorCategory.findMany({where:{name:{in:[name,other,deleted]}}});
  await db.platformAuditLog.deleteMany({where:{entity_id:{in:rows.map(r=>r.id)}}});await db.creatorCategory.deleteMany({where:{id:{in:rows.map(r=>r.id)}}});
 }
});

test('a category added by console API reaches creator onboarding and inactive fields cannot be selected',async()=>{
 const name='qa-'+randomUUID();
 const profile={name:'분야 연동 검증',handle:'category_'+fan.replaceAll('-','').slice(0,20),category:name};
 async function memberApi(path,body){const r=await fetch(origin+'/api/v1/'+path,{method:body?'POST':'GET',headers:{Cookie:cookies.fan,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return{status:r.status,...await r.json()};}
 try{
  assert.equal((await memberApi('studio/start',profile)).status,400);
  assert.equal((await api('categories','admin',{name})).status,201);
  assert.ok((await memberApi('studio/overview')).data.categories.includes(name));
  assert.ok((await memberApi('bootstrap')).data.data.categories.includes(name));
  assert.equal((await memberApi('studio/start',profile)).status,201);
  const created=await db.creator.findUniqueOrThrow({where:{user_id:fan},include:{category:true}});assert.equal(created.category.name,name);
  assert.equal((await api('categories','moderator',{name,active:false})).status,201);
  assert.equal((await memberApi('studio/overview')).data.categories.includes(name),false);
  assert.equal((await memberApi('studio/start',profile)).status,400);
 }finally{
  await db.creator.deleteMany({where:{user_id:fan}});
  const row=await db.creatorCategory.findUnique({where:{name}});
  await db.platformAuditLog.deleteMany({where:{OR:[{entity_id:row?.id||'missing'},{entity_id:fan}]}});
  await db.platformOperationalEvent.deleteMany({where:{data:{path:'$.memberId',equals:fan}}});
  await db.creatorCategory.deleteMany({where:{name}});
 }
});

test('membership and subscription lists are read-only revenue views without billing secrets',async()=>{
 const tag='구독현황검증'+randomBytes(4).toString('hex'),owner=randomUUID(),plans=[],subs=[];creatorIds.push(owner);await db.creator.create({data:{user_id:owner,display_name:tag,handle:'h'+randomBytes(6).toString('hex')}});
 try{
  const plan=async(name,extra={})=>{const p=await db.membershipItem.create({data:{name,creator_id:owner,price:10000,billing_unit:'MONTH',billing_period:1,benefits:'a',...extra}});plans.push(p.id);return p;};
  const live=await plan(tag+' 판매'),off=await plan(tag+' 중지',{is_active:false}),gone=await plan(tag+' 삭제',{is_deleted:true,is_active:false});
  let n=0;const day=86400000,sub=async(status,end,extra={})=>{const s=await db.subscription.create({data:{subscriber_id:fan,started_at:new Date(Date.now()-90*day+(n++)*1000),membership_item_id:live.id,status,amount:10000,auto_renew:status==='ONGOING',ended_at:end===null?null:new Date(Date.now()+end),plan_snapshot:{secret:'must-not-leak'},billing_key:'private-billing-key',billing_method_id:'private-method-id',...extra}});subs.push(s.id);return s;};
  await sub('ONGOING',30*day,{next_billing_date:new Date(Date.now()+30*day)});await sub('CANCELLED',5*day);await sub('CANCELLED',-day);await sub('EXPIRED',-40*day);
  for(const path of['memberships','subscriptions']){for(const user of['none','fan','disabled'])assert.equal((await api(path,user)).status,401,path+' '+user);assert.equal((await api(path,'moderator')).status,403,path);assert.equal((await api(path,'admin')).status,200,path);}
  for(const method of['POST','PUT','DELETE'])for(const path of['memberships','subscriptions'])assert.equal((await api(path,'super',{},method)).status,404,method+' '+path);
  const all=(await api('memberships?search='+encodeURIComponent(tag))).data;assert.deepEqual(all.items.map(p=>p.id).sort(),[live.id,off.id].sort(),'deleted plans are hidden by default');
  const row=all.items.find(p=>p.id===live.id);assert.equal(row.price,10000);assert.equal(row.billingUnit,'MONTH');assert.equal(row.creator.name,tag);assert.deepEqual(row.subscriptions,{current:2,autoRenew:1,cancelled:2,expired:1});
  assert.deepEqual((await api('memberships?state=deleted&search='+encodeURIComponent(tag))).data.items.map(p=>p.id),[gone.id]);assert.deepEqual((await api('memberships?state=inactive&search='+encodeURIComponent(tag))).data.items.map(p=>p.id),[off.id]);
  const list=(await api('subscriptions?membershipId='+live.id)).data;assert.equal(list.total,4);assert.deepEqual(list.summary,{current:2,ONGOING:1,CANCELLED:2,EXPIRED:1});assert.equal(list.items[0].subscriber.id,fan);assert.equal(list.items[0].subscriber.nickname,'Admin fixture');assert.equal(list.items[0].membership.name,tag+' 판매');
  assert.equal((await api('subscriptions?status=CANCELLED&search='+encodeURIComponent(tag))).data.total,2);assert.equal((await api('subscriptions?search='+fan+'&membershipId='+live.id)).data.total,4);
  const text=JSON.stringify([all,list]);for(const secret of['must-not-leak','private-billing-key','private-method-id','billing_key','plan_snapshot','email','password'])assert.equal(text.includes(secret),false,secret);
  for(const q of['memberships?state=all','memberships?page=0','subscriptions?status=ongoing','subscriptions?status=ONGOING&status=EXPIRED','subscriptions?search='+'x'.repeat(101)])assert.equal((await api(q)).status,400,q);
 }finally{await db.subscription.deleteMany({where:{id:{in:subs}}});await db.membershipItem.deleteMany({where:{id:{in:plans}}});}
});

test('immediate cancel ends access now, is SUPER_ADMIN only, needs a reason and never refunds',async()=>{
 const owner=randomUUID(),tag='즉시해지 '+randomUUID().slice(0,8),plans=[],subs=[],extra=[];
 creatorIds.push(owner);await db.creator.create({data:{user_id:owner,display_name:tag}});
 try{
  const plan=await db.membershipItem.create({data:{name:tag,creator_id:owner,price:10000,billing_unit:'MONTH',billing_period:1,benefits:'a'}});plans.push(plan.id);
  const day=86400000;let n=0;
  const sub=async(status,endOffset)=>{const s=await db.subscription.create({data:{subscriber_id:fan,membership_item_id:plan.id,status,amount:10000,auto_renew:status==='ONGOING',started_at:new Date(Date.now()-day+(n++)*1000),ended_at:new Date(Date.now()+endOffset),next_billing_date:status==='ONGOING'?new Date(Date.now()+endOffset):null,plan_snapshot:{secret:'must-not-leak'},billing_key:'private-billing-key'}});subs.push(s.id);return s;};
  const live=await sub('ONGOING',20*day),done=await sub('EXPIRED',-day);
  const pending=await order(owner,null,10000,0,'pending',false);await db.checkoutOrder.update({where:{id:pending},data:{subscription_id:live.id}});

  // permission: the write is SUPER_ADMIN only even though the list it sits on is revenue.view
  for(const user of['none','fan','disabled'])assert.equal((await api('subscriptions/'+live.id+'/cancel-now',user,{reason:'검증'})).status,401,user);
  for(const user of['moderator','admin'])assert.equal((await api('subscriptions/'+live.id+'/cancel-now',user,{reason:'검증'})).status,403,user);
  assert.equal((await db.subscription.findUnique({where:{id:live.id}})).status,'ONGOING','refused calls must not change the row');

  assert.equal((await api('subscriptions/'+live.id+'/cancel-now','super',{})).status,400,'reason is required');
  assert.equal((await api('subscriptions/'+live.id+'/cancel-now','super',{reason:'x'.repeat(501)})).status,400,'reason is bounded');
  assert.equal((await api('subscriptions/'+randomUUID()+'/cancel-now','super',{reason:'검증'})).status,404);
  assert.equal((await api('subscriptions/'+done.id+'/cancel-now','super',{reason:'검증'})).status,409,'already ended');

  const before=new Date(),r=await api('subscriptions/'+live.id+'/cancel-now','super',{reason:'토스 심사 종료'}),after=new Date();
  assert.equal(r.status,201);assert.equal(r.data.status,'EXPIRED');assert.equal(r.data.refunded,false);
  const row=await db.subscription.findUnique({where:{id:live.id}});
  assert.equal(row.status,'EXPIRED');assert.equal(row.auto_renew,false);assert.equal(row.next_billing_date,null);
  assert.ok(row.ended_at>=before&&row.ended_at<=after,'ended_at is moved to now, not left in the future');

  // the access predicate used across the service (live status AND remaining period) no longer matches
  assert.equal(await db.subscription.count({where:{id:live.id,status:{in:['ONGOING','CANCELLED']},ended_at:{gt:new Date()}}}),0,'access must be cut immediately');
  assert.equal((await db.checkoutOrder.findUnique({where:{id:pending}})).status,'cancelled','open orders are closed');
  assert.equal((await api('subscriptions?membershipId='+plan.id)).data.summary.current,0);

  assert.equal(row.cancel_reason,'토스 심사 종료','the reason is stored on the row');
  assert.ok(row.cancelled_by,'the acting administrator is stored');
  const shown=(await api('subscriptions?membershipId='+plan.id)).data.items.find(i=>i.id===live.id);
  assert.equal(shown.cancelReason,'토스 심사 종료','operators can read the reason back');assert.equal(shown.status,'EXPIRED');
  const log=await db.platformAuditLog.findFirst({where:{action:'admin.subscription.cancelled_now',entity_id:live.id},orderBy:{occurred_at:'desc'}});
  assert.ok(log,'the action is audited');assert.deepEqual(log.metadata.changedFields.sort(),['auto_renew','status']);
  assert.equal(JSON.stringify(log.metadata).includes('private-billing-key'),false,'no billing secret in the audit entry');
  assert.equal(JSON.stringify(log.metadata).includes('토스 심사 종료'),false,'free text stays out of the audit metadata');
  const event=await db.platformOperationalEvent.findFirst({where:{type:'subscription.cancelled',data:{path:'$.subscriptionId',equals:live.id}}});
  assert.ok(event,'operators are notified');extra.push(event.id);

  assert.equal((await api('subscriptions/'+live.id+'/cancel-now','super',{reason:'재시도'})).status,409,'repeating is rejected, not applied twice');
 }finally{
  await db.platformAuditLog.deleteMany({where:{action:'admin.subscription.cancelled_now',entity_id:{in:subs}}});
  await db.platformOperationalEvent.deleteMany({where:{id:{in:extra}}});
  await db.subscription.deleteMany({where:{id:{in:subs}}});await db.membershipItem.deleteMany({where:{id:{in:plans}}});
 }
});
