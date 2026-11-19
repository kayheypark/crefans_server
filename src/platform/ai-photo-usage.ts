import {randomUUID} from 'node:crypto';
import {digest} from '../auth/local/credentials';
import {reject} from './http';
import {heartBalance,reserveHeartUnits,finishHeartUnits} from './ai-photo-hearts';
import {reservePaidUnits,finishPaidUnits,insufficientPhotoUnits} from './ai-shop';

type BucketLimit={key:string;seconds:number;max:number};
type GuestLimit=BucketLimit & {code:string;message:string};
type Bucket={id:string;generation:string|null;available:number};
type Usage={
 user:string;id:string;guest:boolean;buckets:{id:string;generation:string|null;units:number}[];
 reward:boolean;paid:boolean;
};

function usage(user:string,id:string,guest:boolean):Usage{return{user,id,guest,buckets:[],reward:false,paid:false};}

async function lockBucket(tx:any,limit:BucketLimit,now:number):Promise<Bucket>{
 const window=Math.floor(now/(limit.seconds*1000));
 const id=digest(limit.key+':'+window),expires=new Date((window+1)*limit.seconds*1000);
 // Keep the original window and incarnation. A release must not credit a new day or a reset bucket.
 await tx.$executeRaw`INSERT INTO auth_rate_buckets (id,count,expires_at,quota_generation)
   VALUES (${id},0,${expires},${randomUUID()}) ON DUPLICATE KEY UPDATE id=id`;
 const [row]=await tx.$queryRaw`SELECT count,quota_generation FROM auth_rate_buckets WHERE id=${id} FOR UPDATE`;
 return{id,generation:row.quota_generation,available:Math.max(0,limit.max-row.count)};
}
async function debitBucket(tx:any,request:Usage,bucket:Bucket,units:number){
 await tx.authRateBucket.update({where:{id:bucket.id},data:{count:{increment:units}}});
 request.buckets.push({id:bucket.id,generation:bucket.generation,units});
}

export function reserveGuestUsage(db:any,user:string,id:string,units:number,limits:GuestLimit[]){
 return db.$transaction(async(tx:any)=>{
  const request=usage(user,id,true),now=Date.now();
  for(const [index,limit] of limits.entries()){
   const bucket=await lockBucket(tx,limit,now);
   // The visitor's balance uses credits. IP and service caps count actual generations.
   const debit=index===0?units:1;
   if(bucket.available<debit)reject(429,limit.code,limit.message);
   await debitBucket(tx,request,bucket,debit);
  }
  return request;
 });
}

export function reserveMemberUsage(db:any,user:string,id:string,units:number,daily:BucketLimit,total:BucketLimit){
 return db.$transaction(async(tx:any)=>{
  await tx.$queryRaw`SELECT id FROM members WHERE id=${user} FOR UPDATE`;
  const request=usage(user,id,false),now=Date.now();
  const free=await lockBucket(tx,daily,now);
  const rewards=free.available>=units?0:(await heartBalance(tx,user)).credits;
  let needed=units,serviceClosed=false;
  if(free.available+rewards>0){
   const service=await lockBucket(tx,total,now);
   serviceClosed=service.available<1;
   if(!serviceClosed){
    await debitBucket(tx,request,service,1);
    const freeUnits=Math.min(needed,free.available);
    if(freeUnits>0){await debitBucket(tx,request,free,freeUnits);needed-=freeUnits;}
    if(needed>0 && rewards>0){
     const reward=await reserveHeartUnits(tx,user,id,needed);
     request.reward=true;needed-=reward.units;
    }
   }
  }
  if(needed>0){
   await reservePaidUnits(tx,user,id,needed,()=>{
    if(serviceClosed)reject(429,'SERVICE_BUSY','오늘은 AI 사진 편집 요청이 많아 잠시 쉬고 있어요. 내일 다시 이용해 주세요.');
    return insufficientPhotoUnits();
   });
   request.paid=true;
  }
  return request;
 });
}

// Paid and reward reservations return on every failed edit. Free quotas follow the existing moderation charge policy.
export async function finishPhotoUsage(db:any,request:Usage,success:boolean,returnFree:boolean){
 if(!request.paid && !request.reward && (success||!returnFree))return;
 await db.$transaction(async(tx:any)=>{
  if(!request.guest)await tx.$queryRaw`SELECT id FROM members WHERE id=${request.user} FOR UPDATE`;
  if(request.paid)await finishPaidUnits(tx,request.id,success);
  if(request.reward)await finishHeartUnits(tx,request.id,success);
  if(!success && returnFree){
   for(const bucket of request.buckets){
    await tx.$executeRaw`UPDATE auth_rate_buckets SET count=GREATEST(count-${bucket.units},0)
      WHERE id=${bucket.id} AND quota_generation <=> ${bucket.generation}`;
   }
  }
 });
}
