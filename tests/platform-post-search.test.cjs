require('reflect-metadata');require('dotenv').config({path:'.local/platform.env',override:true});
// Post search (2026-11-08): feed visibility + creator search opt-out; body matched only for posts anyone may read.
const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
assert.equal(process.env.CREFANS_E2E,'true');const source=process.env.DATABASE_URL;assert.match(source||'',/@127\.0\.0\.1:3307\/crefans_platform_dev$/);const url=new URL(source);url.pathname='/crefans_platform_e2e';process.env.DATABASE_URL=url.toString();
Object.assign(process.env,{LOCAL_AUTH_SECRET:'r'.repeat(64),DATA_ENCRYPTION_KEY:'r'.repeat(64),TELEGRAM_OPERATIONS_BOT_TOKEN:'',TELEGRAM_OPERATIONS_CHAT_ID:'',SMTP_HOST:'',BEAN_LEDGER_ENABLED:'false',AUTH_PROVIDER:'local'});
const {PrismaClient}=require('@prisma/client'),db=new PrismaClient(),{NestFactory}=require('@nestjs/core'),{PlatformModule}=require('../dist/src/platform/module'),{PlatformService}=require('../dist/src/platform/service');
const tag=crypto.randomBytes(3).toString('hex'),word='검색어'+tag,members=[],posts={};let app,service,release,fan,stranger,order;
async function creator(handle,{active=true,enabled=true,allowSearch}={}){const id=crypto.randomUUID();members.push(id);await db.member.create({data:{id,email:id+'@post-search.test.invalid',name:'검색 QA',nickname:'검색 QA '+handle,preferred_username:handle,password_hash:'unused',email_verified:true,status:'CONFIRMED',enabled}});await db.creator.create({data:{user_id:id,handle,display_name:'검색 QA',is_active:active}});if(allowSearch===false)await db.accountPreference.create({data:{member_id:id,allow_search:false}});return id;}
const post=(key,user_sub,data)=>db.posting.create({data:{user_sub,title:'일반 제목',content:'일반 본문',status:'PUBLISHED',is_public:true,published_at:new Date(Date.now()-60000*Object.keys(posts).length),...data}}).then(p=>{posts[key]=p.id;});
before(async()=>{
 release=await require('./e2e-db-lock.cjs').lockE2EDatabase(source);
 const result=require('node:child_process').spawnSync(process.execPath,[require.resolve('prisma/build/index.js'),'migrate','deploy'],{env:process.env,encoding:'utf8'});assert.equal(result.status,0,result.stdout+result.stderr);
 const a=await creator('ps_a_'+tag),hidden=await creator('ps_h_'+tag,{allowSearch:false}),inactive=await creator('ps_i_'+tag,{active:false}),disabled=await creator('ps_d_'+tag,{enabled:false});
 await post('publicTitle',a,{title:`봄 ${word} 화보`});
 await post('publicBody',a,{content:`오늘은 ${word} 이야기를 합니다`});
 await post('memberTitle',a,{title:`멤버 ${word} 공지`,is_membership:true,membership_level:1});
 await post('memberBody',a,{content:`유료 본문 ${word}`,is_membership:true,membership_level:1});
 await post('planBody',a,{content:`상품 전용 ${word}`,access_plan_id:crypto.randomUUID()});
 await post('sensitiveBody',a,{content:`민감 ${word}`,is_sensitive:true});
 await post('unpublished',a,{title:`미공개 ${word}`,is_public:false});
 await post('hiddenByOperator',a,{title:`숨김 ${word}`,hidden_at:new Date()});
 await post('draft',a,{title:`임시 ${word}`,status:'DRAFT'});
 await post('scheduled',a,{title:`예약 ${word}`,publish_start_at:new Date(Date.now()+86400000)});
 await post('deleted',a,{title:`삭제 ${word}`,is_deleted:true});
 await post('optedOut',hidden,{title:`검색 끔 ${word}`});
 await post('inactive',inactive,{title:`비활성 ${word}`});
 await post('disabledMember',disabled,{title:`정지 ${word}`});
 // 2026-11-09 user decision "검색은 제외, 피드·상세는 열람": a paid subscriber's order must stay refundable after a search.
 const fanMember=async handle=>{const id=crypto.randomUUID();members.push(id);await db.member.create({data:{id,email:id+'@post-search.test.invalid',name:'검색 QA',nickname:'검색 QA '+handle,preferred_username:handle,password_hash:'unused',email_verified:true,status:'CONFIRMED'}});return id;};
 fan=await fanMember('ps_f_'+tag);stranger=await fanMember('ps_s_'+tag);
 const plan=await db.membershipItem.create({data:{creator_id:a,name:'검색 QA',price:1000,benefits:'[]',billing_unit:'MONTH',billing_period:1,level:1}});
 const sub=await db.subscription.create({data:{subscriber_id:fan,membership_item_id:plan.id,amount:1000,started_at:new Date(Date.now()-60000),ended_at:new Date(Date.now()+86400000),plan_snapshot:{rank:1}}});
 order=await db.checkoutOrder.create({data:{member_id:fan,membership_id:plan.id,amount:1000,status:'paid',snapshot:{id:plan.id,creatorId:a,name:'검색 QA',rank:1,price:1000,benefits:[],version:1},idempotency_key:crypto.randomUUID(),expires_at:new Date(Date.now()+86400000),period_start:sub.started_at,period_end:sub.ended_at}});
 app=await NestFactory.create(PlatformModule,{logger:false});await app.init();service=app.get(PlatformService);
});
after(async()=>{await app?.close();try{await db.checkoutOrder.deleteMany({where:{member_id:{in:members}}});await db.subscription.deleteMany({where:{subscriber_id:{in:members}}});await db.membershipItem.deleteMany({where:{creator_id:{in:members}}});await db.posting.deleteMany({where:{user_sub:{in:members}}});await db.accountPreference.deleteMany({where:{member_id:{in:members}}});await db.creator.deleteMany({where:{user_id:{in:members}}});await db.member.deleteMany({where:{id:{in:members}}});}finally{await db.$disconnect();await release?.();}});

