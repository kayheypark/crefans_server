require('reflect-metadata');require('dotenv').config({path:'.local/platform.env',override:true});
const {test,after}=require('node:test'),assert=require('node:assert/strict'),{PrismaClient}=require('@prisma/client');
const {NestFactory}=require('@nestjs/core'),{Module,Controller,Get}=require('@nestjs/common');
const {PlatformModule}=require('../dist/src/platform/module'),{PlatformOperationsService}=require('../dist/src/platform/operations.service'),{PlatformSecurityService}=require('../dist/src/platform/security.service'),{PlatformExceptionFilter,EnvelopeInterceptor}=require('../dist/src/platform/http');
const {requestContext}=require('../dist/src/platform/request-context');
assert.match(process.env.DATABASE_URL||'',/@127\.0\.0\.1:3307\/crefans_platform_dev$/);
// Never enable delivery from the test runtime, even if the developer has supplied real keys.
process.env.TELEGRAM_OPERATIONS_BOT_TOKEN='';process.env.TELEGRAM_OPERATIONS_CHAT_ID='';process.env.TRUSTED_PROXY_IPS='127.0.0.1';
class Probe {error(){throw Error('private-body-must-not-leak');}context(){return requestContext.getStore();}}
Controller('operations-test')(Probe);Get('error')(Probe.prototype,'error',Object.getOwnPropertyDescriptor(Probe.prototype,'error'));Get('context')(Probe.prototype,'context',Object.getOwnPropertyDescriptor(Probe.prototype,'context'));
class TestModule {}Module({imports:[PlatformModule],controllers:[Probe]})(TestModule);
const db=new PrismaClient(),ip=`198.19.${process.pid%256}.${1+process.pid%250}`;let app,base;
after(async()=>{if(app)await app.close();await db.platformAuditLog.deleteMany({where:{ip}});await db.platformOperationalEvent.deleteMany({where:{ip}});await db.platformSecurityIp.deleteMany({where:{ip}});await db.$disconnect();});
test('Nest filter, security middleware, async context and durable outbox operate together over HTTP',async()=>{
 app=await NestFactory.create(TestModule,{logger:false});const operations=app.get(PlatformOperationsService),security=app.get(PlatformSecurityService);
 app.use((req,res,next)=>{void security.middleware(req,res,next).catch(next);});app.setGlobalPrefix('api/v1');app.useGlobalInterceptors(new EnvelopeInterceptor());app.useGlobalFilters(new PlatformExceptionFilter(operations));
 await app.listen(0,'127.0.0.1');base=await app.getUrl();
 const headers={'x-crefans-client-ip':ip,'x-forwarded-for':'203.0.113.254','cf-connecting-ip':'203.0.113.253'};
 let response=await fetch(base+'/api/v1/operations-test/context',{headers});let result=await response.json();assert.equal(result.data.ip,ip);assert.equal(result.data.peerIp,'127.0.0.1');assert.equal(response.headers.get('x-request-id'),result.data.requestId);
 response=await fetch(base+'/api/v1/operations-test/error',{headers});result=await response.json();const failedRequestId=response.headers.get('x-request-id');assert.match(failedRequestId,/^[a-f0-9-]{36}$/);assert.equal(response.status,500);assert.equal(result.errorCode,'INTERNAL_ERROR');assert.doesNotMatch(JSON.stringify(result),/private-body/);
 for(let i=0;i<40;i++){if(await db.platformOperationalEvent.count({where:{ip,type:'http.error'}}))break;await new Promise(r=>setTimeout(r,25));}
 const error=await db.platformOperationalEvent.findFirst({where:{ip,type:'http.error'}});assert.ok(error);assert.equal(error.data.route,'/api/v1/operations-test/error');assert.equal(error.data.status,500);assert.equal(error.data.errorType,'Error');assert.doesNotMatch(JSON.stringify(error),/private-body/);
 const audit=await db.platformAuditLog.findMany({where:{request_id:failedRequestId}});assert.ok(audit.some(r=>r.action==='http.completed'&&r.status_code===500));assert.ok(audit.some(r=>r.category==='error'&&r.metadata.fingerprint));assert.doesNotMatch(JSON.stringify(audit),/private-body/);
 response=await fetch(base+'/api/v1/admin/logs',{headers});assert.equal(response.status,401);const deniedId=response.headers.get('x-request-id');
 for(let i=0;i<40;i++){if(await db.platformAuditLog.count({where:{request_id:deniedId,action:'auth.denied'}}))break;await new Promise(r=>setTimeout(r,25));}assert.equal(await db.platformAuditLog.count({where:{request_id:deniedId,action:'auth.denied'}}),1);
 const attack=base+'/api/v1/operations-test/context?categoryId=1%20UNION%20SELECT%20NULL';
 response=await fetch(attack,{headers});assert.equal(response.status,403);assert.equal((await response.json()).errorCode,'INJECTION_DETECTED');
 response=await fetch(attack,{headers});assert.equal(response.status,403);assert.equal((await response.json()).errorCode,'IP_BLOCKED');
 response=await fetch(base+'/api/v1/operations-test/context',{headers});assert.equal(response.status,403);
 assert.equal(await db.platformOperationalEvent.count({where:{ip,type:'security.ip_blocked'}}),1);
 await db.platformSecurityIp.update({where:{ip},data:{blocked_until:new Date(Date.now()-1)}});
 response=await fetch(base+'/api/v1/operations-test/context',{headers});assert.equal(response.status,200);assert.equal(await db.platformOperationalEvent.count({where:{ip,type:'security.ip_released'}}),1);
});
