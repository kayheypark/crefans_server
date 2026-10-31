import {randomUUID} from 'crypto';
import {reject,text} from './http';
import {ensureBeanWallet,postBeanMovement} from './bean-ledger';
import {beanPolicy} from './bean-policy';
import {enqueueOperation} from './operations-events';

// Referral rewards (user decisions 2026-11-01, docs/referral-design-20261101.md):
// - every member has one referral row; its id is the invite code joined to members.id.
// - only the member who invited directly is rewarded, once, on the invitee's first live payment.
// - the reward is 100 withdrawable promotional beans (earned-promotion lot, provenance = referral_signups row).
// - refunding that payment claws the reward back; beans already paid out become a bean receivable.
export const REFERRAL_REWARD_BEANS=100;
export const referralEnabled=(config:{get:(key:string)=>any})=>config.get('REFERRAL_ENABLED')==='true';

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

/**
 * Called inside the payment success transaction. Only live payments count: test-key payments must never mint withdrawable beans.
 * Idempotent per invitee: the first successful payment wins, later payments are ignored.
 */
export async function grantReferralReward(tx:any,config:{get:(key:string)=>any},payer:string,source:'checkout'|'bean_charge',sourceId:string,live:boolean){
 if(!referralEnabled(config)||!live||config.get('BEAN_LEDGER_ENABLED')!=='true')return null;
 const rows:any[]=await tx.$queryRaw`SELECT id FROM referral_signups WHERE member_id=${payer} FOR UPDATE`;if(!rows.length)return null;
 const signup=await tx.referralSignup.findUniqueOrThrow({where:{id:rows[0].id}});if(signup.reward_status!=='pending')return null;
 const referrer=await tx.member.findFirst({where:{id:signup.referrer_id,enabled:true},select:{id:true}});if(!referrer)return null;
 await lockWallets(tx,signup.referrer_id);const q=REFERRAL_REWARD_BEANS;
 await move(tx,`referral-reward:${signup.id}`,'referral.reward','친구 초대 첫 결제 보상',signup.id,[{member:'company',bucket:'stock',delta:-q},{member:signup.referrer_id,bucket:'earned-promotion',delta:q}]);
 await tx.beanLot.create({data:{member_id:signup.referrer_id,bucket:'earned-promotion',grant_id:signup.id,available:q,release_at:new Date()}});
 const granted=await tx.referralSignup.update({where:{id:signup.id},data:{reward_status:'granted',reward_quantity:q,reward_source:source,reward_source_id:sourceId,rewarded_at:new Date()}});
 await tx.memberNotification.create({data:{member_id:signup.referrer_id,type:'settlement',text:`초대한 친구가 첫 결제를 해 출금 가능한 프로모션콩 ${q}개를 받았어요.`,path:'/beans'}});
 await enqueueOperation(tx,'referral.rewarded',{memberId:signup.referrer_id,targetId:signup.id},`referral.rewarded:${signup.id}`,{amount:q});
 return granted;
}

/**
 * Called when the rewarding payment is refunded (fully or partly) or disputed. Beans still in the lot go back to stock;
 * beans already reserved or paid out are frozen in place and recorded as an open bean receivable that blocks later bean payouts.
 */
export async function clawBackReferralReward(tx:any,source:'checkout'|'bean_charge',sourceId:string){
 const signup=await tx.referralSignup.findFirst({where:{reward_source:source,reward_source_id:sourceId,reward_status:'granted'}});if(!signup)return null;
 await lockWallets(tx,signup.referrer_id);
 const lot=await tx.beanLot.findFirst({where:{member_id:signup.referrer_id,bucket:'earned-promotion',grant_id:signup.id}});
 const back=lot?.available||0,owed=signup.reward_quantity-back;
 if(back){await move(tx,`referral-clawback:${signup.id}`,'referral.clawback','친구 초대 보상 회수(결제 환불)',signup.id,[{member:signup.referrer_id,bucket:'earned-promotion',delta:-back},{member:'company',bucket:'stock',delta:back}]);}
 if(lot)await tx.beanLot.update({where:{id:lot.id},data:{available:0,frozen:true}});
 if(owed>0){const net=Math.floor(owed*beanPolicy.krwPerBean*(10000-beanPolicy.withdrawalFeeBps)/10000);
  await tx.creatorReceivable.upsert({where:{kind_source_id_creator_id:{kind:'beans',source_id:`referral:${signup.id}`,creator_id:signup.referrer_id}},create:{creator_id:signup.referrer_id,kind:'beans',source_id:`referral:${signup.id}`,amount:net,note:'친구 초대 보상의 결제가 환불되어 이미 출금된 보상콩을 돌려받아야 합니다.'},update:{}});}
 const updated=await tx.referralSignup.update({where:{id:signup.id},data:{reward_status:'clawed_back',clawed_back_at:new Date()}});
 await enqueueOperation(tx,'referral.clawed_back',{memberId:signup.referrer_id,targetId:signup.id},`referral.clawed_back:${signup.id}`,{amount:signup.reward_quantity});
 return updated;
}

/** The member's own link and results. Invitee identities are not shown: only counts and reward totals. */
export async function referralSummary(db:any,member:string){
 const referral=await ensureReferral(db,member);
 const [invited,rewarded,rows]=await Promise.all([db.referralSignup.count({where:{referrer_id:member}}),db.referralSignup.count({where:{referrer_id:member,reward_status:'granted'}}),db.referralSignup.aggregate({where:{referrer_id:member,reward_status:'granted'},_sum:{reward_quantity:true}})]);
 return{code:referral.id,invited,rewarded,rewardBeans:rows._sum.reward_quantity||0,rewardPerInvite:REFERRAL_REWARD_BEANS};
}
export function referralCodeInput(value:unknown){if(value===undefined||value===null||value==='')return undefined;return text(value,36);}
export const assertReferralCode=async(db:any,code:unknown)=>{if(!await findReferral(db,code))reject(400,'INVALID_REFERRAL','초대 링크를 확인해주세요.');};
/**
 * Bean payouts were creator-only. A member holding a granted referral reward may also register a settlement account,
 * set the withdrawal PIN and withdraw beans with the same conditions (user decision 2026-11-01). Membership payouts stay creator-only.
 */
export async function requireBeanPayoutMember(db:any,member:string){
 if(await db.creator.findUnique({where:{user_id:member},select:{id:true}}))return;
 if(await db.referralSignup.findFirst({where:{referrer_id:member,reward_status:{in:['granted','clawed_back']}},select:{id:true}}))return;
 reject(403,'CREATOR_REQUIRED','크리에이터 또는 친구 초대 보상을 받은 회원만 이용할 수 있습니다.');
}
export async function myReferral(db:any,config:{get:(key:string)=>any},member:string){if(!referralEnabled(config))reject(404,'REFERRAL_DISABLED','친구 초대 기능을 준비 중입니다.');return referralSummary(db,member);}
