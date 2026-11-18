import {randomUUID} from 'crypto';
import {ensureBeanWallet,postBeanMovement} from './bean-ledger';
import {appendAudit} from './audit';

// 2026-11-18 user decision: promotion beans 10 (30-day lot, same as the open event) once per account, on the member's first ever
// advertising-consent ON (signup or settings). Members who consented before this release already have an earlier consent row and get
// nothing; withdrawing keeps the beans, re-enabling never grants again. Only while the bean ledger is on.
export const MARKETING_REWARD={beans:10,validDays:30} as const;
export const MARKETING_REWARD_ACTOR='system:marketing-consent-reward:v1';
export const marketingRewardKey=(member:string)=>`marketing-consent-reward:v1:${member}`;
export const marketingRewardOn=(config?:{get:(key:string)=>any})=>config?.get('BEAN_LEDGER_ENABLED')==='true';
const REASON='광고성 정보 수신 동의 혜택';

/** True while this member has never consented and never received the reward (used to decide whether the UI may promise beans). */
export async function marketingRewardEligible(db:any,member:string){
 if(await db.beanPromotion.findUnique({where:{request_key:marketingRewardKey(member)},select:{id:true}}))return false;
 return !await db.memberConsent.findFirst({where:{member_id:member,kind:'marketing'},select:{id:true}});
}

async function account(tx:any,wallet:string,bucket:string){return tx.beanAccount.upsert({where:{wallet_id_bucket:{wallet_id:wallet,bucket}},create:{id:randomUUID(),wallet_id:wallet,bucket},update:{}});}

/**
 * Called inside the consent transaction right after the new 'marketing' consent row. Known ledger blockers (empty company stock,
 * frozen wallet) are checked under the wallet locks first and only skip the reward, so the member's consent choice is still recorded.
 * (MySQL SAVEPOINT cannot run through Prisma's prepared statements.) Any other failure rolls back the whole consent change.
 */
export async function grantMarketingReward(tx:any,member:string,consentId:string,now=new Date()){
 if(await tx.beanPromotion.findUnique({where:{request_key:marketingRewardKey(member)},select:{id:true}}))return null;
 if(await tx.memberConsent.findFirst({where:{member_id:member,kind:'marketing',id:{not:consentId}},select:{id:true}}))return null;
 // Same company-first wallet order as the other bean grants.
 await tx.$queryRaw`SELECT id FROM bean_wallets WHERE id=${'bean-company'} FOR UPDATE`;
 const wallet=await ensureBeanWallet(tx,member);await tx.$queryRaw`SELECT id FROM bean_wallets WHERE id=${wallet.id} FOR UPDATE`;
 const q=MARKETING_REWARD.beans,stock=await account(tx,'bean-company','stock'),company=await tx.beanWallet.findUnique({where:{id:'bean-company'}}),current=await tx.beanWallet.findUniqueOrThrow({where:{id:wallet.id}});
 const blocker=company?.status!=='active'||current.status!=='active'?'BEAN_WALLET_FROZEN':stock.balance<BigInt(q)?'INSUFFICIENT_BEANS':null;
 if(blocker){await appendAudit(tx,{category:'finance',action:'beans.marketing_reward_failed',level:'warning',entityId:member,data:{memberId:member,targetId:consentId,errorCode:blocker}});return null;}
 const grant=await tx.beanPromotion.create({data:{request_key:marketingRewardKey(member),member_id:member,quantity:q,reason:REASON,actor_id:MARKETING_REWARD_ACTOR,created_at:now}});
 const promotion=await account(tx,wallet.id,'promotion');
 await postBeanMovement({$transaction:(fn:any)=>fn(tx),beanMovement:tx.beanMovement},{requestKey:`promotion:${grant.id}`,kind:'promotion',actorId:MARKETING_REWARD_ACTOR,reason:REASON,referenceId:grant.id,entries:[{accountId:stock.id,delta:-q},{accountId:promotion.id,delta:q}]});
 const lot=await tx.beanLot.create({data:{member_id:member,bucket:'promotion',grant_id:grant.id,available:q,release_at:now,expires_at:new Date(now.getTime()+MARKETING_REWARD.validDays*86400000)}});
 await appendAudit(tx,{category:'finance',action:'beans.marketing_reward_granted',entityId:grant.id,data:{memberId:member,targetId:consentId,amount:q}});
 return{beans:q,expiresAt:lot.expires_at.toISOString()};
}
