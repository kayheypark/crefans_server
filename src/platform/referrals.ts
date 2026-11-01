import {randomUUID} from 'crypto';
import {reject,text} from './http';
import {ensureBeanWallet,postBeanMovement} from './bean-ledger';
import {beanPolicy} from './bean-policy';
import {enqueueOperation} from './operations-events';
const validUntil=(from:Date)=>{const d=new Date(from);d.setFullYear(d.getFullYear()+beanPolicy.validityYears);return d;};
const rewardKey=(id:string)=>`referral-reward:${id}`;

// Referral rewards (user decisions 2026-11-01, docs/referral-design-20261101.md):
// - every member has one referral row; its id is the invite code joined to members.id.
// - only the member who invited directly is rewarded, once: the invitee's first live payment qualifies, and the reward is
//   credited by the worker 7 days later if that payment is still unrefunded; at most 10 rewards per referrer per KST month.
// - the reward is 100 promotional beans for tipping, NOT withdrawable (user decision 2026-11-01 evening; replaces the earlier
//   withdrawable reward). It is recorded as a bean_promotions row like an operator grant, so tips and payouts treat it the same.
// - a refund inside the hold cancels the qualification; a later refund (even partial) claws back what is left of the reward;
//   beans already used for tips are absorbed by the company (no receivable).
// - a referrer who is disabled when the reward is due forfeits it ('forfeited'); over the monthly cap stays 'capped' for good.
export const REFERRAL_REWARD_BEANS=100;
// The switch lives in platform_settings and is changed from the operator console (2026-11-01); missing means off.
export const REFERRAL_SETTING='referral.enabled';
export const referralOn=async(db:any)=>(await db.platformSetting.findUnique({where:{key:REFERRAL_SETTING}}))?.value===true;

export async function ensureReferral(db:any,member:string){return db.referral.upsert({where:{member_id:member},create:{member_id:member},update:{}});}
/** A usable code: the row exists and its owner is an active member. */
export async function findReferral(db:any,code:unknown){
 if(typeof code!=='string'||!/^[0-9a-f-]{36}$/.test(code))return null;
 const referral=await db.referral.findUnique({where:{id:code}});if(!referral)return null;
 return await db.member.findFirst({where:{id:referral.member_id,enabled:true},select:{id:true}})?referral:null;
}
export async function linkReferralSignup(tx:any,code:unknown,member:string){
 const referral=await findReferral(tx,code);if(!referral||referral.member_id===member)return null;
 return tx.referralSignup.create({data:{referral_id:referral.id,referrer_id:referral.member_id,member_id:member}});
}

async function account(tx:any,member:string,bucket:string){const w=member==='company'?{id:'bean-company'}:await ensureBeanWallet(tx,member);return tx.beanAccount.upsert({where:{wallet_id_bucket:{wallet_id:w.id,bucket}},create:{id:randomUUID(),wallet_id:w.id,bucket},update:{}});}
async function move(tx:any,key:string,kind:string,reason:string,referenceId:string,items:{member:string;bucket:string;delta:number}[]){
 const entries=[];for(const i of items)entries.push({accountId:(await account(tx,i.member,i.bucket)).id,delta:i.delta});
 await postBeanMovement({$transaction:(fn:any)=>fn(tx),beanMovement:tx.beanMovement},{requestKey:key,kind,actorId:'system:referral',reason,referenceId,entries});
}
async function lockWallets(tx:any,member:string){
 await tx.$queryRaw`SELECT id FROM bean_wallets WHERE id=${'bean-company'} FOR UPDATE`;
 const wallet=await ensureBeanWallet(tx,member);await tx.$queryRaw`SELECT id FROM bean_wallets WHERE id=${wallet.id} FOR UPDATE`;
}

export const REFERRAL_HOLD_DAYS=7,REFERRAL_MONTHLY_CAP=10;
const kstMonthStart=(now:Date)=>{const k=new Date(now.getTime()+9*3600000);return new Date(Date.UTC(k.getUTCFullYear(),k.getUTCMonth(),1)-9*3600000);};

/**
 * Called inside the payment success transaction. Only live payments count: test-key payments must never mint withdrawable beans.
 * The first live payment qualifies the invitee; the reward is credited after the refund window (user decision 2026-11-01).
 */