test('finds titles of all visible posts but bodies only of freely readable ones; hidden, unpublished and opted-out creators never match',async()=>{
 const r=await service.postSearch(undefined,word);
 const found=new Set(r.posts.map(p=>p.id)),expected=['publicTitle','publicBody','memberTitle'];
 assert.deepEqual(Object.keys(posts).filter(k=>found.has(posts[k])).sort(),expected.sort());
 assert.equal(r.creators.length,1);assert.equal(r.nextCursor,null);
});
test('membership post found by title keeps its body locked for a signed-out viewer; empty query returns nothing',async()=>{
 const r=await service.postSearch(undefined,word),member=r.posts.find(p=>p.id===posts.memberTitle);
 assert.ok(member);assert.doesNotMatch(JSON.stringify(member),new RegExp('유료 본문'));
 assert.deepEqual(await service.postSearch(undefined,'  '),{posts:[],creators:[],nextCursor:null});
 assert.equal((await service.postSearch(undefined,'존재하지않는'+tag)).posts.length,0);
});
test('search shows a subscriber only the locked preview and never marks the order as content-accessed; the detail does',async()=>{
 const locked=p=>{assert.equal(p.canAccess,false);assert.equal(p.body,'');assert.deepEqual(p.media,[]);assert.equal(p.image,'');};
 const accessed=async()=>(await db.checkoutOrder.findUniqueOrThrow({where:{id:order.id}})).content_accessed_at;
 locked((await service.postSearch(fan,word)).posts.find(p=>p.id===posts.memberTitle));
 assert.equal(await accessed(),null);
 locked((await service.postSearch(stranger,word)).posts.find(p=>p.id===posts.memberTitle));
 const free=(await service.postSearch(fan,word)).posts.find(p=>p.id===posts.publicBody);assert.equal(free.canAccess,true);assert.match(free.body,new RegExp(word));
 assert.equal(await accessed(),null);
 const detail=await service.postDetail(posts.memberTitle,fan);assert.equal(detail.post.canAccess,true);assert.equal(detail.post.body,'일반 본문');
 assert.ok(await accessed());
 assert.equal((await service.postDetail(posts.memberTitle,stranger)).post.canAccess,false);
});
