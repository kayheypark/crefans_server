import {digest} from '../auth/local/credentials';
import type {ConfigService} from '@nestjs/config';
import {createHash,createHmac} from 'node:crypto';
// 2026-11-15 user decision: visitors who are not signed in can try AI photo editing and post the result.
// - A visitor is a random cookie token; the server only stores its SHA-256 (as the post/media author "guest:<hash>") and an
//   HMAC of the IP for the daily IP limit. No account, name or contact is collected.
// - Guest posts show in the whole feed for 24 hours, then nobody but the same browser can open them.
// - Signing in (or signing up) on the same browser moves the guest posts and photos to that account.
// - AI credits: three per visitor plus a one-time publishing reward. Network and service caps count requests.
export const GUEST_COOKIE='cf_guest',GUEST_PREFIX='guest:',GUEST_POST_HOURS=24,GUEST_AI_LIMIT=3,GUEST_POST_REWARD=3,GUEST_SHARE_REWARD=3,GUEST_SHOP_REWARD=3,GUEST_IP_DAILY=10,GUEST_DAILY_TOTAL=200;
export const GUEST_CONSENT_VERSION='2026-11-16.guest.5';
export const GUEST_REPLAY_CONSENT_VERSION='2026-11-19.replay.1';
export const GUEST_RETENTION_DAYS=30;
export const isGuestId=(id?:string|null)=>typeof id==='string'&&id.startsWith(GUEST_PREFIX);
export const guestIdFromToken=(token:string)=>GUEST_PREFIX+createHash('sha256').update('crefans-guest:'+token).digest('hex').slice(0,40);
export function guestFromRequest(req:any):string|undefined{const token=req?.cookies?.[GUEST_COOKIE];return typeof token==='string'&&/^[A-Za-z0-9_-]{43}$/.test(token)?guestIdFromToken(token):undefined;}
export const guestCutoff=(now=Date.now())=>new Date(now-GUEST_POST_HOURS*3600000);
export function guestProfile(id:string){return{id,name:'체험 사용자',handle:'',image:'',cover:'',position:'center',bio:'',about:'',links:{},tags:[],plans:[],isCreator:false,isGuest:true,searchable:false,postCount:0,followersPublic:false,followingPublic:false,followers:'',promoted:false,isFoundingMember:false,isVerified:false};}
// The IP value is an HMAC keyed with the server secret (pseudonymous, privacy section 17); never fall back to a public key.
function guestIpKey(config:ConfigService){const key=config.get<string>('LOCAL_AUTH_SECRET');if(!key||key.length<64)throw new Error('LOCAL_AUTH_SECRET must contain at least 64 random characters');return key;}
export function guestIpHash(config:ConfigService,ip?:string|null){return createHmac('sha256',guestIpKey(config)).update('guest-ip:'+(ip||'unknown')).digest('hex').slice(0,32);}


// 2026-11-17 user decision: operators can reset every visitor's AI tries at once from the console. Guest quota buckets are
// hashed, so instead of deleting rows the reset bumps an epoch that is part of each per-visitor and per-IP key (0 = original
// keys, so counts before the first reset are kept). The guests' service-wide daily budget (ai-photo:guest-total) is not reset.
export const GUEST_QUOTA_EPOCH_SETTING='guest_ai_quota_epoch';
export async function guestQuotaEpoch(db:any):Promise<number>{const row=await db.platformSetting.findUnique({where:{key:GUEST_QUOTA_EPOCH_SETTING}});const n=Number((row?.value as any)?.epoch??row?.value);return Number.isSafeInteger(n)&&n>0?n:0;}
export const guestQuotaKey=(prefix:'ai-photo:guest:'|'ai-photo:guest-ip:',id:string,epoch:number)=>prefix+(prefix==='ai-photo:guest:'?'publish-reward:':'')+(epoch?epoch+':':'')+id;


// 2026-11-20 user decision: guest credits refill every day at 09:00 KST (00:00 UTC, the same window as members), and the
// post and share rewards (3 each) can be earned once per day and expire at the next refill.
export const guestRewardDay=(now=Date.now())=>Math.floor(now/86400000);
const nextRefill=(now=Date.now())=>new Date((guestRewardDay(now)+1)*86400000);
const postRewardId=(id:string,now=Date.now())=>digest('ai-photo:guest-post-reward:'+guestRewardDay(now)+':'+id);

export async function guestPostRewardClaimed(db:any,id:string,now=Date.now()):Promise<boolean>{
 return !!await db.authRateBucket.findUnique({where:{id:postRewardId(id,now)},select:{id:true}});
}

// Called in the same transaction as a successful publication. The primary key enforces
// one grant per browser a day, including concurrent publishes and request retries.
export async function grantGuestPostReward(tx:any,id:string,now=Date.now()):Promise<number>{
 const expires=nextRefill(now);
 const inserted=await tx.$executeRaw`INSERT IGNORE INTO auth_rate_buckets (id,count,expires_at)
   VALUES (${postRewardId(id,now)},${GUEST_POST_REWARD},${expires})`;
 return inserted===1?GUEST_POST_REWARD:0;
}