export async function qualifyReferralReward(tx:any,payer:string,source:'checkout'|'bean_charge',sourceId:string,live:boolean,now=new Date()){
 if(!live||!await referralOn(tx))return null;
 const rows:any[]=await tx.$queryRaw`SELECT id FROM referral_signups WHERE member_id=${payer} FOR UPDATE`;if(!rows.length)return null;
 const signup=await tx.referralSignup.findUniqueOrThrow({where:{id:rows[0].id}});if(signup.reward_status!=='pending')return null;
 return tx.referralSignup.update({where:{id:signup.id},data:{reward_status:'qualified',reward_source:source,reward_source_id:sourceId,grant_due_at:new Date(now.getTime()+REFERRAL_HOLD_DAYS*86400000)}});
}
async function sourceStillPaid(tx:any,signup:any){
 if(signup.reward_source==='checkout'){const o=await tx.checkoutOrder.findUnique({where:{id:signup.reward_source_id}});return o?.status==='paid';}
 const c=await tx.beanCharge.findUnique({where:{id:signup.reward_source_id}});return c?.status==='paid'&&c.refunded_quantity===0;
}
/** Worker tick: credits rewards whose refund window has passed. A refunded source goes back to pending; over the monthly cap is recorded as capped. */
export async function grantDueReferralRewards(db:any,config:{get:(key:string)=>any},now=new Date()){
 if(config.get('BEAN_LEDGER_ENABLED')!=='true'||!await referralOn(db))return 0;
 const due=await db.referralSignup.findMany({where:{reward_status:'qualified',grant_due_at:{lte:now}},orderBy:{grant_due_at:'asc'},take:50,select:{id:true}});let count=0;
 for(const {id} of due)await db.$transaction(async(tx:any)=>{
  await tx.$queryRaw`SELECT id FROM referral_signups WHERE id=${id} FOR UPDATE`;const signup=await tx.referralSignup.findUniqueOrThrow({where:{id}});if(signup.reward_status!=='qualified')return;
  if(!await sourceStillPaid(tx,signup)){await tx.referralSignup.update({where:{id},data:{reward_status:'pending',reward_source:null,reward_source_id:null,grant_due_at:null}});return;}
  // A disabled or withdrawn referrer forfeits the reward, so the row no longer blocks the queue.
  if(!await tx.member.findFirst({where:{id:signup.referrer_id,enabled:true},select:{id:true}})){await tx.referralSignup.update({where:{id},data:{reward_status:'forfeited'}});return;}
  await lockWallets(tx,signup.referrer_id);
  await tx.$queryRaw`SELECT id FROM referral_signups WHERE referrer_id=${signup.referrer_id} FOR UPDATE`;
  if(await tx.referralSignup.count({where:{referrer_id:signup.referrer_id,reward_status:{in:['granted','clawed_back']},rewarded_at:{gte:kstMonthStart(now)}}})>=REFERRAL_MONTHLY_CAP){await tx.referralSignup.update({where:{id},data:{reward_status:'capped'}});return;}
  const q=REFERRAL_REWARD_BEANS;
  const grant=await tx.beanPromotion.create({data:{request_key:rewardKey(id),member_id:signup.referrer_id,quantity:q,reason:'친구 초대 첫 결제 보상',actor_id:'system:referral'}});
  await move(tx,rewardKey(id),'referral.reward','친구 초대 첫 결제 보상',id,[{member:'company',bucket:'stock',delta:-q},{member:signup.referrer_id,bucket:'promotion',delta:q}]);
  await tx.beanLot.create({data:{member_id:signup.referrer_id,bucket:'promotion',grant_id:grant.id,available:q,release_at:now,expires_at:validUntil(now)}});
  await tx.referralSignup.update({where:{id},data:{reward_status:'granted',reward_quantity:q,rewarded_at:now}});
  await tx.memberNotification.create({data:{member_id:signup.referrer_id,type:'settlement',text:`초대한 친구의 첫 결제가 확정되어 후원에 쓸 수 있는 프로모션콩 ${q}개를 받았어요.`,path:'/beans'}});
  await enqueueOperation(tx,'referral.rewarded',{memberId:signup.referrer_id,targetId:id},`referral.rewarded:${id}`,{amount:q});count++;
 },{isolationLevel:'ReadCommitted',timeout:20000});
 return count;
}

/**
 * Called when the rewarding payment is refunded (fully or partly) or disputed. Only what is left of the reward goes back
 * to stock; beans already used for tips stay spent and the company absorbs them (user decision 2026-11-01).
 */
export async function clawBackReferralReward(tx:any,source:'checkout'|'bean_charge',sourceId:string){
 // Refunded inside the hold: nothing was credited, so the invitee's next live payment may qualify instead.
 await tx.referralSignup.updateMany({where:{reward_source:source,reward_source_id:sourceId,reward_status:'qualified'},data:{reward_status:'pending',reward_source:null,reward_source_id:null,grant_due_at:null}});
 const signup=await tx.referralSignup.findFirst({where:{reward_source:source,reward_source_id:sourceId,reward_status:'granted'}});if(!signup)return null;
 await lockWallets(tx,signup.referrer_id);
 const grant=await tx.beanPromotion.findUnique({where:{request_key:rewardKey(signup.id)}});
 const lot=grant&&await tx.beanLot.findFirst({where:{member_id:signup.referrer_id,bucket:'promotion',grant_id:grant.id}});
 const back=lot?.available||0;
 if(back)await move(tx,`referral-clawback:${signup.id}`,'referral.clawback','친구 초대 보상 회수(결제 환불)',signup.id,[{member:signup.referrer_id,bucket:'promotion',delta:-back},{member:'company',bucket:'stock',delta:back}]);
 if(lot)await tx.beanLot.update({where:{id:lot.id},data:{available:0,frozen:true}});
 const updated=await tx.referralSignup.update({where:{id:signup.id},data:{reward_status:'clawed_back',clawed_back_at:new Date()}});
 await enqueueOperation(tx,'referral.clawed_back',{memberId:signup.referrer_id,targetId:signup.id},`referral.clawed_back:${signup.id}`,{amount:back});
 return updated;
}

