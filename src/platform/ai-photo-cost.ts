import {digest} from '../auth/local/credentials';
// 2026-11-18 user decision: AI photo provider (Seedream) cost controls.
// BytePlus single-output prices in milli-USD for the sizes we request, checked 2026-11-19:
// https://docs.byteplus.com/en/docs/modelark/model-pricing
export const DEFAULT_SEEDREAM_MODEL='dola-seedream-5-5-261028',FLASH_SEEDREAM_MODEL='dola-seedream-5-0-flash-260915';
type SeedreamModel=typeof DEFAULT_SEEDREAM_MODEL|typeof FLASH_SEEDREAM_MODEL;
export function configuredSeedreamModel(value?:string):SeedreamModel{
 const model=value?.trim()||DEFAULT_SEEDREAM_MODEL;
 if(model!==DEFAULT_SEEDREAM_MODEL&&model!==FLASH_SEEDREAM_MODEL)throw new Error('Unsupported AI_PHOTO_BYTEPLUS_MODEL');
 return model;
}
export const SEEDREAM_INPUT_MILLI_USD=8,SEEDREAM_OUTPUT_MILLI_USD=20;
// Hard cap on actual Seedream requests per KST day, retries, blocked outputs and timeouts included.
export const AI_PROVIDER_DAILY_CALLS=900;
// Telegram alerts once per KST day when the estimated spend crosses these amounts (주의 / 위험).
export const AI_COST_ALERTS=[{milli:30000,type:'ai-photo.cost_warning'},{milli:60000,type:'ai-photo.cost_critical'}] as const;
export const kstDay=(now=Date.now())=>new Date(now+9*3600000).toISOString().slice(0,10);
/** Budget estimate at reservation time assumes one returned image, including for attempts that later fail. */
export const estimateMilliUsd=(inputImages:number,model:SeedreamModel=DEFAULT_SEEDREAM_MODEL)=>
 model===FLASH_SEEDREAM_MODEL?18:inputImages*SEEDREAM_INPUT_MILLI_USD+SEEDREAM_OUTPUT_MILLI_USD;

/** Counts one provider call and its estimated cost for the day, or returns null when the day's cap is already reached (nothing counted). */
export async function reserveProviderCall(db:any,day:string,inputImages:number,model:SeedreamModel=DEFAULT_SEEDREAM_MODEL){
 const calls=digest(`ai-photo:provider-calls:${day}`),cost=digest(`ai-photo:provider-cost-milli:${day}`),expires=new Date(Date.now()+2*86400000);
 return db.$transaction(async(tx:any)=>{
  await tx.$executeRaw`INSERT IGNORE INTO auth_rate_buckets (id,count,expires_at) VALUES (${calls},0,${expires}),(${cost},0,${expires})`;
  const [row]=await tx.$queryRaw`SELECT count FROM auth_rate_buckets WHERE id=${calls} FOR UPDATE`;
  if(Number(row.count)>=AI_PROVIDER_DAILY_CALLS)return null;
  const [spent]=await tx.$queryRaw`SELECT count FROM auth_rate_buckets WHERE id=${cost} FOR UPDATE`,before=Number(spent.count),after=before+estimateMilliUsd(inputImages,model);
  await tx.$executeRaw`UPDATE auth_rate_buckets SET count=count+1 WHERE id=${calls}`;
  await tx.$executeRaw`UPDATE auth_rate_buckets SET count=${after} WHERE id=${cost}`;
  return{calls:Number(row.count)+1,before,after};
 });
}
