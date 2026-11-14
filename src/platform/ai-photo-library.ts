import {reject} from './http';
export const PHOTO_LIBRARY_CATEGORIES=['pose','background','camera','lens','outfit','makeup','expression'] as const;
export const LIBRARY_REFERENCE_RULES:Record<string,string>={pose:'Copy only the body pose and gesture. Do not copy the reference person, face, clothing or background.',background:'Use only the environment and lighting as a background reference. Do not copy people or text from the reference.',camera:'Use only the camera angle, framing and subject placement. Preserve the source person and requested appearance.',lens:'Use only the photographic concept, lighting and photographic texture. Preserve the source identity and requested appearance.',outfit:'Use the visible clothing, wig, headwear, shoes and accessories as the outfit reference. Do not copy the reference face or body.',makeup:'Use only the makeup colors and technique. Preserve source facial identity and age.',expression:'Use only the facial expression. Preserve source facial identity and age.'};
export function libraryAsset(row:any){const saved=row.metadata?.aiLibrary;return {id:row.id,type:'image' as const,url:row.original_url,aiGenerated:row.metadata?.aiGenerated===true,title:saved.title,category:saved.category};}
export async function listPhotoLibrary(db:any,sub:string,query:any){
 const category=query?.category||'',q=typeof query?.q==='string'?query.q.trim():'';const page=Number(query?.page??0);
 if((category&&!PHOTO_LIBRARY_CATEGORIES.includes(category))||q.length>60||!Number.isSafeInteger(page)||page<0||page>10000)reject(400,'INVALID_LIBRARY_FILTER','검색 조건을 다시 확인해 주세요.');
 const AND:any[]=[{metadata:{path:'$.aiLibrary.active',equals:true}}];if(category)AND.push({metadata:{path:'$.aiLibrary.category',equals:category}});if(q)AND.push({metadata:{path:'$.aiLibrary.title',string_contains:q}});
 const rows=await db.media.findMany({where:{user_sub:sub,type:'IMAGE',is_deleted:false,processing_status:'COMPLETED',AND},orderBy:[{created_at:'desc'},{id:'desc'}],skip:page*24,take:25});
 return {items:rows.slice(0,24).map(libraryAsset),hasMore:rows.length>24};
}
export async function savePhotoLibrary(db:any,sub:string,input:any){
 const id=input?.id,title=typeof input?.title==='string'?input.title.trim():'',category=input?.category,remove=input?.remove===true;
 if(typeof id!=='string'||!/^[0-9a-f-]{36}$/.test(id))reject(400,'INVALID_LIBRARY_ASSET','사진을 다시 선택해 주세요.');
 if(!remove&&(!title||title.length>60||!PHOTO_LIBRARY_CATEGORIES.includes(category)))reject(400,'INVALID_LIBRARY_ASSET','사진 이름과 분류를 확인해 주세요.');
 return db.$transaction(async(tx:any)=>{
  await tx.$queryRaw`SELECT id FROM medias WHERE id=${id} FOR UPDATE`;
  const row=await tx.media.findFirst({where:{id,user_sub:sub,type:'IMAGE',is_deleted:false,processing_status:'COMPLETED'}});
  if(!row)reject(404,'MEDIA_NOT_FOUND','내가 올린 완료 사진만 저장할 수 있어요.');
  const metadata=typeof row.metadata==='object'&&row.metadata!==null?row.metadata:{};
  if(remove){await tx.media.update({where:{id},data:{metadata:{...metadata,aiLibrary:{active:false}}}});return {removed:true};}
  const saved=await tx.media.update({where:{id},data:{metadata:{...metadata,aiLibrary:{active:true,title,category}}}});return libraryAsset(saved);
 });
}
export async function photoLibraryReferences(db:any,sub:string,raw:unknown,kinds:string[]){
 if(raw===undefined)return [];
 let ids:unknown;try{ids=typeof raw==='string'?JSON.parse(raw):raw;}catch{reject(400,'INVALID_LIBRARY_REFERENCES','참고 사진을 다시 골라 주세요.');}
 if(!Array.isArray(ids)||ids.length>4||ids.some(id=>typeof id!=='string'||!/^[0-9a-f-]{36}$/.test(id))||new Set(ids).size!==ids.length)reject(400,'INVALID_LIBRARY_REFERENCES','내 보관함 사진은 최대 4개까지 선택해 주세요.');
 const rows=await db.media.findMany({where:{id:{in:ids as string[]},user_sub:sub,type:'IMAGE',is_deleted:false,processing_status:'COMPLETED'}}),categories=new Set<string>();
 return (ids as string[]).map(id=>{const row=rows.find((r:any)=>r.id===id),asset=row&&row.metadata?.aiLibrary;
  if(!asset?.active||!PHOTO_LIBRARY_CATEGORIES.includes(asset.category))reject(404,'LIBRARY_ASSET_NOT_FOUND','보관함에서 삭제되었거나 사용할 수 없는 사진이에요. 다시 골라 주세요.');
  if(categories.has(asset.category)||!kinds.includes(asset.category))reject(400,'INVALID_LIBRARY_REFERENCES','분류마다 사진 한 장을 선택하고 편집 항목을 확인해 주세요.');categories.add(asset.category);return libraryAsset(row);
 });
}
