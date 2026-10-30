import {Body,Controller,Get,Param,Post,Req,UseGuards} from '@nestjs/common';
import {appendAudit} from './audit';
import {PlatformAdminGuard} from './admin.controller';
import {Permit} from './admin-permissions';
import {reject,text} from './http';
import {PlatformService} from './service';
import {SUSPENSION_DAYS} from './suspension';
import {notifyMember} from './member-notices';

// Operator moderation promised by terms §8: hide a post, restrict an account. Every action is kept in moderation_actions.
// reason is internal; publicReason is what the affected member reads in the app notice and mail (D11, 2026-10-30).
const record=(tx:any,target_type:'POST'|'MEMBER'|'COMMENT',target_id:string,action:string,reason:string,admin:any,until:Date|null=null,public_reason:string|null=null)=>tx.moderationAction.create({data:{target_type,target_id,action,reason,public_reason,until,admin_id:admin.id}});
const reasons=(input:any)=>({reason:text(input.reason,500),publicReason:text(input.publicReason,500)});
const kst=(d:Date)=>d.toLocaleString('ko-KR',{timeZone:'Asia/Seoul',hour12:false});
async function tell(tx:any,row:any,memberId:string,text:string,path:string,rows:Array<[string,string]>,publicReason:string){
 await notifyMember(tx,{dedupeKey:`moderation:${row.id}`,memberId,kind:'moderation',text,path,rows:[...rows,['사유',publicReason]],note:'이의가 있으면 고객센터에 설명과 자료를 제출해 주세요.'});
}

