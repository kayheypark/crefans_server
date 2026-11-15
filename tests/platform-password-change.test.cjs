require('reflect-metadata');require('dotenv').config({path:'.local/platform.env'});
// 2026-11-16 user decision: a member's own password change keeps the device that made it signed in, ends every other
// session, notifies the member (in-app + queued mail), refuses an unchanged password and limits tries to 5 per 10 minutes.
const {test,after}=require('node:test'),assert=require('node:assert/strict');
const {randomUUID,randomBytes}=require('crypto'),{PrismaClient}=require('@prisma/client');
assert.equal(process.env.CREFANS_E2E,'true');assert.match(process.env.DATABASE_URL||'',/@127\.0\.0\.1:3307\/crefans_platform_dev$/);
const {PlatformService}=require('../dist/src/platform/service');const {PlatformController}=require('../dist/src/platform/controller');
const {hashPassword,matchesPassword,digest}=require('../dist/src/auth/local/credentials');
const db=new PrismaClient(),members=[],service=new PlatformService(db);
const code=wanted=>e=>e.getResponse?.().code===wanted;
after(async()=>{await db.memberNotice.deleteMany({where:{member_id:{in:members}}});await db.memberNotification.deleteMany({where:{member_id:{in:members}}});await db.member.deleteMany({where:{id:{in:members}}});await db.$disconnect();});
async function member(){const id=randomUUID();members.push(id);await db.member.create({data:{id,email:id+'@pw.test.invalid',name:'비번 QA',nickname:'비번 QA',preferred_username:'pw_'+id.slice(0,8),password_hash:await hashPassword('Old-pass-123!'),email_verified:true,status:'CONFIRMED'}});return id;}
async function session(id){const access=randomBytes(24).toString('hex');await db.memberSession.create({data:{member_id:id,access_hash:digest(access),refresh_hash:digest(randomBytes(24).toString('hex')),access_until:new Date(Date.now()+3600e3),expires_at:new Date(Date.now()+86400e3)}});return access;}
const change=(extra)=>({section:'password',currentPassword:'Old-pass-123!',newPassword:'New-pass-456!',...extra});

test('the changing device stays signed in, other sessions end, the member is notified and the change is audited',async()=>{
 const id=await member(),here=await session(id),other=await session(id),third=await session(id);
 const result=await service.settings(id,change(),here);
 assert.match(result.message,/다른 기기에서는 다시 로그인/);
 const left=await db.memberSession.findMany({where:{member_id:id}});assert.deepEqual(left.map(s=>s.access_hash),[digest(here)],'only the current session remains');
 assert.ok(await matchesPassword('New-pass-456!',(await db.member.findUnique({where:{id}})).password_hash));
 const notice=await db.memberNotice.findFirst({where:{member_id:id,kind:'password-changed'}});assert.ok(notice,'queued mail notice');
 assert.ok(await db.memberNotification.findFirst({where:{member_id:id,type:'password-changed'}}),'in-app notification');
 assert.ok(await db.platformAuditLog.findFirst({where:{action:'member.password_changed',entity_id:id}}),'audit record');
 void other;void third;
});

test('wrong current password, unchanged or weak new password are refused and nothing changes',async()=>{
 const id=await member(),here=await session(id),other=await session(id);
 await assert.rejects(service.settings(id,change({currentPassword:'Wrong-pass-1!'}),here),code('INVALID_PASSWORD'));
 await assert.rejects(service.settings(id,change({newPassword:'Old-pass-123!'}),here),code('PASSWORD_UNCHANGED'));
 await assert.rejects(service.settings(id,change({newPassword:'short'}),here));
 assert.equal(await db.memberSession.count({where:{member_id:id}}),2,'no session ended');void other;
 assert.ok(await matchesPassword('Old-pass-123!',(await db.member.findUnique({where:{id}})).password_hash));
 assert.equal(await db.memberNotice.count({where:{member_id:id}}),0);
});

test('the settings endpoint limits password tries to 5 per member per 10 minutes; other sections are not limited',async()=>{
 const buckets=new Map(),local={limit:async(key,max,seconds)=>{assert.equal(seconds,600);const n=(buckets.get(key)||0)+1;buckets.set(key,n);if(n>max){const e=new Error('busy');e.getStatus=()=>429;throw e;}}};
 const calls=[];const fake={settings:async(...a)=>{calls.push(a);return{message:'ok'};}};
 const controller=new PlatformController(fake,null,null,local),req={user:{sub:'m1'},cookies:{access_token:'tok'}};
 for(let i=0;i<5;i++)await controller.settings({section:'password'},req);
 await assert.rejects(controller.settings({section:'password'},req),e=>e.getStatus?.()===429);
 for(let i=0;i<7;i++)await controller.settings({section:'privacy'},req);
 assert.equal(calls.length,12);assert.equal(calls[0][2],'tok','the current access token is passed so this device stays signed in');
});
