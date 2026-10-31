import {reject} from './http';
import {enqueueOperation} from './operations-events';

// 2026-10-31: the profile photo and background photo are edited once on the member profile page.
// members.picture and user_profiles.cover are the source; a creator's creators.avatar/cover follow them.
const mediaUrl=/^\/api\/v1\/media\/([0-9a-f-]{36})\/file$/;
async function ownImage(db:any,member:string,value:unknown){
 if(value===null)return null;
 const id=typeof value==='string'?mediaUrl.exec(value)?.[1]:undefined;if(!id)reject(400,'INVALID_MEDIA','사진을 다시 선택해주세요.');
 const media=await db.media.findUnique({where:{id}});
 if(!media||media.user_sub!==member||media.type!=='IMAGE'||media.is_deleted||media.processing_status!=='COMPLETED')reject(400,'INVALID_MEDIA','사진을 다시 선택해주세요.');
 return media.original_url as string;
}
export async function updateProfilePhotos(db:any,member:string,input:any){
 const avatar=input?.avatar===undefined?undefined:await ownImage(db,member,input.avatar),cover=input?.cover===undefined?undefined:await ownImage(db,member,input.cover);
 if(avatar===undefined&&cover===undefined)reject(400,'NO_CHANGES','바꿀 사진을 선택해주세요.');
 await db.$transaction(async(tx:any)=>{
  if(avatar!==undefined){await tx.member.update({where:{id:member},data:{picture:avatar}});await tx.creator.updateMany({where:{user_id:member},data:{avatar}});}
  if(cover!==undefined){await tx.userProfile.upsert({where:{user_id:member},create:{user_id:member,cover},update:{cover}});await tx.creator.updateMany({where:{user_id:member},data:{cover}});}
  await enqueueOperation(tx,'member.profile.updated',{memberId:member});
 });
 return{message:'사진을 저장했습니다.',avatar:avatar??undefined,cover:cover??undefined};
}
/** A profile or background photo is public while its owner uses it on their active profile. */
export async function profilePhotoInUse(db:any,media:{user_sub:string;original_url:string}){
 const owner=media.user_sub,url=media.original_url;
 if(!await db.member.findFirst({where:{id:owner,enabled:true},select:{id:true}}))return false;
 return !!(await db.member.findFirst({where:{id:owner,picture:url},select:{id:true}})||await db.userProfile.findFirst({where:{user_id:owner,cover:url},select:{user_id:true}})||await db.creator.findFirst({where:{user_id:owner,OR:[{avatar:url},{cover:url}]},select:{id:true}}));
}
