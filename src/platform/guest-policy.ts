import type {ConfigService} from '@nestjs/config';
import {createHash,createHmac} from 'node:crypto';
// 2026-11-15 user decision: visitors who are not signed in can try AI photo editing and post the result.
// - A visitor is a random cookie token; the server only stores its SHA-256 (as the post/media author "guest:<hash>") and an
//   HMAC of the IP for the daily IP limit. No account, name or contact is collected.
// - Guest posts show in the whole feed for 24 hours, then nobody but the same browser can open them.
// - Signing in (or signing up) on the same browser moves the guest posts and photos to that account.
// - AI use: 10 per visitor, 10 per IP per day, 200 for all visitors per day; no hearts, tickets or library.
export const GUEST_COOKIE='cf_guest',GUEST_PREFIX='guest:',GUEST_POST_HOURS=24,GUEST_AI_LIMIT=10,GUEST_IP_DAILY=10,GUEST_DAILY_TOTAL=200;
export const GUEST_CONSENT_VERSION='2026-11-16.guest.4';
export const GUEST_RETENTION_DAYS=30;
export const isGuestId=(id?:string|null)=>typeof id==='string'&&id.startsWith(GUEST_PREFIX);
export const guestIdFromToken=(token:string)=>GUEST_PREFIX+createHash('sha256').update('crefans-guest:'+token).digest('hex').slice(0,40);
export function guestFromRequest(req:any):string|undefined{const token=req?.cookies?.[GUEST_COOKIE];return typeof token==='string'&&/^[A-Za-z0-9_-]{43}$/.test(token)?guestIdFromToken(token):undefined;}
export const guestCutoff=(now=Date.now())=>new Date(now-GUEST_POST_HOURS*3600000);
export function guestProfile(id:string){return{id,name:'체험 사용자',handle:'',image:'',cover:'',position:'center',bio:'',about:'',links:{},tags:[],plans:[],isCreator:false,isGuest:true,searchable:false,postCount:0,followersPublic:false,followingPublic:false,followers:'',promoted:false,isFoundingMember:false,isVerified:false};}
// The IP value is an HMAC keyed with the server secret (pseudonymous, privacy section 17); never fall back to a public key.
function guestIpKey(config:ConfigService){const key=config.get<string>('LOCAL_AUTH_SECRET');if(!key||key.length<64)throw new Error('LOCAL_AUTH_SECRET must contain at least 64 random characters');return key;}
export function guestIpHash(config:ConfigService,ip?:string|null){return createHmac('sha256',guestIpKey(config)).update('guest-ip:'+(ip||'unknown')).digest('hex').slice(0,32);}

