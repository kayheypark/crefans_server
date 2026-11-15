require('reflect-metadata');require('dotenv').config({path:'.local/platform.env'});
// 2026-11-15 user decision: creators start right away; withdrawal needs the Modusign partnership contract (verified badge).
// A creator asks for the contract from the withdrawal screen: once a day, audit + operator alert without member identifiers.
const {test,after}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('crypto'),{PrismaClient}=require('@prisma/client');
assert.equal(process.env.CREFANS_E2E,'true');assert.match(process.env.DATABASE_URL||'',/@127\.0\.0\.1:3307\/crefans_platform_dev$/);
const {requestPartnerContract,PARTNER_REQUESTED_MESSAGE}=require('../dist/src/platform/partner-policy');
const db=new PrismaClient(),members=[],code=wanted=>e=>e.getResponse?.().code===wanted;
function limiter(){const used=new Set();return{async limit(key){if(used.has(key)){const e=new Error('limited');e.getStatus=()=>429;throw e;}used.add(key);}};}
async function member(creator,verified=false){const id=randomUUID();members.push(id);await db.member.create({data:{id,email:id+'@partner.test.invalid',name:'',nickname:'파트너 QA',preferred_username:'pq_'+id.slice(0,8),password_hash:'unused',email_verified:true,status:'CONFIRMED'}});if(creator)await db.creator.create({data:{user_id:id,is_verified:verified}});return id;}
after(async()=>{await db.platformAuditLog.deleteMany({where:{action:'creator.partner_requested',entity_id:{in:members}}}).catch(()=>{});await db.creator.deleteMany({where:{user_id:{in:members}}});await db.member.deleteMany({where:{id:{in:members}}});await db.$disconnect();});
test('a creator requests the partnership contract once a day; the alert carries no member identifier',async()=>{
 const alerts=[],ops={async record(type,data,key){alerts.push({type,data,key});}},l=limiter(),id=await member(true);
 const first=await requestPartnerContract(db,ops,l,id);assert.deepEqual(first,{requested:true,message:PARTNER_REQUESTED_MESSAGE});
 assert.equal(alerts.length,1);assert.equal(alerts[0].type,'creator.partner_requested');assert.ok(!JSON.stringify(alerts[0].data).includes(id),'no member id in the alert data');
 assert.equal(await db.platformAuditLog.count({where:{action:'creator.partner_requested',entity_id:id}}),1);
 const again=await requestPartnerContract(db,ops,l,id);assert.equal(again.requested,true);assert.match(again.message,/오늘 이미 요청/);assert.equal(alerts.length,1,'no second alert the same day');
});
test('members who are not creators cannot ask; partners are told they already have a contract',async()=>{
 const ops={async record(){throw new Error('no alert expected');}};
 await assert.rejects(requestPartnerContract(db,ops,limiter(),await member(false)),code('CREATOR_REQUIRED'));
 assert.equal((await requestPartnerContract(db,ops,limiter(),await member(true,true))).requested,false);
});
