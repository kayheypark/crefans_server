require('reflect-metadata');require('dotenv').config({path:'.local/platform.env',override:true});
// Report and sanction records are deleted 3 years after handling ends (2026-11-02 user decision, privacy policy §7).
const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),{PrismaClient}=require('@prisma/client');
assert.equal(process.env.CREFANS_E2E,'true');const source=process.env.DATABASE_URL;assert.match(source,/@127\.0\.0\.1:3307\/crefans_platform_dev$/);const url=new URL(source);url.pathname='/crefans_platform_e2e';process.env.DATABASE_URL=url.toString();
const {pruneModerationRecords}=require('../dist/src/platform/moderation-retention');
const db=new PrismaClient(),reporter=randomUUID(),admin=randomUUID(),now=new Date('2031-06-15T00:00:00Z'),years=(n,days=0)=>new Date(+now-n*365.25*86400000-days*86400000);let release;
before(async()=>{release=await require('./e2e-db-lock.cjs').lockE2EDatabase(source);await db.$connect();});
after(async()=>{await db.userReport.deleteMany({where:{reporter_id:reporter}});await db.moderationAction.deleteMany({where:{admin_id:admin}});await db.$disconnect();await release?.();});
test('resolved reports and ended sanctions older than 3 years are deleted; pending reports and recent or running sanctions stay',async()=>{
 const report=(status,resolved_at,created_at=years(5))=>db.userReport.create({data:{reporter_id:reporter,target_type:'POSTING',target_id:randomUUID(),reason:'SPAM',status,resolved_at,created_at}});
 const action=(action,created_at,until=null)=>db.moderationAction.create({data:{target_type:'MEMBER',target_id:randomUUID(),action,reason:'보관 기간 검증',admin_id:admin,created_at,until}});
 const gone=[await report('RESOLVED',years(3,2)),await report('REJECTED',years(4))],kept=[await report('RESOLVED',years(3,-2)),await report('PENDING',null),await report('REVIEWED',years(1))];
 const goneActions=[await action('post.hidden',years(3,2)),await action('member.suspended',years(4),years(3,1))],keptActions=[await action('post.hidden',years(2)),await action('member.suspended',years(3,10),years(2,300))];
 assert.ok(await pruneModerationRecords(db,now)>=4);
 assert.equal(await db.userReport.count({where:{id:{in:gone.map(r=>r.id)}}}),0);assert.equal(await db.userReport.count({where:{id:{in:kept.map(r=>r.id)}}}),3);
 assert.equal(await db.moderationAction.count({where:{id:{in:goneActions.map(r=>r.id)}}}),0);assert.equal(await db.moderationAction.count({where:{id:{in:keptActions.map(r=>r.id)}}}),2,'a sanction counts from when it ends');
 assert.equal(await pruneModerationRecords(db,new Date(+now-86400000*800)),0,'nothing is old enough two years earlier');
});