const shareRewardId=(id:string,now=Date.now())=>digest('ai-photo:guest-share-reward:'+guestRewardDay(now)+':'+id);

export async function guestShareRewardClaimed(db:any,id:string,now=Date.now()):Promise<boolean>{
 return !!await db.authRateBucket.findUnique({where:{id:shareRewardId(id,now)},select:{id:true}});
}

export async function grantGuestShareReward(tx:any,id:string,now=Date.now()):Promise<boolean>{
 const expires=nextRefill(now);
 const inserted=await tx.$executeRaw`INSERT IGNORE INTO auth_rate_buckets (id,count,expires_at)
   VALUES (${shareRewardId(id,now)},${GUEST_SHARE_REWARD},${expires})`;
 return inserted===1;
}

// 2026-11-22 user decision: Coupang clicks were too few, so opening the costume shop link on a trial result pays 3 credits,
// once per browser a day (same day/expiry as the share reward). The user accepted the Coupang Partners incentive-click risk.
const shopRewardId=(id:string,now=Date.now())=>digest('ai-photo:guest-shop-reward:'+guestRewardDay(now)+':'+id);
export async function guestShopRewardClaimed(db:any,id:string,now=Date.now()):Promise<boolean>{
 return !!await db.authRateBucket.findUnique({where:{id:shopRewardId(id,now)},select:{id:true}});
}
export async function grantGuestShopReward(tx:any,id:string,now=Date.now()):Promise<boolean>{
 const inserted=await tx.$executeRaw`INSERT IGNORE INTO auth_rate_buckets (id,count,expires_at)
   VALUES (${shopRewardId(id,now)},${GUEST_SHOP_REWARD},${nextRefill(now)})`;
 return inserted===1;
}

// 2026-11-21 user decision: a signed-out visitor who collects 30 hearts in the server-verified waiting game gets 0.5 credit,
// at most 3 credits a day per browser (guest id) and per network (IP HMAC) — whichever fills first. Same 09:00 KST day as the
// other guest rewards; the credit expires at the next refill. Buckets hold the credited sum (float).
export const GUEST_HEART_REWARD=0.5,GUEST_HEART_DAILY_MAX=3,GUEST_HEART_SCORE=30;
const heartRewardId=(id:string,now=Date.now())=>digest('ai-photo:guest-heart-reward:'+guestRewardDay(now)+':'+id);
const heartRewardIpId=(ipHash:string,now=Date.now())=>digest('ai-photo:guest-heart-reward-ip:'+guestRewardDay(now)+':'+ipHash);
export async function guestHeartRewardTotal(db:any,id:string,now=Date.now()):Promise<number>{
 const row=await db.authRateBucket.findUnique({where:{id:heartRewardId(id,now)},select:{count:true}});
 return Math.min(GUEST_HEART_DAILY_MAX,Number(row?.count||0));
}
/** Server-secret IP HMAC for code paths without the Nest ConfigService (same value as guestIpHash). */
export const guestIpHashFromEnv=(ip?:string|null)=>guestIpHash({get:(key:string)=>process.env[key]} as any,ip);
// A guest has no members row to lock; the heart game serializes on its own bucket row instead.
export async function guestHeartLock(tx:any,id:string){
 const lockId=digest('ai-photo:guest-heart-lock:'+id),expires=new Date(Date.now()+86400000);
 await tx.$executeRaw`INSERT INTO auth_rate_buckets (id,count,expires_at) VALUES (${lockId},0,${expires}) ON DUPLICATE KEY UPDATE id=id`;
 await tx.$queryRaw`SELECT id FROM auth_rate_buckets WHERE id=${lockId} FOR UPDATE`;
}
/** Credits GUEST_HEART_REWARD if both the browser and the network are under GUEST_HEART_DAILY_MAX today; returns the amount. */
export async function grantGuestHeartReward(tx:any,id:string,ipHash:string,now=Date.now()):Promise<number>{
 const expires=nextRefill(now),keys=[heartRewardId(id,now),heartRewardIpId(ipHash,now)];
 let full=false;
 for(const key of keys){
  await tx.$executeRaw`INSERT INTO auth_rate_buckets (id,count,expires_at) VALUES (${key},0,${expires}) ON DUPLICATE KEY UPDATE id=id`;
  const [row]=await tx.$queryRaw`SELECT count FROM auth_rate_buckets WHERE id=${key} FOR UPDATE` as {count:number}[];
  if(Number(row?.count||0)+GUEST_HEART_REWARD>GUEST_HEART_DAILY_MAX+1e-9)full=true;
 }
 if(full)return 0;
 for(const key of keys)await tx.$executeRaw`UPDATE auth_rate_buckets SET count=count+${GUEST_HEART_REWARD} WHERE id=${key}`;
 return GUEST_HEART_REWARD;
}
