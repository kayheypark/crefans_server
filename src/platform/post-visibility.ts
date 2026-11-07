import {appendAudit} from './audit';
import {reject,text} from './http';

// Post unpublish (2026-11-07 user decision): postings.is_public=false shows the post to its author only, separate from
// operator hiding (moderation.ts moderatePost, hidden_at). The author (studio, no reason) or an operator (console, reason required, no notice to the author)
// switches it; each change is kept in moderation_actions with who did it. Nothing else about the post changes.
export async function setPostVisibility(db:any,actor:{type:'ADMIN'|'CREATOR';id:string},id:string,input:any){
 if(typeof input?.public!=='boolean')reject(400,'INVALID_INPUT','공개 여부를 확인해주세요.');
 const reason=actor.type==='ADMIN'?text(input.reason,500):'';
 return db.$transaction(async(tx:any)=>{
  await tx.$queryRaw`SELECT id FROM postings WHERE id=${id} FOR UPDATE`;
  const post=await tx.posting.findUnique({where:{id}});
  if(!post||post.is_deleted||actor.type==='CREATOR'&&post.user_sub!==actor.id)reject(404,'POST_NOT_FOUND','게시물을 찾을 수 없습니다.');
  if(post.is_public===input.public)return{message:input.public?'이미 공개된 게시물입니다.':'이미 미공개인 게시물입니다.'};
  await tx.posting.update({where:{id},data:{is_public:input.public}});
  const action=input.public?'post.republished':'post.unpublished';
  await tx.moderationAction.create({data:{target_type:'POST',target_id:id,action,reason,admin_id:actor.id,actor_type:actor.type}});
  await appendAudit(tx,{category:actor.type==='ADMIN'?'admin':'business',action:(actor.type==='ADMIN'?'admin.':'creator.')+action.replace('.','_'),entityId:id,data:{postId:id,memberId:post.user_sub,changedBy:actor.type.toLowerCase()}});
  if(!input.public)return{message:'게시물을 미공개로 바꿨습니다. 작성자에게만 보입니다.'};
  return{message:post.hidden_at?'공개로 바꿨지만 운영 정책에 따라 숨겨진 게시물이라 아직 다른 회원에게 보이지 않습니다.':'게시물을 다시 공개했습니다.'};
 });
}
