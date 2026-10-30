import {auditChange,appendAudit,contentDigest} from './audit';
import {reject,text} from './http';
export const adPlacement='featured_creator';
export const adProductView=(p:any)=>({id:p.id,name:p.name,description:p.description,terms:p.terms,placement:p.placement,amount:p.amount,durationDays:p.duration_days,visible:p.visible,onSale:p.on_sale,sortOrder:p.sort_order,version:p.version,deletedAt:p.deleted_at,createdAt:p.created_at,updatedAt:p.updated_at});
export function adProductInput(input:any){
 if(!input||typeof input!=='object'||!Number.isSafeInteger(input.amount)||input.amount<100||input.amount>10000000||!Number.isSafeInteger(input.durationDays)||input.durationDays<1||input.durationDays>365||!Number.isSafeInteger(input.sortOrder)||Math.abs(input.sortOrder)>100000||typeof input.visible!=='boolean'||typeof input.onSale!=='boolean'||input.placement!==adPlacement)reject(400,'INVALID_AD_PRODUCT','광고상품의 금액·기간·노출·판매 설정을 확인해주세요.');
 return{name:text(input.name,100),description:text(input.description,3000),terms:text(input.terms,5000,input.onSale),placement:adPlacement,amount:input.amount,duration_days:input.durationDays,visible:input.visible,on_sale:input.onSale,sort_order:input.sortOrder};
}
function auditState(p:any){return p?{amount:p.amount,duration_days:p.duration_days,visible:p.visible,on_sale:p.on_sale,sort_order:p.sort_order,version:p.version,status:p.deleted_at?'deleted':'active',titleHash:contentDigest(p.name),contentHash:contentDigest([p.description,p.terms])}:null;}
export async function saveAdProduct(db:any,id:string|undefined,input:any){
 const data=adProductInput(input);
 return db.$transaction(async(tx:any)=>{
  if(id)await tx.$queryRaw`SELECT id FROM ad_products WHERE id=${id} FOR UPDATE`;
  const before=id?await tx.adProduct.findUnique({where:{id}}):null;
  if(id&&(!before||before.deleted_at))reject(404,'AD_PRODUCT_NOT_FOUND','광고상품을 찾을 수 없습니다.');
  if(before&&input.expectedVersion!==before.version)reject(409,'AD_PRODUCT_CHANGED','다른 운영자가 상품을 변경했습니다. 다시 불러와주세요.');
  const saved=before?await tx.adProduct.update({where:{id},data:{...data,version:{increment:1}}}):await tx.adProduct.create({data});
  await appendAudit(tx,{category:'admin',action:before?'admin.ad_product_updated':'admin.ad_product_created',entityId:saved.id,data:auditChange(auditState(before),auditState(saved)!)});
  return{product:adProductView(saved),message:'광고상품을 저장했습니다.'};
 });
}
export async function deleteAdProduct(db:any,id:string,input:any){
 return db.$transaction(async(tx:any)=>{
  await tx.$queryRaw`SELECT id FROM ad_products WHERE id=${id} FOR UPDATE`;
  const before=await tx.adProduct.findUnique({where:{id}});
  if(!before)reject(404,'AD_PRODUCT_NOT_FOUND','광고상품을 찾을 수 없습니다.');
  if(before.deleted_at)return{message:'이미 삭제된 광고상품입니다.'};
  if(input?.expectedVersion!==before.version)reject(409,'AD_PRODUCT_CHANGED','다른 운영자가 상품을 변경했습니다. 다시 불러와주세요.');
  const saved=await tx.adProduct.update({where:{id},data:{deleted_at:new Date(),visible:false,on_sale:false,version:{increment:1}}});
  await appendAudit(tx,{category:'admin',action:'admin.ad_product_deleted',entityId:id,data:auditChange(auditState(before),auditState(saved)!)});
  return{message:'광고상품을 삭제했습니다. 기존 구매 이력은 보존됩니다.'};
 });
}
