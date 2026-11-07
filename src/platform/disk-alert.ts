import {statfs} from 'node:fs/promises';
import {ConfigService} from '@nestjs/config';
import {PlatformOperationsService} from './operations.service';

// 2026-11-07 user decision: keep the 50GB EBS and alert at 80% (90% as a separate, immediate stage).
type Level='ok'|'warning'|'critical';
type State={level:Level;alerted:boolean;warningAt?:number;criticalAt?:number};
type Stats={bsize:number;blocks:number;bfree:number;bavail:number};
const DAY=86400000,GiB=1024**3;

export function diskThresholds(config:ConfigService){
 const warning=Number(config.get('DISK_ALERT_WARNING_PERCENT')||80),critical=Number(config.get('DISK_ALERT_CRITICAL_PERCENT')||90);
 if(!(warning>0&&warning<critical&&critical<=100))throw new Error('Invalid disk alert thresholds');
 return{warning,critical};
}
// Same basis as `df` Use%: blocks reserved for root count as neither used nor available.
export function diskUsage(s:Stats){
 const used=(s.blocks-s.bfree)*s.bsize,available=s.bavail*s.bsize;
 return{usedPercent:used*100/(used+available),freeGiB:available/GiB,totalGiB:s.blocks*s.bsize/GiB};
}
/** In the worker container `/` is overlay2 on /var/lib/docker, i.e. the host root EBS volume (checked 2026-11-07). */
export async function checkDisk(db:any,operations:PlatformOperationsService,config:ConfigService,now=new Date(),read:(path:string)=>Promise<Stats>=statfs,stateId='disk-alert'){
 const {warning,critical}=diskThresholds(config),usage=diskUsage(await read(config.get('DISK_ALERT_PATH')||'/'));
 const level:Level=usage.usedPercent>=critical?'critical':usage.usedPercent>=warning?'warning':'ok';
 const row=await db.platformJob.upsert({where:{id:stateId},create:{id:stateId,locked_until:new Date(0)},update:{}});
 const state:State={level:'ok',alerted:false,...JSON.parse(row.note||'{}')};
 let type:string|undefined,dedupe='';
 if(level!=='ok'){
  // Each stage repeats at most once per 24 hours; reaching 90% is a different stage and goes out at once.
  const key=level==='critical'?'criticalAt':'warningAt',last=state[key];
  if(last===undefined||+now-last>=DAY){type=`disk.${level}`;dedupe=`${stateId}:${type}:${last??0}`;state[key]=+now;state.alerted=true;}
 }else if(state.alerted){type='disk.recovered';dedupe=`${stateId}:${type}:${Math.max(state.warningAt||0,state.criticalAt||0)}`;state.alerted=false;}
 state.level=level;
 if(type){
  const saved=await operations.record(type,{'사용률':`${usage.usedPercent.toFixed(1)}%`,'여유':`${usage.freeGiB.toFixed(1)}GB`,'전체':`${usage.totalGiB.toFixed(1)}GB`,'기준':`경고 ${warning}% / 위험 ${critical}%`,'검사시각':now.toISOString(),status:level},dedupe);
  // Keep the state unchanged so the next check retries the same (deduplicated) alert.
  if(!saved)throw new Error('Disk alert was not persisted');
 }
 await db.platformJob.update({where:{id:stateId},data:{completed_at:now,note:JSON.stringify(state)}});
 return{level,...usage,alert:type};
}
