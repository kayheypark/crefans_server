import {randomUUID} from 'crypto';
import {reject} from './http';
import {appendAudit} from './audit';
import {AI_HEART_DAILY_CAP,heartBalance,heartConversion,lockHeartUser} from './ai-photo-hearts';
import {isGuestId,grantGuestHeartReward,guestIpHashFromEnv} from './guest-policy';
import {requestContext} from './request-context';

// 2026-11-21 user request: after a first successful AI photo, a repeat generation shows a review (1–5 whole stars,
// 좋아요/별로예요/잘 모르겠어요, optional words) instead of the heart game. Reward: members 20 hearts (inside the daily heart cap),
// signed-out visitors the same credit as a full heart game (guest-policy grantGuestHeartReward, shared daily limit).
// User decision (same day): visitors review once a KST day; members once per successful photo.
export const REVIEW_HEARTS=20,REVIEW_COMMENT_MAX=500,REVIEW_SENTIMENTS=['good','bad','unsure'] as const;
const kstDay=(now=Date.now())=>new Date(now+9*3600000).toISOString().slice(0,10);
const aiMedia=(db:any,user:string)=>db.media.count({where:{user_sub:user,metadata:{path:'$.aiGenerated',equals:true}}});

/** Whether the review form replaces the heart game for this person now. */
export async function reviewStatus(db:any,user:string){
 const made=await aiMedia(db,user);if(!made)return{eligible:false};
 if(isGuestId(user)){const today=await db.aiPhotoReview.findUnique({where:{user_id_guest_day:{user_id:user,guest_day:new Date(kstDay()+'T00:00:00Z')}}});return{eligible:!today,rewardTickets:0.5};}
 const reviews=await db.aiPhotoReview.count({where:{user_id:user}});return{eligible:reviews<made,rewardHearts:REVIEW_HEARTS};
}

export function reviewInput(input:any){
 const rating=input?.rating,sentiment=input?.sentiment,raw=input?.comment;
 if(!Number.isInteger(rating)||rating<1||rating>5)reject(400,'INVALID_REVIEW','별점은 1개부터 5개까지 골라 주세요.');
 if(!REVIEW_SENTIMENTS.includes(sentiment))reject(400,'INVALID_REVIEW','좋아요·별로예요·잘 모르겠어요 중 하나를 골라 주세요.');
 if(raw!==undefined&&raw!==null&&typeof raw!=='string')reject(400,'INVALID_REVIEW','하고 싶은 말을 확인해 주세요.');
 const comment=(raw||'').trim();if(comment.length>REVIEW_COMMENT_MAX)reject(400,'INVALID_REVIEW',`하고 싶은 말은 ${REVIEW_COMMENT_MAX}자까지 쓸 수 있어요.`);
 return{rating:rating as number,sentiment:sentiment as string,comment:comment||null};
}

export async function submitReview(db:any,user:string,input:any){
 const review=reviewInput(input),guest=isGuestId(user);
 return db.$transaction(async(tx:any)=>{
  await lockHeartUser(tx,user);
  if(!(await reviewStatus(tx,user)).eligible)reject(409,'REVIEW_NOT_AVAILABLE',guest?'오늘은 이미 리뷰를 남겼어요.':'사진을 만든 뒤에 리뷰를 남길 수 있어요.');
  let hearts=0,tickets=0,capped=false,wallet:any=null;
  if(guest){tickets=await grantGuestHeartReward(tx,user,guestIpHashFromEnv(requestContext.getStore()?.ip));capped=!tickets;}
  else{
   const day=kstDay(),since=new Date(`${day}T00:00:00+09:00`);
   const games=(await tx.aiHeartGame.aggregate({_sum:{score:true},where:{user_id:user,status:'settled',created_at:{gte:since}}}))._sum.score||0;
   const reviews=(await tx.aiPhotoReview.aggregate({_sum:{reward_hearts:true},where:{user_id:user,created_at:{gte:since}}}))._sum.reward_hearts||0;
   hearts=Math.max(0,Math.min(REVIEW_HEARTS,AI_HEART_DAILY_CAP-games-reviews));capped=hearts<REVIEW_HEARTS;
   if(hearts){const before=await heartBalance(tx,user),next=heartConversion(before.hearts+hearts);await tx.aiHeartWallet.upsert({where:{user_id:user},create:{user_id:user,hearts:next.hearts,credits:next.credits},update:{hearts:next.hearts,credits:{increment:next.credits}}});}
   wallet=await heartBalance(tx,user);
  }
  const row=await tx.aiPhotoReview.create({data:{id:randomUUID(),user_id:user,guest,...review,reward_hearts:hearts,reward_tickets:tickets,guest_day:guest?new Date(kstDay()+'T00:00:00Z'):null}});
  await appendAudit(tx,{category:'business',action:'ai-photo.review',entityId:user,data:{targetId:row.id,rating:review.rating,count:hearts,credited:tickets}});
  return{id:row.id,hearts,tickets,capped,...(wallet?{wallet:{hearts:wallet.hearts,credits:wallet.credits}}:{})};
 });
}

/** Console list, newest first (members.view). The words are shown as written. */
export async function listReviews(db:any,query:any){
 const page=Math.max(1,Math.min(1000,Number.parseInt(query?.page,10)||1)),take=30,where:any={};
 if(query?.who==='guest')where.guest=true;else if(query?.who==='member')where.guest=false;
 const rating=Number(query?.rating);if(Number.isInteger(rating)&&rating>=1&&rating<=5)where.rating=rating;
 if(REVIEW_SENTIMENTS.includes(query?.sentiment))where.sentiment=query.sentiment;
 const [rows,total,stats]=await Promise.all([db.aiPhotoReview.findMany({where,orderBy:{created_at:'desc'},skip:(page-1)*take,take}),db.aiPhotoReview.count({where}),
  db.aiPhotoReview.groupBy({by:['sentiment'],where,_count:{_all:true},_avg:{rating:true}})]);
 const ids=rows.filter((r:any)=>!r.guest).map((r:any)=>r.user_id),members=ids.length?await db.member.findMany({where:{id:{in:ids}},select:{id:true,nickname:true}}):[];
 const count=stats.reduce((n:number,s:any)=>n+s._count._all,0),avg=count?stats.reduce((n:number,s:any)=>n+(s._avg.rating||0)*s._count._all,0)/count:0;
 return{items:rows.map((r:any)=>({id:r.id,guest:r.guest,userId:r.user_id,nickname:r.guest?null:members.find((m:any)=>m.id===r.user_id)?.nickname||null,rating:r.rating,sentiment:r.sentiment,comment:r.comment||'',rewardHearts:r.reward_hearts,rewardTickets:r.reward_tickets,createdAt:r.created_at.toISOString()})),
  total,page,pageSize:take,summary:{count,averageRating:Math.round(avg*10)/10,bySentiment:Object.fromEntries(REVIEW_SENTIMENTS.map(k=>[k,stats.find((s:any)=>s.sentiment===k)?._count._all||0]))}};
}
