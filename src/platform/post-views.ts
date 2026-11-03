import {createHash} from 'crypto';
import {PlatformService} from './service';
import {reject} from './http';
export const VIEW_WINDOW_MS=30*60*1000;
const bits={feed:1,detail:2,video:4};
const sources=['kakao','copy','native','external','direct','internal'];
export function viewDelta(flags:number,kind:keyof typeof bits,allowed:boolean,source:string){
 const bit=bits[kind],counted=allowed&&!(flags&8),fresh=!(flags&bit);
 const counters:Record<string,number>={};
 if(fresh)counters[kind]=1;
 if(fresh&&kind==='detail'&&['kakao','copy','native','external'].includes(source)){counters.shared=1;counters[source]=1;}
 return{flags:flags|bit|(allowed?8:0),counted,counters};
}
/** Visibility is a browser measurement, not an access entitlement or proof of payment consumption. */
export async function recordPostView(service:PlatformService,id:string,input:any,req:any,now=new Date()){
 if(!req.headers.origin)reject(403,'ORIGIN_REQUIRED','요청 출처가 필요합니다.');
 if(!input||!Object.prototype.hasOwnProperty.call(bits,input.kind)||!sources.includes(input.source)||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(input.visitor||'')||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id))reject(400,'INVALID_VIEW','조회 요청을 확인해주세요.');
 const ua=String(req.headers['user-agent']||'');if(!ua||/bot|crawler|spider|preview|facebookexternalhit|headless|slurp/i.test(ua))return{recorded:false};
 const member=req.user?.sub,hash=createHash('sha256').update(`${id}:${member?'member:'+member:'visitor:'+input.visitor}`).digest('hex');
 return service.db.$transaction(async tx=>{
  await tx.$queryRaw`SELECT id FROM postings WHERE id=${id} FOR UPDATE`;
  const post=await tx.posting.findUnique({where:{id}});if(!post||post.is_deleted||post.hidden_at||post.status!=='PUBLISHED'||!post.is_public||post.publish_start_at&&post.publish_start_at>now||post.publish_end_at&&post.publish_end_at<=now||post.user_sub===member)return{recorded:false};
  const creator=await tx.creator.findUnique({where:{user_id:post.user_sub}});if(!creator?.is_active)return{recorded:false};
  const allowed=await service.access(post,member,tx);
  if(!allowed&&(input.kind!=='feed'||post.is_sensitive||!post.is_public))return{recorded:false};
  if(input.kind==='video'&&!await tx.postingMedia.count({where:{posting_id:id,is_deleted:false,media:{type:'VIDEO',is_deleted:false,processing_status:'COMPLETED'}}}))return{recorded:false};
  const key={posting_id:id,visitor_hash:hash},stored=await tx.postViewWindow.findUnique({where:{posting_id_visitor_hash:key}});
  const fresh=!stored||stored.expires_at<=now,flags=fresh?0:stored.flags;
  const delta=viewDelta(flags,input.kind,allowed,input.source),expires=fresh?new Date(now.getTime()+VIEW_WINDOW_MS):stored.expires_at;
  if(!fresh&&delta.flags===flags)return{recorded:false,views:post.total_view_count};
  await tx.postViewWindow.upsert({where:{posting_id_visitor_hash:key},create:{...key,flags:delta.flags,expires_at:expires},update:{flags:delta.flags,expires_at:expires}});
  const counters={...delta.counters,...(fresh?{visits:1}:{})};
  await tx.postMetric.upsert({where:{posting_id:id},create:{posting_id:id,...counters},update:Object.fromEntries(Object.entries(counters).map(([key,n])=>[key,{increment:n}]))});
  if(delta.counted)await tx.posting.update({where:{id},data:{total_view_count:{increment:1}}});
  return{recorded:true,views:post.total_view_count+(delta.counted?1:0)};
 });
}
