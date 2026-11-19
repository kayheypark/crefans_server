import {digest} from '../auth/local/credentials';
import type {ConfigService} from '@nestjs/config';
import {createHash,createHmac} from 'node:crypto';
// 2026-11-15 user decision: visitors who are not signed in can try AI photo editing and post the result.
// - A visitor is a random cookie token; the server only stores its SHA-256 (as the post/media author "guest:<hash>") and an
//   HMAC of the IP for the daily IP limit. No account, name or contact is collected.
// - Guest posts show in the whole feed for 24 hours, then nobody but the same browser can open them.
// - Signing in (or signing up) on the same browser moves the guest posts and photos to that account.
// - AI credits: three per visitor plus a one-time publishing reward. Network and service caps count requests.
export const GUEST_COOKIE='cf_guest',GUEST_PREFIX='guest:',GUEST_POST_HOURS=24,GUEST_AI_LIMIT=3,GUEST_POST_REWARD=3,GUEST_IP_DAILY=10,GUEST_DAILY_TOTAL=200;
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


const postRewardId=(id:string)=>digest('ai-photo:guest-post-reward:'+id);

export async function guestPostRewardClaimed(db:any,id:string):Promise<boolean>{
 return !!await db.authRateBucket.findUnique({where:{id:postRewardId(id)},select:{id:true}});
}

// Called in the same transaction as a successful publication. The primary key enforces
// one grant per browser session, including concurrent publishes and request retries.
export async function grantGuestPostReward(tx:any,id:string):Promise<number>{
 const expires=new Date(Date.now()+GUEST_RETENTION_DAYS*86400000);
 const inserted=await tx.$executeRaw`INSERT IGNORE INTO auth_rate_buckets (id,count,expires_at)
   VALUES (${postRewardId(id)},${GUEST_POST_REWARD},${expires})`;
 return inserted===1?GUEST_POST_REWARD:0;
}
