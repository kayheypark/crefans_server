// 2026-11-18 user decision: "의상들은 저작권 이슈가 있을 수 있어 상업적 이용이 안 되므로, 기본옷이 아닌 애니메이션·게임 의상을
// 이용한 게시글은 후원받으면 안 된다." A post is commercial-restricted when any attached photo carries metadata.aiFranchiseCostume
// (recorded by the AI photo editor, copied to watermarked copies, crops and later edits of the same photo). Such a post takes no
// post bean tips (profile tips are unaffected) and can only be fully public. Tips already received stay as they are.
import {PrismaClient} from '@prisma/client';
import {reject} from './http';
import {costumeCategory} from './ai-photo-costume-references';

export const FRANCHISE_TIP_MESSAGE='게임·애니메이션 의상을 사용한 게시물은 저작권 문제로 후원을 받을 수 없어요.';
export const FRANCHISE_ACCESS_MESSAGE='게임·애니메이션 의상을 사용한 게시물은 전체 공개로만 올릴 수 있어요.';
export const FRANCHISE_FLAG={path:'$.aiFranchiseCostume',equals:true} as const;

export const isFranchiseMedia=(metadata:unknown)=>(metadata as any)?.aiFranchiseCostume===true;
/** The franchise fields to carry from a source photo to a copy made from it (watermark, crop, re-edit). */
export function franchiseFields(metadata:unknown):{aiFranchiseCostume?:true;aiCostumeCategory?:string}{
 const m=metadata as any;return m?.aiFranchiseCostume===true?{aiFranchiseCostume:true,...(typeof m.aiCostumeCategory==='string'?{aiCostumeCategory:m.aiCostumeCategory}:{})}:{};
}
/** True when any live attachment of the post carries the franchise flag. */
export async function postCommercialRestricted(db:any,postId:string){
 return await db.postingMedia.count({where:{posting_id:postId,is_deleted:false,media:{is_deleted:false,metadata:FRANCHISE_FLAG}}})>0;
}
export async function rejectFranchiseTip(db:any,postId:string){if(await postCommercialRestricted(db,postId))reject(403,'POST_COMMERCIAL_RESTRICTED',FRANCHISE_TIP_MESSAGE);}
/** Saving a post: franchise media only on a fully public post (no plan, no minimum level). */
export async function rejectFranchiseNonPublic(db:any,mediaIds:string[],isMembership:boolean){
 if(isMembership&&mediaIds.length&&await db.media.count({where:{id:{in:mediaIds},metadata:FRANCHISE_FLAG}}))reject(400,'FRANCHISE_COSTUME_PUBLIC_ONLY',FRANCHISE_ACCESS_MESSAGE);
}

/** Backfill for photos generated before the flag existed (metadata-only, idempotent: only adds the two keys to rows without them).
 * Evidence, in order: (1) the encrypted 30-day AI request log (succeeded requests since 2026-11-16 record costumeIds and the result
 * media id), (2) a flagged photo it was made from (aiSourceId re-edit, croppedFrom crop, watermark.sourceId copy). Without evidence a
 * photo stays unknown and is not blocked. */
export async function franchiseBackfill(db:any,decrypt:(value:string)=>string,apply:boolean){
 const rows:{id:string;metadata:any}[]=await db.media.findMany({where:{metadata:{path:'$.aiGenerated',equals:true}},select:{id:true,metadata:true}});
 const byId=new Map(rows.map(r=>[r.id,r]));const category=new Map<string,string>();const proven=new Set<string>();let logs=0,unreadable=0;
 for(const r of rows)if(isFranchiseMedia(r.metadata))category.set(r.id,String(r.metadata.aiCostumeCategory||''));
 const already=category.size;
 for(const log of await db.aiPhotoFailureDetail.findMany({select:{payload_encrypted:true}})){
  let payload:any;try{payload=JSON.parse(decrypt(log.payload_encrypted));}catch{unreadable++;continue;}
  if(payload?.outcome!=='succeeded'||typeof payload.targetId!=='string'||!byId.has(payload.targetId))continue;logs++;
  const ids=Array.isArray(payload.options?.costumeIds)?payload.options.costumeIds:[];
  const franchise=ids.map((id:unknown)=>typeof id==='string'?costumeCategory(id):undefined).find((c:string|undefined)=>c&&c!=='general');
  if(franchise&&!category.has(payload.targetId))category.set(payload.targetId,franchise);else if(!franchise)proven.add(payload.targetId);
 }
 const fromLog=category.size-already;
 // Inheritance until nothing changes: a watermarked copy, crop or re-edit of a flagged photo is flagged too (all keep aiGenerated).
 for(let changed=true;changed;){changed=false;
  for(const r of rows){if(category.has(r.id))continue;const m=r.metadata||{};
   const parent=[m.aiSourceId,m.croppedFrom,m.watermark?.sourceId].find(id=>typeof id==='string'&&category.has(id));
   if(parent){category.set(r.id,category.get(parent)!);changed=true;}}}
 const updates=rows.filter(r=>category.has(r.id)&&!isFranchiseMedia(r.metadata));
 if(apply)for(const r of updates)await db.media.update({where:{id:r.id},data:{metadata:{...r.metadata,aiFranchiseCostume:true,...(category.get(r.id)?{aiCostumeCategory:category.get(r.id)}:{})}}});
 const aiRows=rows;
 const unknown=aiRows.filter(r=>!category.has(r.id)&&!proven.has(r.id)).length;
 return{aiMedia:aiRows.length,alreadyFlagged:already,flaggedFromRequestLog:fromLog,flaggedFromSourcePhoto:category.size-already-fromLog,toUpdate:updates.length,updated:apply?updates.length:0,provenNoFranchise:aiRows.filter(r=>proven.has(r.id)&&!category.has(r.id)).length,unknownNoInfo:unknown,requestLogsMatched:logs,requestLogsUnreadable:unreadable};
}
/** Existing posts that hold franchise media and are not fully public: listed for the user's decision, never changed here. */
export async function franchiseNonPublicPosts(db:any){
 const posts=await db.posting.findMany({where:{is_deleted:false,is_membership:true,medias:{some:{is_deleted:false,media:{is_deleted:false,metadata:FRANCHISE_FLAG}}}},select:{id:true,user_sub:true,created_at:true,access_plan_id:true,membership_level:true,status:true},orderBy:{created_at:'asc'}});
 const handles=new Map((await db.member.findMany({where:{id:{in:posts.map((p:any)=>p.user_sub)}},select:{id:true,preferred_username:true}})).map((m:any)=>[m.id,m.preferred_username]));
 return posts.map((p:any)=>({postId:p.id,creatorHandle:handles.get(p.user_sub)||'',createdAt:p.created_at.toISOString(),access:p.access_plan_id?'plan':`level:${p.membership_level}`,status:p.status}));
}

// CLI (inside the API container): node dist/src/platform/franchise-costume.js [--apply]
// Without --apply it only counts. Prints counts and the non-public post list (post id, creator handle, created_at) — no other data.
if(require.main===module)void (async()=>{
 const apply=process.argv.includes('--apply'),db=new PrismaClient();
 try{const {PaymentProvider}=await import('./payment-provider'),crypto=new PaymentProvider({get:(key:string)=>process.env[key]} as any);
  const result=await franchiseBackfill(db,value=>crypto.decrypt(value),apply);
  console.log(JSON.stringify({mode:apply?'apply':'dry-run',...result,nonPublicPosts:await franchiseNonPublicPosts(db)},null,1));}
 catch(error:any){console.error('franchise backfill failed:',error?.message||error);process.exitCode=1;}
 finally{await db.$disconnect();}
})();