export async function moderatePost(db:any,admin:any,id:string,input:any){
 if(typeof input?.hidden!=='boolean')reject(400,'INVALID_INPUT','숨김 여부를 확인해주세요.');
 const {reason,publicReason}=reasons(input);
 return db.$transaction(async(tx:any)=>{
  await tx.$queryRaw`SELECT id FROM postings WHERE id=${id} FOR UPDATE`;
  const post=await tx.posting.findUnique({where:{id}});
  if(!post||post.is_deleted)reject(404,'POST_NOT_FOUND','게시물을 찾을 수 없습니다.');
  if(!!post.hidden_at===input.hidden)return{message:input.hidden?'이미 숨긴 게시물입니다.':'숨기지 않은 게시물입니다.'};
  // Hiding is itself a review decision, so the post leaves the review queue.
  await tx.posting.update({where:{id},data:input.hidden?{hidden_at:new Date(),hidden_reason:reason,hidden_by:admin.id,reviewed_at:new Date(),reviewed_by:admin.id}:{hidden_at:null,hidden_reason:null,hidden_by:null}});
  const row=await record(tx,'POST',id,input.hidden?'post.hidden':'post.unhidden',reason,admin,null,publicReason);
  await tell(tx,row,post.user_sub,input.hidden?'운영 정책에 따라 게시물이 숨겨졌습니다.':'게시물 숨김이 해제되었습니다.',`/post/${id}`,[['조치',input.hidden?'게시물 숨김':'게시물 숨김 해제'],['게시물',post.title||'(제목 없음)']],publicReason);
  await appendAudit(tx,{category:'admin',action:input.hidden?'admin.post_hidden':'admin.post_unhidden',entityId:id,data:{targetId:id,memberId:post.user_sub}});
  return{message:input.hidden?'게시물을 숨겼습니다. 작성자에게만 보입니다.':'게시물 숨김을 해제했습니다.'};
 });
}
// A hidden comment leaves every list (its replies go with a hidden parent) and no longer counts on the post.
export async function moderateComment(db:any,admin:any,id:string,input:any){
 if(typeof input?.hidden!=='boolean')reject(400,'INVALID_INPUT','숨김 여부를 확인해주세요.');
 const {reason,publicReason}=reasons(input);
 return db.$transaction(async(tx:any)=>{
  await tx.$queryRaw`SELECT id FROM comments WHERE id=${id} FOR UPDATE`;
  const comment=await tx.comment.findUnique({where:{id}});
  if(!comment||comment.is_deleted)reject(404,'COMMENT_NOT_FOUND','댓글을 찾을 수 없습니다.');
  if(comment.hidden===input.hidden)return{message:input.hidden?'이미 숨긴 댓글입니다.':'숨기지 않은 댓글입니다.'};
  await tx.comment.update({where:{id},data:{hidden:input.hidden}});
  await tx.posting.update({where:{id:comment.posting_id},data:{comment_count:input.hidden?{decrement:1}:{increment:1}}});
  const row=await record(tx,'COMMENT',id,input.hidden?'comment.hidden':'comment.unhidden',reason,admin,null,publicReason);
  await tell(tx,row,comment.author_id,input.hidden?'운영 정책에 따라 댓글이 숨겨졌습니다.':'댓글 숨김이 해제되었습니다.',`/post/${comment.posting_id}`,[['조치',input.hidden?'댓글 숨김':'댓글 숨김 해제'],['댓글',String(comment.content).slice(0,60)]],publicReason);
  await appendAudit(tx,{category:'admin',action:input.hidden?'admin.comment_hidden':'admin.comment_unhidden',entityId:id,data:{targetId:id,memberId:comment.author_id,postId:comment.posting_id}});
  return{message:input.hidden?'댓글을 숨겼습니다.':'댓글 숨김을 해제했습니다.'};
 });
}
// Beta review queue: published posts nobody has checked since the author's last save.
export async function reviewPost(db:any,admin:any,id:string){
 return db.$transaction(async(tx:any)=>{
  await tx.$queryRaw`SELECT id FROM postings WHERE id=${id} FOR UPDATE`;
  const post=await tx.posting.findUnique({where:{id}});
  if(!post||post.is_deleted)reject(404,'POST_NOT_FOUND','게시물을 찾을 수 없습니다.');
  if(post.reviewed_at)return{message:'이미 검수한 게시물입니다.'};
  await tx.posting.update({where:{id},data:{reviewed_at:new Date(),reviewed_by:admin.id}});
  await record(tx,'POST',id,'post.reviewed','검수 완료',admin);
  return{message:'검수 완료로 표시했습니다.'};
 });
}
export async function moderateMember(db:any,admin:any,id:string,input:any){
 if(typeof input?.suspended!=='boolean'||input.suspended&&input.days!==null&&!SUSPENSION_DAYS.includes(input.days))reject(400,'INVALID_INPUT','제한 여부와 기간(7일·30일·무기한)을 확인해주세요.');
 const {reason,publicReason}=reasons(input);
 return db.$transaction(async(tx:any)=>{
  await tx.$queryRaw`SELECT id FROM members WHERE id=${id} FOR UPDATE`;
  const member=await tx.member.findUnique({where:{id}});
  if(!member)reject(404,'MEMBER_NOT_FOUND','회원을 찾을 수 없습니다.');
  if(input.suspended){
   const now=new Date(),until=input.days===null?null:new Date(now.getTime()+input.days*86400000);
   await tx.member.update({where:{id},data:{suspended_at:now,suspended_until:until,suspension_reason:reason}});
   // Existing sessions end immediately; login is refused while the restriction lasts.
   await tx.memberSession.deleteMany({where:{member_id:id}});
   const row=await record(tx,'MEMBER',id,'member.suspended',reason,admin,until,publicReason);
   await tell(tx,row,id,'계정 이용이 제한되었습니다.','/support',[['조치','이용 제한'],['기간',until?`${kst(until)}까지`:'운영자가 해제할 때까지']],publicReason);
   await appendAudit(tx,{category:'admin',action:'admin.member_suspended',entityId:id,data:{memberId:id}});
   return{message:'회원 이용을 제한했습니다. 로그인 세션을 종료했습니다.'};
  }
  if(!member.suspended_at)return{message:'이용 제한 중인 회원이 아닙니다.'};
  await tx.member.update({where:{id},data:{suspended_at:null,suspended_until:null,suspension_reason:null}});
  const row=await record(tx,'MEMBER',id,'member.unsuspended',reason,admin,null,publicReason);
  await tell(tx,row,id,'계정 이용 제한이 해제되었습니다.','/support',[['조치','이용 제한 해제']],publicReason);
  await appendAudit(tx,{category:'admin',action:'admin.member_unsuspended',entityId:id,data:{memberId:id}});
  return{message:'회원 이용 제한을 해제했습니다.'};
 });
}
export async function moderationHistory(db:any,type:'POST'|'MEMBER'|'COMMENT',id:string){
 const rows=await db.moderationAction.findMany({where:{target_type:type,target_id:id},orderBy:{created_at:'desc'},take:100});
 const admins=await db.admin.findMany({where:{id:{in:[...new Set(rows.map((r:any)=>r.admin_id))]}},select:{id:true,name:true}});
 return rows.map((r:any)=>({action:r.action,reason:r.reason,publicReason:r.public_reason,until:r.until,adminName:admins.find((a:any)=>a.id===r.admin_id)?.name??null,createdAt:r.created_at}));
}

@Controller('admin') @UseGuards(PlatformAdminGuard)
export class ModerationAdminController {
 constructor(private service:PlatformService){}
 @Post('posts/:id/moderation') @Permit(['content','update']) post(@Req() r:any,@Param('id') id:string,@Body() body:any){return moderatePost(this.service.db,r.admin,id,body);}
 @Post('posts/:id/review') @Permit(['content','update']) review(@Req() r:any,@Param('id') id:string){return reviewPost(this.service.db,r.admin,id);}
 @Get('posts/:id/moderation') @Permit(['content','view']) postHistory(@Param('id') id:string){return moderationHistory(this.service.db,'POST',id);}
 @Post('comments/:id/moderation') @Permit(['content','update']) comment(@Req() r:any,@Param('id') id:string,@Body() body:any){return moderateComment(this.service.db,r.admin,id,body);}
 @Get('comments/:id/moderation') @Permit(['content','view']) commentHistory(@Param('id') id:string){return moderationHistory(this.service.db,'COMMENT',id);}
 @Post('members/:id/suspension') @Permit(['members','update']) member(@Req() r:any,@Param('id') id:string,@Body() body:any){return moderateMember(this.service.db,r.admin,id,body);}
 @Get('members/:id/suspension') @Permit(['members','view']) memberHistory(@Param('id') id:string){return moderationHistory(this.service.db,'MEMBER',id);}
}
