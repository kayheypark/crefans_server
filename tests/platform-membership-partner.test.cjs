require('reflect-metadata');require('dotenv').config({path:'.local/platform.env',override:true});
// 2026-11-16 user decision: only partner creators (verified badge = signed partnership contract) can open a new membership or
// turn one back on. Existing memberships keep selling and can be edited or turned off.
const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
assert.equal(process.env.CREFANS_E2E,'true');const source=process.env.DATABASE_URL;assert.match(source||'',/@127\.0\.0\.1:3307\/crefans_platform_dev$/);const url=new URL(source);url.pathname='/crefans_platform_e2e';process.env.DATABASE_URL=url.toString();
Object.assign(process.env,{LOCAL_AUTH_SECRET:'r'.repeat(64),DATA_ENCRYPTION_KEY:'a'.repeat(64),TELEGRAM_OPERATIONS_BOT_TOKEN:'',TELEGRAM_OPERATIONS_CHAT_ID:'',SMTP_HOST:'',AUTH_PROVIDER:'local',MEDIA_STORAGE:'local'});
const {PrismaClient}=require('@prisma/client'),db=new PrismaClient(),{NestFactory}=require('@nestjs/core'),{PlatformModule}=require('../dist/src/platform/module'),{PlatformStudioService}=require('../dist/src/platform/studio.service');
const code=wanted=>e=>e.getResponse?.().code===wanted,members=[];let app,studio;
before(async()=>{globalThis.__release=await require('./e2e-db-lock.cjs').lockE2EDatabase(source);const r=require('node:child_process').spawnSync(process.execPath,[require.resolve('prisma/build/index.js'),'migrate','deploy'],{env:process.env,encoding:'utf8'});assert.equal(r.status,0,r.stdout+r.stderr);app=await NestFactory.create(PlatformModule,{logger:false});await app.init();studio=app.get(PlatformStudioService);});
after(async()=>{await app?.close();try{await db.membershipItem.deleteMany({where:{creator_id:{in:members}}});await db.creator.deleteMany({where:{user_id:{in:members}}});await db.member.deleteMany({where:{id:{in:members}}});}finally{await db.$disconnect();await globalThis.__release?.();}});
async function creator(verified){const id=crypto.randomUUID();members.push(id);await db.member.create({data:{id,email:id+'@mp.test.invalid',name:'멤버십 QA',nickname:'멤버십 QA',preferred_username:'mp_'+id.slice(0,8),password_hash:'unused',email_verified:true,status:'CONFIRMED'}});await db.creator.create({data:{user_id:id,is_verified:verified}});return id;}
const plan=extra=>({name:'기본 멤버십',price:5000,benefits:['게시물 열람'],rank:1,...extra});

test('a creator without the badge cannot open a membership; a partner can',async()=>{
 const plain=await creator(false);
 await assert.rejects(studio.saveMembership(plain,plan()),code('MEMBERSHIP_PARTNER_REQUIRED'));
 assert.equal(await db.membershipItem.count({where:{creator_id:plain}}),0);
 const partner=await creator(true);await studio.saveMembership(partner,plan());
 assert.equal(await db.membershipItem.count({where:{creator_id:partner,is_deleted:false}}),1);
});

test('after the badge is removed, an existing membership can be edited and turned off but not turned back on',async()=>{
 const id=await creator(true);await studio.saveMembership(id,plan());const item=await db.membershipItem.findFirstOrThrow({where:{creator_id:id}});
 await db.creator.update({where:{user_id:id},data:{is_verified:false}});
 await studio.saveMembership(id,plan({id:item.id,name:'이름 수정',price:6000}));
 assert.equal((await db.membershipItem.findUnique({where:{id:item.id}})).name,'이름 수정');
 await studio.membershipState(id,item.id,{active:false});
 await assert.rejects(studio.membershipState(id,item.id,{active:true}),code('MEMBERSHIP_PARTNER_REQUIRED'));
 assert.equal((await db.membershipItem.findUnique({where:{id:item.id}})).is_active,false);
 await db.creator.update({where:{user_id:id},data:{is_verified:true}});
 await studio.membershipState(id,item.id,{active:true});assert.equal((await db.membershipItem.findUnique({where:{id:item.id}})).is_active,true);
});

// 2026-11-16 user decision (/pilot-work, contract article 12(2)): removing the badge (contract ended) pauses the memberships on
// sale; paid periods continue and the renewal job stops renewing a paused membership. Granting the badge pauses nothing.
test('removing the badge pauses the memberships on sale; granting it changes no membership',async()=>{
 const {PlatformAdminController}=require('../dist/src/platform/admin.controller');const admin=app.get(PlatformAdminController);
 const id=await creator(true);await studio.saveMembership(id,plan());await studio.saveMembership(id,plan({name:'두 번째',rank:2}));
 const paused=await db.membershipItem.findFirstOrThrow({where:{creator_id:id,name:'두 번째'}});await studio.membershipState(id,paused.id,{active:false});
 const result=await admin.verification(id,false,{admin:{id:'qa'}});
 assert.equal(result.membershipsPaused,1,'only the one on sale is paused');assert.match(result.message,/멤버십 1개를 중지/);
 assert.equal(await db.membershipItem.count({where:{creator_id:id,is_active:true}}),0);
 const again=await admin.verification(id,true,{admin:{id:'qa'}});assert.equal(again.membershipsPaused,undefined);
 assert.equal(await db.membershipItem.count({where:{creator_id:id,is_active:true}}),0,'granting does not reopen anything by itself');
 assert.ok(await db.platformAuditLog.findFirst({where:{action:'admin.creator_verification_changed',entity_id:id}}));
 // 2026-11-17 contract 12(2): ending the partnership tells the creator what is left and when it is settled; operators get the date.
 const notice=await db.memberNotification.findFirst({where:{member_id:id,type:'settlement',text:{startsWith:'파트너 계약이 종료되었어요.'}}});assert.ok(notice,'termination notice');assert.match(notice.text,/미정산 수익 .*원.*미수금 .*원.*까지 처리 방법을 정하고/);assert.ok(notice.text.length<=191);
 assert.equal(await db.platformOperationalEvent.count({where:{type:'creator.partner_ended',dedupe_key:{startsWith:'creator.partner_ended:'+id}}}),1);
});