/** The member's own link and results. Invitee identities are not shown: only counts and reward totals. */
export async function referralSummary(db:any,member:string){
 const referral=await ensureReferral(db,member);
 const [invited,rewarded,rows]=await Promise.all([db.referralSignup.count({where:{referrer_id:member}}),db.referralSignup.count({where:{referrer_id:member,reward_status:'granted'}}),db.referralSignup.aggregate({where:{referrer_id:member,reward_status:'granted'},_sum:{reward_quantity:true}})]);
 return{code:referral.id,invited,rewarded,rewardBeans:rows._sum.reward_quantity||0,rewardPerInvite:REFERRAL_REWARD_BEANS,holdDays:REFERRAL_HOLD_DAYS,monthlyCap:REFERRAL_MONTHLY_CAP,qualified:await db.referralSignup.count({where:{referrer_id:member,reward_status:'qualified'}})};
}
/** Invitee names are masked: first three characters, then ten stars (user decision 2026-11-01). */
export const maskReferralName=(name:string)=>Array.from(name.trim()).slice(0,3).join('')+'*'.repeat(10);
const historyStatus:Record<string,string>={pending:'joined',qualified:'waiting',granted:'rewarded',clawed_back:'clawed',capped:'capped',forfeited:'forfeited'};
const historyFilter:Record<string,string[]>={joined:['pending'],waiting:['qualified'],rewarded:['granted']};
/**
 * The member's own invite history (user decision 2026-11-01): masked invitee name, status and dates only.
 * No email, member id or payment detail of the invitee is returned.
 */
export async function referralHistory(db:any,member:string,status?:string,pageText?:string){
 if(!await referralOn(db))reject(404,'REFERRAL_DISABLED','친구 초대 기능을 준비 중입니다.');
 if(status&&!historyFilter[status])reject(400,'INVALID_REFERRAL_STATUS','조회할 상태를 확인해주세요.');
 const page=Math.max(1,Math.min(1000,Number.parseInt(pageText||'1',10)||1)),take=20;
 const where={referrer_id:member,...(status?{reward_status:{in:historyFilter[status]}}:{})};
 const [rows,total,counts,beans]=await Promise.all([
  db.referralSignup.findMany({where,orderBy:[{created_at:'desc'},{id:'asc'}],skip:(page-1)*take,take}),
  db.referralSignup.count({where}),
  db.referralSignup.groupBy({by:['reward_status'],where:{referrer_id:member},_count:{_all:true}}),
  db.referralSignup.aggregate({where:{referrer_id:member,reward_status:'granted'},_sum:{reward_quantity:true}})]);
 const people=await db.member.findMany({where:{id:{in:rows.map((r:any)=>r.member_id)}},select:{id:true,nickname:true}});
 const count=(...keys:string[])=>counts.filter((c:any)=>keys.includes(c.reward_status)).reduce((n:number,c:any)=>n+c._count._all,0);
 return{summary:{invited:count('pending','qualified','granted','clawed_back','capped','forfeited'),waiting:count('qualified'),rewardBeans:beans._sum.reward_quantity||0},
  items:rows.map((r:any)=>{const m=people.find((p:any)=>p.id===r.member_id);return{id:r.id,name:m?.nickname?maskReferralName(m.nickname):'탈퇴한 회원',status:historyStatus[r.reward_status]||'joined',joinedAt:r.created_at.toISOString(),dueAt:r.reward_status==='qualified'&&r.grant_due_at?r.grant_due_at.toISOString():null,rewardedAt:r.rewarded_at?.toISOString()||null,rewardBeans:r.reward_status==='granted'?r.reward_quantity:0};}),
  total,page,pageSize:take};
}
export function referralCodeInput(value:unknown){if(value===undefined||value===null||value==='')return undefined;return text(value,36);}
export const assertReferralCode=async(db:any,code:unknown)=>{if(!await findReferral(db,code))reject(400,'INVALID_REFERRAL','초대 링크를 확인해주세요.');};
/**
 * Bean payouts were creator-only. A member holding a granted referral reward may also register a settlement account,
 * set the withdrawal PIN and withdraw beans with the same conditions (user decision 2026-11-01). Membership payouts stay creator-only.
 */
export async function requireBeanPayoutMember(db:any,member:string){
 // Referral rewards are no longer withdrawable (2026-11-01), so bean payouts are creator-only again.
 if(await db.creator.findUnique({where:{user_id:member},select:{id:true}}))return;
 reject(403,'CREATOR_REQUIRED','크리에이터만 이용할 수 있습니다.');
}
export async function myReferral(db:any,member:string){if(!await referralOn(db))reject(404,'REFERRAL_DISABLED','친구 초대 기능을 준비 중입니다.');return referralSummary(db,member);}
