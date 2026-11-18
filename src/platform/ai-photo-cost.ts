import {digest} from '../auth/local/credentials';
// 2026-11-18 user decision: AI photo provider (Seedream) cost controls.
// Official BytePlus ModelArk price for dola-seedream-5-5-261028, checked 2026-11-18:
// https://ai.byteplus.com/ark/region:ap-southeast-1/docs/model-pricing — input USD 0.008 per image, output USD 0.020 per image
// up to 2.6MP (every size this service requests is in that tier). Amounts are kept in thousandths of a dollar (milli-USD).
export const SEEDREAM_INPUT_MILLI_USD=8,SEEDREAM_OUTPUT_MILLI_USD=20;
// Hard cap on actual Seedream requests per KST day, retries, blocked outputs and timeouts included.
export const AI_PROVIDER_DAILY_CALLS=900;
// Telegram alerts once per KST day when the estimated spend crosses these amounts (주의 / 위험).
export const AI_COST_ALERTS=[{milli:30000,type:'ai-photo.cost_warning'},{milli:60000,type:'ai-photo.cost_critical'}] as const;
export const kstDay=(now=Date.now())=>new Date(now+9*3600000).toISOString().slice(0,10);
/** Estimated provider cost of one request: billed as if the image was returned (timeout/blocked billing is not documented). */
export const estimateMilliUsd=(inputImages:number)=>inputImages*SEEDREAM_INPUT_MILLI_USD+SEEDREAM_OUTPUT_MILLI_USD;

/** Counts one provider call and its estimated cost for the day, or returns null when the day's cap is already reached (nothing counted). */
export async function reserveProviderCall(db:any,day:string,inputImages:number){
 const calls=digest(`ai-photo:provider-calls:${day}`),cost=digest(`ai-photo:provider-cost-milli:${day}`),expires=new Date(Date.now()+2*86400000);
 return db.$transaction(async(tx:any)=>{
  await tx.$executeRaw`INSERT IGNORE INTO auth_rate_buckets (id,count,expires_at) VALUES (${calls},0,${expires}),(${cost},0,${expires})`;
  const [row]=await tx.$queryRaw`SELECT count FROM auth_rate_buckets WHERE id=${calls} FOR UPDATE`;
  if(Number(row.count)>=AI_PROVIDER_DAILY_CALLS)return null;
  const [spent]=await tx.$queryRaw`SELECT count FROM auth_rate_buckets WHERE id=${cost} FOR UPDATE`,before=Number(spent.count),after=before+estimateMilliUsd(inputImages);
  await tx.$executeRaw`UPDATE auth_rate_buckets SET count=count+1 WHERE id=${calls}`;
  await tx.$executeRaw`UPDATE auth_rate_buckets SET count=${after} WHERE id=${cost}`;
  return{calls:Number(row.count)+1,before,after};
 });
}
