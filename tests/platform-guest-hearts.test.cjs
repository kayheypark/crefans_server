require('reflect-metadata');require('dotenv').config({path:'.local/platform.env',override:true});
// 2026-11-21 user decision: a signed-out visitor who collects 30 hearts in the server-verified waiting game gets 0.5 credit,
// at most 3 credits a day per browser (guest id) and per network (IP HMAC), whichever fills first. Uses the isolated e2e DB.
const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
assert.equal(process.env.CREFANS_E2E,'true');const source=process.env.DATABASE_URL;assert.match(source||'',/@127\.0\.0\.1:3307\/crefans_platform_dev$/);const url=new URL(source);url.pathname='/crefans_platform_e2e';process.env.DATABASE_URL=url.toString();
Object.assign(process.env,{LOCAL_AUTH_SECRET:'r'.repeat(64)});
const {PrismaClient}=require('@prisma/client'),db=new PrismaClient();
const hearts=require('../dist/src/platform/ai-photo-hearts'),policy=require('../dist/src/platform/guest-policy'),{requestContext}=require('../dist/src/platform/request-context');
const guests=[];const newGuest=()=>{const id=policy.guestIdFromToken(crypto.randomBytes(32).toString('base64url'));guests.push(id);return id;};
const ipOf=()=>`10.${crypto.randomInt(255)}.${crypto.randomInt(255)}.${crypto.randomInt(1,255)}`;
before(async()=>{globalThis.__release=await require('./e2e-db-lock.cjs').lockE2EDatabase(source);
 const r=require('node:child_process').spawnSync(process.execPath,[require.resolve('prisma/build/index.js'),'migrate','deploy'],{env:process.env,encoding:'utf8'});assert.equal(r.status,0,r.stdout+r.stderr);});
after(async()=>{try{await db.aiHeartGame.deleteMany({where:{user_id:{in:guests}}});await db.platformAuditLog.deleteMany({where:{entity_id:{in:guests}}});}finally{await db.$disconnect();await globalThis.__release?.();}});
// One full round as the edit request does it: start → active → (score) → close → settle, inside the visitor's request context.
async function play(guest,ip,score=30){
 const g=await hearts.createHeartGame(db,guest);assert.equal(g.status??'ready','ready');assert.equal(g.kinds.length,465);
 await hearts.startHeartGame(db,guest,g.id);await db.aiHeartGame.update({where:{id:g.id},data:{score}});
 await hearts.closeHeartGame(db,guest,g.id);
 return requestContext.run({ip,peerIp:ip,requestId:crypto.randomUUID()},()=>hearts.settleHeartGame(db,guest,g.id));
}
test('30 hearts → 0.5 credit, 29 → none; at most 3 credits a day per browser and per network; settle is idempotent',async()=>{
 const a=newGuest(),ip=ipOf();
 const low=await play(a,ip,29);assert.equal(low.ticket,0);assert.equal(low.capped,false);assert.equal(await policy.guestHeartRewardTotal(db,a),0);
 for(let i=1;i<=6;i++){const r=await play(a,ip);assert.equal(r.ticket,0.5,`game ${i}`);assert.equal(await policy.guestHeartRewardTotal(db,a),i*0.5);}
 const seventh=await play(a,ip);assert.equal(seventh.ticket,0);assert.equal(seventh.capped,true,'browser cap 3 reached');assert.equal(await policy.guestHeartRewardTotal(db,a),3);
 const b=newGuest();const sameNet=await play(b,ip);assert.equal(sameNet.ticket,0,'a new browser on the same network is capped too');assert.equal(await policy.guestHeartRewardTotal(db,b),0);
 const otherNet=await play(b,ipOf());assert.equal(otherNet.ticket,0.5,'the same browser on another network is under both caps');
 const g=(await db.aiHeartGame.findMany({where:{user_id:a,status:'settled'},orderBy:{created_at:'desc'},take:1}))[0];
 const again=await requestContext.run({ip,peerIp:ip,requestId:'x'},()=>hearts.settleHeartGame(db,a,g.id));assert.equal(await policy.guestHeartRewardTotal(db,a),3,'re-settling pays nothing');void again;
 const audits=await db.platformAuditLog.count({where:{entity_id:a,action:'guest.heart_reward'}});assert.equal(audits,8);
});
test('guest clicks are verified by the server: hearts +1, others −1, empty −1, a client score is never accepted',async()=>{
 const guest=newGuest(),g=await hearts.createHeartGame(db,guest);await hearts.startHeartGame(db,guest,g.id);
 assert.deepEqual(g.kinds.slice(0,5),['heart','candy','heart','moon','heart']);
 assert.equal((await hearts.clickHeart(db,guest,g.id,1,'e1')).score,1);assert.equal((await hearts.clickHeart(db,guest,g.id,3,'e2')).score,2);
 assert.equal((await hearts.clickHeart(db,guest,g.id,2,'e3')).score,1,'candy −1');assert.equal((await hearts.clickHeart(db,guest,g.id,0,'e4')).score,0,'empty −1');
 assert.equal((await hearts.clickHeart(db,guest,g.id,0,'e4')).score,0,'same event ignored');
 await assert.rejects(hearts.clickHeart(db,guest,g.id,1,'e5'),e=>e.getStatus?.()===409,'a piece counts once');
 await assert.rejects(hearts.clickHeart(db,newGuest(),g.id,5,'e6'),e=>e.getStatus?.()===404,'another browser cannot click this game');
});
test('only one game at a time per browser (guest bucket lock)',async()=>{
 const guest=newGuest();await hearts.createHeartGame(db,guest);await assert.rejects(hearts.createHeartGame(db,guest),e=>e.getStatus?.()===409);
});
