// Follower notices wait for media (2026-11-02 user decision): a post published while a photo or video is still being
// watermarked or converted is held (postings.notify_pending) and announced once every attached file is COMPLETED, so
// nobody opens an empty post from a notice. A failed file tells the creator; the notice waits until they fix the post.

/** True when no live attachment of the post is still processing or failed. */
export async function postMediaReady(tx:any,postId:string){
 return !await tx.postingMedia.count({where:{posting_id:postId,is_deleted:false,media:{is_deleted:false,processing_status:{not:'COMPLETED'}}}});
}
export async function notifyPost(tx:any,post:any){const followers=await tx.userFollow.findMany({where:{following_id:post.user_sub,deleted_at:null}}),subscribers=await tx.subscription.findMany({where:{membership_item:{creator_id:post.user_sub},ended_at:{gt:new Date()},status:{in:['ONGOING','CANCELLED']}}}),excluded=await tx.accountPreference.findMany({where:{content_alert:false},select:{member_id:true}}),ids=[...new Set([...followers.map(f=>f.follower_id),...subscribers.map(s=>s.subscriber_id)])].filter(id=>id!==post.user_sub&&!excluded.some(p=>p.member_id===id));const members=await tx.member.findMany({where:{id:{in:ids},enabled:true},select:{id:true}});if(members.length)await tx.memberNotification.createMany({data:members.map(m=>({member_id:m.id,actor_id:post.user_sub,type:'content',text:'새 게시물이 발행되었습니다.',path:`/post/${post.id}`}))});}
/** Called inside the publishing transaction; stores whether the notice is still held. */
export async function announcePost(tx:any,post:any){
 // An unpublished post (is_public=false) keeps its notice held until the author or an operator publishes it again (2026-11-07).
 const pending=!post.is_public||!await postMediaReady(tx,post.id);if(!pending)await notifyPost(tx,post);
 if(pending!==!!post.notify_pending)await tx.posting.update({where:{id:post.id},data:{notify_pending:pending}});
}
/** Worker loop: announce held posts whose media has finished. Returns how many were announced. */
export async function releaseHeldNotices(db:any){
 let count=0;
 for(const {id} of await db.posting.findMany({where:{notify_pending:true,status:'PUBLISHED',is_deleted:false,is_public:true},select:{id:true},take:50,orderBy:{published_at:'asc'}})){
  await db.$transaction(async(tx:any)=>{
   await tx.$queryRaw`SELECT id FROM postings WHERE id=${id} FOR UPDATE`;
   const post=await tx.posting.findUnique({where:{id}});if(!post?.notify_pending||post.status!=='PUBLISHED'||post.is_deleted||!post.is_public||!await postMediaReady(tx,id))return;
   await notifyPost(tx,post);await tx.posting.update({where:{id},data:{notify_pending:false}});count++;
  });
 }
 return count;
}
/** A file that will never finish: every live post using it tells its creator once (the failure happens once per file). */
export async function noticeMediaFailed(db:any,mediaId:string){
 const links=await db.postingMedia.findMany({where:{media_id:mediaId,is_deleted:false,posting:{is_deleted:false}},include:{posting:{select:{id:true,user_sub:true}}}});
 for(const {posting} of links)await db.memberNotification.create({data:{member_id:posting.user_sub,type:'media',text:'게시물의 사진·영상 처리에 실패했어요. 해당 파일을 다시 올려주세요.',path:`/studio/content/${posting.id}/edit`}});
 return links.length;
}
