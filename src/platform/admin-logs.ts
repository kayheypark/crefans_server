import {can} from './admin-permissions';
import {isIP} from 'node:net';
import {auditCategories,safeAuditData} from './audit';
import {adminPage,revenuePeriod} from './admin-console';
import {reject,text} from './http';

function logAdmin(admin:any){if(!can(admin,'logs','view'))reject(403,'LOG_ADMIN_REQUIRED','운영 로그 조회 권한이 필요합니다.');}
function filter(query:any,key:string,max=191){if(query[key]===undefined||query[key]==='')return undefined;const value=text(query[key],max);if(!/^[a-zA-Z0-9_.:-]+$/.test(value))reject(400,'INVALID_LOG_FILTER','로그 검색값을 확인해주세요.');return value;}
export function auditView(row:any){return{id:row.id,category:row.category,action:row.action,level:row.level,actorId:row.actor_id,actorRole:row.actor_role,ip:row.ip,peerIp:row.peer_ip,requestId:row.request_id,jobId:row.job_id,entityId:row.entity_id,sourceId:row.source_id,release:row.release,environment:row.environment,status:row.status_code,durationMs:row.duration_ms,at:row.occurred_at,metadata:safeAuditData(row.metadata as Record<string,unknown>)};}
export async function adminLogs(db:any,admin:any,query:any){
 logAdmin(admin);const period=revenuePeriod(query),{page,size,skip}=adminPage(query),category=filter(query,'category',24),level=filter(query,'level',8),ip=filter(query,'ip',45);
 if(category&&!auditCategories.includes(category as any)||level&&!['info','warning','error'].includes(level)||ip&&!isIP(ip))reject(400,'INVALID_LOG_FILTER','로그 필터를 확인해주세요.');
 const where:any={occurred_at:{gte:period.start,lt:period.end},...(category?{category}:{}),...(level?{level}:{}),...(ip?{ip}:{})};
 for(const [key,column]of[['requestId','request_id'],['actorId','actor_id'],['entityId','entity_id'],['jobId','job_id'],['action','action']]){const value=filter(query,key);if(value)where[column]=value;}
 const [rows,total]=await db.$transaction([db.platformAuditLog.findMany({where,orderBy:[{occurred_at:'desc'},{id:'desc'}],skip,take:size}),db.platformAuditLog.count({where})]);
 return{items:rows.map(auditView),total,page,pageSize:size,period:{from:period.from,to:period.to,timeZone:'Asia/Seoul'}};
}
export async function adminLogDetail(db:any,admin:any,id:string){
 logAdmin(admin);if(!/^[a-f0-9-]{36}$/i.test(id))reject(400,'INVALID_LOG_ID','로그 ID를 확인해주세요.');const row=await db.platformAuditLog.findUnique({where:{id}});if(!row)reject(404,'LOG_NOT_FOUND','로그를 찾을 수 없습니다.');
 const links=[...(row.request_id?[{request_id:row.request_id}]:[]),...(row.entity_id?[{entity_id:row.entity_id}]:[]),...(row.job_id?[{job_id:row.job_id}]:[])];
 const related=links.length?await db.platformAuditLog.findMany({where:{OR:links},orderBy:[{occurred_at:'desc'},{id:'desc'}],take:101}):[row];
 const delivery=row.source_id?await db.platformOperationalEvent.findUnique({where:{id:row.source_id},select:{attempts:true,available_at:true,delivered_at:true,last_error_code:true}}):null;
 return{event:auditView(row),timeline:related.slice(0,100).reverse().map(auditView),hasMore:related.length>100,delivery};
}
