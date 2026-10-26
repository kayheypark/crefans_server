import {Injectable} from '@nestjs/common';
import {ConfigService} from '@nestjs/config';
import {randomUUID} from 'node:crypto';
import {isIP} from 'node:net';
import {NextFunction,Request,Response} from 'express';
import {PrismaService} from '../prisma/prisma.service';
import {PlatformOperationsService} from './operations.service';
import {requestContext} from './request-context';
import {observeAudit,auditOperation,safeRoute} from './audit';
import {fail} from './http';
import {verifyEdgeRequest} from './media-edge-protocol';

const WINDOW=10*60*1000,BLOCK=24*60*60*1000;
type IpState={ip:string;blocked_until:Date|null;window_start:Date;count:number;detected_at:Date|null};
type SecurityEvent={type:string;data:{ip:string;count:number;blockedUntil:string|null;rule:string;action:string};key:string};

function literalIp(value:unknown):string|undefined {
 if(typeof value!=='string'||!isIP(value)||value.includes('%'))return;
 if(isIP(value)===4)return value;
 const canonical=new URL(`http://[${value}]/`).hostname.slice(1,-1);
 // IPv4-mapped IPv6 must share the same lock and loopback exemption as IPv4.
 const mapped=/^::ffff:([0-9a-f]+):([0-9a-f]+)$/.exec(canonical);
 if(mapped){const n=parseInt(mapped[1],16)*65536+parseInt(mapped[2],16);return [n>>>24,(n>>>16)&255,(n>>>8)&255,n&255].join('.');}
 return canonical;
}
function loopback(ip:string){return ip==='::1'||/^127\./.test(ip);}
function decode(value:string){
 let result=value.replace(/\+/g,' ');
 for(let i=0;i<3;i++){try{const next=decodeURIComponent(result);if(next===result)break;result=next;}catch{break;}}
 return result;
}
function scan(req:Request):{rule?:string;oversized?:boolean} {
 const url=req.originalUrl||req.url||'',question=url.indexOf('?');
 if(question<0)return {};
 const query=url.slice(question+1);
 if(query.length>16384)return {oversized:true};
 const fields=query.split('&');
 if(fields.length>100)return {oversized:true};
 for(const field of fields){
  const equal=field.indexOf('='),key=decode(equal<0?field:field.slice(0,equal));
  if(!/^(?:id|[a-z0-9_]*Id|page|limit|offset|sort|status)(?:\[(?:\d*)\])*$/i.test(key))continue;
  const value=decode(equal<0?'':field.slice(equal+1));
  if(value.length>2048)return {oversized:true};
  const sql=value.replace(/\/\*[\s\S]*?\*\//g,' ').replace(/\s+/g,' ');
  if(/\bunion\s+(?:(?:all|distinct)\s+)?select\b/i.test(sql))return {rule:'sql_union'};
  if(/\b(?:sleep|benchmark)\s*\(/i.test(sql))return {rule:'sql_delay'};
  if(/;\s*(?:select\b|drop\s+table\b|delete\s+from\b|insert\s+into\b|update\s+\w+\s+set\b)/i.test(sql))return {rule:'sql_stacked'};
  if(/\b(?:or|and)\s+(\d+|'[^']{1,40}'|"[^"]{1,40}")\s*=\s*\1(?=\s|--|#|;|$)/i.test(sql)||/\b(?:or|and)\s+(['"])([a-z0-9]{1,40})\1\s*=\s*\1\2(?:\1)?(?=\s|--|#|;|$)/i.test(sql))return {rule:'sql_boolean'};
 }
 return {};
}

@Injectable()
export class PlatformSecurityService {
 private readonly trusted:Set<string>;
 private readonly edgeSecret:string;
 constructor(private readonly db:PrismaService,config:ConfigService,private readonly ops:PlatformOperationsService){
  this.edgeSecret=config.get<string>('MEDIA_EDGE_SECRET')||'';
  if(this.edgeSecret&&!/^[a-f0-9]{64}$/.test(this.edgeSecret))throw new Error('Invalid MEDIA_EDGE_SECRET');
  const configured=config.get<string>('TRUSTED_PROXY_IPS')||'';
  this.trusted=new Set(configured.trim()?configured.split(',').map(value=>{
   const ip=literalIp(value.trim());
   if(!ip)throw new Error('TRUSTED_PROXY_IPS must contain only literal IP addresses');
   return ip;
  }):[]);
 }
 async middleware(req:Request,res:Response,next:NextFunction){
  const peerIp=literalIp(req.socket?.remoteAddress)||'unknown';
  const header=req.headers['x-crefans-client-ip'];
  const edge=this.trusted.has(peerIp)?verifyEdgeRequest(req as any,this.edgeSecret):undefined;
  const ip=this.trusted.has(peerIp)?literalIp(edge?.ip)||literalIp(header)||peerIp:peerIp;
  const context:import('./request-context').PlatformRequestContext={ip,peerIp,requestId:randomUUID()};
  req.requestContext=context;
  res.setHeader('X-Request-ID',context.requestId);
  const started=performance.now();let completed=false;
  const record=()=>{if(completed)return;completed=true;const status=res.writableFinished?res.statusCode:499,route=safeRoute(req.route?.path);
   void observeAudit(this.db,{category:'request',action:'http.completed',level:status>=500?'error':status>=400?'warning':'info',status,durationMs:performance.now()-started,data:{method:req.method,route,outcome:res.writableFinished?'completed':'aborted'}},context);
   if(req.originalUrl.startsWith('/api/v1/admin/')&&req.method==='GET'&&context.actorId)void observeAudit(this.db,{category:'admin',action:'admin.read',status,entityId:typeof req.params?.id==='string'?req.params.id:undefined,data:{method:req.method,route}},context);
   if(status===401||status===403)void observeAudit(this.db,{category:'auth',action:status===401?'auth.denied':'authorization.denied',level:'warning',status,data:{method:req.method,route}},context);
  };
  res.once('finish',record);res.once('close',record);
  return requestContext.run(context,async()=>{
   if(!/^\/api\/v1(?:\/|\?|$)/.test(req.originalUrl||req.url||''))return next();
   const finding=scan(req);
   let blocked=false,events:SecurityEvent[]=[];
   try {
    // Read-only fast path avoids creating rows for ordinary visitors.
    const rows=ip==='unknown'?[]:await this.db.$queryRaw<IpState[]>`SELECT * FROM platform_security_ips WHERE ip=${ip}`;
    if(ip!=='unknown'&&(finding.rule||rows[0]?.blocked_until)){
     const result=await this.transition(ip,finding.rule);
     blocked=result.blocked;events=result.events;
    }
   }catch{
    // IP state and durable events roll back together; suspicious requests remain denied.
    if(finding.rule)return res.status(403).json(fail('허용되지 않은 요청입니다.','INJECTION_DETECTED'));
    return res.status(503).json(fail('요청을 처리할 수 없습니다.','SECURITY_UNAVAILABLE'));
   }
   for(const event of events){try{await this.ops.record(event.type,event.data,event.key);}catch{/* Reporting failure cannot undo a committed firewall decision. */}}
   if(blocked)return res.status(403).json(fail('접근이 제한되었습니다.','IP_BLOCKED'));
   if(finding.rule)return res.status(403).json(fail('허용되지 않은 요청입니다.','INJECTION_DETECTED'));
   if(finding.oversized)return res.status(400).json(fail('입력값을 확인해주세요.','INVALID_INPUT'));
   return next();
  });
 }
 private async transition(ip:string,rule?:string){
  return this.db.$transaction(async tx=>{
   await tx.$executeRaw`INSERT INTO platform_security_ips (ip,window_start,count) VALUES (${ip},CURRENT_TIMESTAMP(3),0) ON DUPLICATE KEY UPDATE ip=ip`;
   const [row]=await tx.$queryRaw<IpState[]>`SELECT * FROM platform_security_ips WHERE ip=${ip} FOR UPDATE`;
   const [clock]=await tx.$queryRaw<{now:Date}[]>`SELECT CURRENT_TIMESTAMP(3) AS now`;
   const now=clock.now,events:SecurityEvent[]=[];
   const emit=(type:string,action:string,key:Date)=>events.push({type,key:`${type}:${ip}:${key.toISOString()}`,data:{ip,count:row.count,blockedUntil:row.blocked_until?.toISOString()||null,rule:rule||'sql_injection',action}});
   if(row.blocked_until&&row.blocked_until>now)return {blocked:true,events};
   if(row.blocked_until){
    const expiry=row.blocked_until;
    row.blocked_until=null;row.count=0;row.window_start=now;row.detected_at=null;
    emit('security.ip_released','released',expiry);
   }
   if(rule){
    if(now.getTime()-row.window_start.getTime()>=WINDOW){row.window_start=now;row.count=0;}
    row.count++;
    if(!row.detected_at||now.getTime()-row.detected_at.getTime()>=WINDOW){row.detected_at=now;emit('security.injection_detected','detected',now);}
    if(row.count>=2&&!loopback(ip)){row.blocked_until=new Date(now.getTime()+BLOCK);emit('security.ip_blocked','blocked',row.blocked_until);}
   }
   await tx.$executeRaw`UPDATE platform_security_ips SET blocked_until=${row.blocked_until},window_start=${row.window_start},count=${row.count},detected_at=${row.detected_at} WHERE ip=${ip}`;
   const context=requestContext.getStore();
   for(const event of events){
    const saved=await tx.platformOperationalEvent.upsert({where:{dedupe_key:event.key},create:{
     type:event.type,data:event.data,dedupe_key:event.key,
     ip:context?.ip||ip,peer_ip:context?.peerIp||null,request_id:context?.requestId||null,
    },update:{}});await auditOperation(tx,saved);
   }
   return {blocked:!!row.blocked_until,events};
  });
 }
}
