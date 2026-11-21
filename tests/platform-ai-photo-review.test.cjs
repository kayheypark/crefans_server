require('reflect-metadata');require('dotenv').config({path:'.local/platform.env',override:true});
// 2026-11-21 user request: after a first successful AI photo, a repeat generation shows a review instead of the heart game.
// Members: one review per successful photo, 20 hearts inside the daily heart cap. Visitors: once a KST day, guest heart credit.
const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
assert.equal(process.env.CREFANS_E2E,'true');const source=process.env.DATABASE_URL;assert.match(source||'',/@127\.0\.0\.1:3307\/crefans_platform_dev$/);const url=new URL(source);url.pathname='/crefans_platform_e2e';process.env.DATABASE_URL=url.toString();
Object.assign(process.env,{LOCAL_AUTH_SECRET:'r'.repeat(64)});
const {PrismaClient}=require('@prisma/client'),db=new PrismaClient();
const reviews=require('../dist/src/platform/ai-photo-reviews'),policy=require('../dist/src/platform/guest-policy'),{requestContext}=require('../dist/src/platform/request-context');
const users=[],media=[];
const ipOf=()=>`10.${crypto.randomInt(255)}.${crypto.randomInt(255)}.${crypto.randomInt(1,255)}`;
async function member(){const id=crypto.randomUUID();users.push(id);await db.member.create({data:{id,email:`${id}@review.test.invalid`,name:'리뷰',nickname:'리뷰'+id.slice(0,4),preferred_username:'rv'+id.slice(0,8),password_hash:'x',email_verified:true,status:'CONFIRMED'}});return id;}
const guest=()=>{const id=policy.guestIdFromToken(crypto.randomBytes(32).toString('base64url'));users.push(id);return id;};
async function made(owner){const id=crypto.randomUUID();media.push(id);await db.media.create({data:{id,user_sub:owner,type:'IMAGE',original_name:'ai.webp',file_name:id,file_size:1,mime_type:'image/webp',original_url:`/api/v1/media/${id}/file`,s3_upload_key:`local/${id}`,processing_status:'COMPLETED',processed_at:new Date(),metadata:{aiGenerated:true}}});}
const send=(user,input,ip=ipOf())=>requestContext.run({ip,peerIp:ip,requestId:crypto.randomUUID()},()=>reviews.submitReview(db,user,input));
const code=c=>e=>e.getResponse?.().code===c;
before(async()=>{globalThis.__release=await require('./e2e-db-lock.cjs').lockE2EDatabase(source);
 const r=require('node:child_process').spawnSync(process.execPath,[require.resolve('prisma/build/index.js'),'migrate','deploy'],{env:process.env,encoding:'utf8'});assert.equal(r.status,0,r.stdout+r.stderr);});
after(async()=>{try{await db.aiPhotoReview.deleteMany({where:{user_id:{in:users}}});await db.aiHeartWallet.deleteMany({where:{user_id:{in:users}}});await db.media.deleteMany({where:{id:{in:media}}});await db.platformAuditLog.deleteMany({where:{entity_id:{in:users}}});await db.member.deleteMany({where:{id:{in:users}}});}finally{await db.$disconnect();await globalThis.__release?.();}});

test('input: whole stars 1–5, one of three choices, words optional and at most 500 characters',()=>{
 for(const rating of [0,6,2.5,'3',null])assert.throws(()=>reviews.reviewInput({rating,sentiment:'good'}),code('INVALID_REVIEW'),String(rating));
 assert.throws(()=>reviews.reviewInput({rating:3,sentiment:'meh'}),code('INVALID_REVIEW'));
 assert.throws(()=>reviews.reviewInput({rating:3,sentiment:'good',comment:'가'.repeat(501)}),code('INVALID_REVIEW'));
 assert.deepEqual(reviews.reviewInput({rating:5,sentiment:'unsure',comment:'  좋아요  '}),{rating:5,sentiment:'unsure',comment:'좋아요'});
 assert.deepEqual(reviews.reviewInput({rating:1,sentiment:'bad'}),{rating:1,sentiment:'bad',comment:null});
});

test('member: no review before a success; one per successful photo; 20 hearts each inside the daily cap of 100',async()=>{
 const m=await member();
 assert.equal((await reviews.reviewStatus(db,m)).eligible,false,'no photo yet');
 await assert.rejects(send(m,{rating:5,sentiment:'good'}),code('REVIEW_NOT_AVAILABLE'));
 await made(m);assert.equal((await reviews.reviewStatus(db,m)).eligible,true);
 const first=await send(m,{rating:4,sentiment:'good',comment:'예뻐요'});assert.equal(first.hearts,20);assert.deepEqual(first.wallet,{hearts:20,credits:0});
 assert.equal((await reviews.reviewStatus(db,m)).eligible,false,'one per photo');await assert.rejects(send(m,{rating:4,sentiment:'good'}),code('REVIEW_NOT_AVAILABLE'));
 const row=await db.aiPhotoReview.findUnique({where:{id:first.id}});assert.deepEqual([row.rating,row.sentiment,row.comment,row.guest,row.reward_hearts],[4,'good','예뻐요',false,20]);
 for(let i=0;i<6;i++)await made(m);
 const got=[];for(let i=0;i<6;i++)got.push((await send(m,{rating:3,sentiment:'unsure'})).hearts);
 assert.deepEqual(got,[20,20,20,20,0,0],'100 a day including the first review');
 assert.equal((await db.aiHeartWallet.findUnique({where:{user_id:m}})).credits,10,'100 hearts became 10 credits');
});

test('visitor: once a KST day after a success; reward is the guest heart credit (0.5)',async()=>{
 const g=guest();assert.equal((await reviews.reviewStatus(db,g)).eligible,false);
 await made(g);assert.equal((await reviews.reviewStatus(db,g)).eligible,true);
 const r=await send(g,{rating:2,sentiment:'bad',comment:'얼굴이 달라졌어요'});assert.equal(r.tickets,0.5);assert.equal(r.hearts,0);
 assert.equal(await policy.guestHeartRewardTotal(db,g),0.5);
 await made(g);assert.equal((await reviews.reviewStatus(db,g)).eligible,false,'once a day even after another photo');
 await assert.rejects(send(g,{rating:5,sentiment:'good'}),code('REVIEW_NOT_AVAILABLE'));
});

test('console list: newest first with filters, nickname for members only, average and choice counts',async()=>{
 const all=await reviews.listReviews(db,{});assert.ok(all.items.length>=1);
 const mine=all.items.filter(i=>users.includes(i.userId));assert.ok(mine.some(i=>i.guest&&i.nickname===null));assert.ok(mine.some(i=>!i.guest&&i.nickname?.startsWith('리뷰')));
 const bad=await reviews.listReviews(db,{sentiment:'bad',who:'guest'});assert.ok(bad.items.every(i=>i.sentiment==='bad'&&i.guest));
 const five=await reviews.listReviews(db,{rating:'2'});assert.ok(five.items.every(i=>i.rating===2));
 assert.equal(typeof all.summary.averageRating,'number');assert.deepEqual(Object.keys(all.summary.bySentiment),['good','bad','unsure']);
});
