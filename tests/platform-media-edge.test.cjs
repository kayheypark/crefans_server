require('reflect-metadata');
const {test}=require('node:test'),assert=require('node:assert/strict'),{randomBytes,randomUUID}=require('node:crypto');
const {createMediaEdgeHandler}=require('../dist/src/platform/media-edge-handler');
const {authCookie,signedEdgeHeaders,verifyEdgeRequest}=require('../dist/src/platform/media-edge-protocol');
const {PlatformMediaController}=require('../dist/src/platform/media.controller');
const {PlatformMediaEdgeGuard}=require('../dist/src/platform/platform-auth.guard');
const {PlatformSecurityService}=require('../dist/src/platform/security.service');
const {ConfigService}=require('@nestjs/config');
const secret=randomBytes(32).toString('hex'),id=randomUUID(),config={secret,authHost:'beta-origin.crefans.com',mediaOnly:true};
function event(overrides={},type='viewer-request'){return{Records:[{cf:{config:{eventType:type,requestId:randomUUID()},request:{method:'GET',uri:`/api/v1/media/${id}/file`,querystring:'',clientIp:'198.51.100.7',headers:{host:[{value:'beta.crefans.com'}],cookie:[{value:'access_token=la.test; refresh_token=lr.test'}]},...overrides},response:{status:'200',headers:{'cache-control':[{value:'max-age=86400'}]}}}}]};}
const flat=headers=>Object.fromEntries(Object.entries(headers).map(([k,v])=>[k,v.map(h=>h.value).join('; ')]));
test('edge signs canonical session, requested file/method/range and true IP before every cache lookup',async()=>{
 let calls=0;
 const handler=createMediaEdgeHandler(config,async(host,path,headers)=>{calls++;assert.equal(host,config.authHost);const signed=verifyEdgeRequest({headers,method:'GET',originalUrl:path},secret);assert.equal(signed.ip,'198.51.100.7');assert.equal(signed.purpose,'media');assert.match(signed.cookie,/access_token=la.test/);return{status:200,body:{success:true,data:{delivery:'s3',key:`platform/${id}`}}};});
 for(let i=0;i<3;i++){const result=await handler(event());assert.equal(result.uri,`/platform/${id}`);assert.equal(result.headers.cookie,undefined);assert.deepEqual(Object.keys(result.headers),['host']);}
 assert.equal(calls,3);
});
test('a warm cached object cannot authorize a different account or a subsequently revoked session',async()=>{
 let allowed=true,calls=0;const handler=createMediaEdgeHandler(config,async(_h,_p,headers)=>{calls++;return allowed&&headers.cookie?.includes('la.test')?{status:200,body:{success:true,data:{delivery:'s3',key:`platform/${id}`}}}:{status:403,body:{success:false}};});
 assert.equal((await handler(event())).uri,`/platform/${id}`);
 for(const cookie of ['', 'access_token=la.stranger'])assert.equal((await handler(event({headers:{host:[{value:'beta.crefans.com'}],cookie:[{value:cookie}]}}))).status,'403');
 allowed=false;for(const method of ['GET','HEAD'])assert.equal((await handler(event({method}))).status,'403');assert.equal(calls,5);
});
test('the existing video retry counter rechecks rights and cannot change the cached object scope',async()=>{
 let calls=0;const handler=createMediaEdgeHandler(config,async()=>{calls++;return{status:200,body:{success:true,data:{delivery:'s3',key:`platform/${id}`}}};});
 const r=await handler(event({querystring:'media_retry=2'}));assert.equal(r.uri,`/platform/${id}`);assert.equal(r.querystring,'');assert.equal(calls,1);
 for(const querystring of ['media_retry=2&Signature=x','media_retry=2&media_retry=3','media_retry=../private'])assert.equal((await handler(event({querystring}))).status,'403');assert.equal(calls,1);
});
test('authorization errors, timeout, invalid success and cross-object mappings always fail closed',async()=>{
 const results=[{status:500,body:{}},{status:200,body:{success:false}},{status:200,body:{success:true,data:{delivery:'s3',key:`platform/${randomUUID()}`}}},{status:200,body:{success:true,data:{delivery:'s3',key:'../private'}}}];
 for(const result of results)assert.equal((await createMediaEdgeHandler(config,async()=>result)(event())).status,'503');
 assert.equal((await createMediaEdgeHandler(config,async()=>{throw Error('private upstream failure');})(event())).status,'503');
});
test('malformed paths, query signatures, methods, range lists and duplicate auth cookies never reach the authorizer',async()=>{
 let calls=0;const handler=createMediaEdgeHandler(config,async()=>{calls++;throw Error('unexpected');});
 for(const override of [{uri:`/platform/${id}`},{uri:`/api/v1/media/%2e%2e/file`},{uri:`/api/v1/media/${id}/file/`},{querystring:'Signature=old'},{method:'OPTIONS'},{method:'POST'},{headers:{range:[{value:'bytes=0-3,5-7'}]}},{headers:{cookie:[{value:'access_token=a; access_token=b'}]}}])assert.ok(['403','416'].includes((await handler(event(override))).status));
 assert.equal(calls,0);
});
test('origin identities are overwritten and signed; successful and denied browser responses are no-store',async()=>{
 const handler=createMediaEdgeHandler({...config,mediaOnly:false}),source=event({uri:'/service/feed'});source.Records[0].cf.request.headers['x-crefans-edge-ip']=[{value:'1.1.1.1'}];
 const result=await handler(source);assert.equal(verifyEdgeRequest({headers:flat(result.headers),method:'GET',url:'/service/feed'},secret).ip,'198.51.100.7');
 const response=await handler(event({},'viewer-response'));assert.equal(response.headers['cache-control'][0].value,'private, no-store');assert.equal(response.headers['cross-origin-resource-policy'][0].value,'same-origin');
 const denied=await createMediaEdgeHandler(config,async()=>({status:401,body:{errorCode:'SESSION_EXPIRED'}}))(event());assert.equal(denied.status,'401');assert.equal(JSON.parse(denied.body).errorCode,'SESSION_EXPIRED');assert.equal(denied.headers['cache-control'][0].value,'private, no-store');
});
test('HMAC rejects changed credentials, IP, path, range, expiry, purpose and unconfigured secrets',()=>{
 const envelope={purpose:'media',ip:'198.51.100.7',at:String(Date.now()),id:randomUUID(),method:'GET',uri:`/api/v1/media/${id}/edge-authorize`,mediaMethod:'HEAD',range:'bytes=0-3',cookie:'access_token=a; refresh_token=b'};
 const headers={...signedEdgeHeaders(secret,envelope),cookie:'refresh_token=b; access_token=a',range:envelope.range},req={headers,method:'GET',originalUrl:envelope.uri};assert.ok(verifyEdgeRequest(req,secret));
 for(const [key,value] of [['cookie','access_token=bad'],['range','bytes=4-7'],['x-crefans-edge-ip','1.1.1.1'],['x-crefans-edge-purpose','origin'],['x-crefans-edge-method','GET'],['x-crefans-edge-signature','0'.repeat(64)]])assert.equal(verifyEdgeRequest({...req,headers:{...headers,[key]:value}},secret),undefined);
 assert.equal(verifyEdgeRequest({...req,originalUrl:envelope.uri+'?x=1'},secret),undefined);assert.equal(verifyEdgeRequest(req,secret,Date.now()+16000),undefined);assert.equal(verifyEdgeRequest(req,''),undefined);assert.throws(()=>authCookie('access_token=a; access_token=b'));
 const guard=new PlatformMediaEdgeGuard(new ConfigService({MEDIA_EDGE_SECRET:secret}));assert.equal(guard.canActivate({switchToHttp:()=>({getRequest:()=>req})}),true);assert.throws(()=>guard.canActivate({switchToHttp:()=>({getRequest:()=>({...req,headers:{}})})}));
});
test('authorization endpoint reuses media restrictions and usage recording without reading storage',async()=>{
 const calls=[],post={is_membership:true},media={id,s3_upload_key:`platform/${id}`,file_size:5,user_sub:'owner',type:'VIDEO',processing_status:'COMPLETED',postings:[{posting:post}]};let allowed=true,consumed=true;
 const service={db:{media:{findUnique:async()=>media},membershipItem:{findFirst:async()=>null}},access:async()=>{calls.push('access');return allowed;},consumeContent:async()=>{calls.push('consume');return consumed;}};
 const controller=new PlatformMediaController(service,new ConfigService(),{read:()=>{throw Error('No bytes may be proxied');}}),req={user:{sub:'fan'},headers:{}};
 assert.deepEqual(await controller.edgeAuthorize(id,req),{delivery:'s3',key:`platform/${id}`});assert.deepEqual(calls,['access','access','consume']);
 for(const range of ['bytes=9-','bytes=4-3','bytes=-0','bytes=0-1,3-4','bytes=-'])await assert.rejects(controller.edgeAuthorize(id,{...req,headers:{range}}),e=>e.getStatus()===416);
 for(const range of ['bytes=0-3','bytes=1-','bytes=-3'])assert.equal((await controller.edgeAuthorize(id,{...req,headers:{range}})).delivery,'s3');
 allowed=false;await assert.rejects(controller.edgeAuthorize(id,req),e=>e.getStatus()===403);allowed=true;consumed=false;await assert.rejects(controller.edgeAuthorize(id,req),e=>e.getStatus()===403);
});
test('only an authenticated edge identity behind the configured proxy replaces the recorded client IP',async()=>{
 const {EventEmitter}=require('node:events'),db={$queryRaw:async()=>[],platformAuditLog:{create:async()=>({})}},service=new PlatformSecurityService(db,new ConfigService({TRUSTED_PROXY_IPS:'10.0.0.2',MEDIA_EDGE_SECRET:secret}),{});
 const envelope={purpose:'origin',ip:'198.51.100.7',at:String(Date.now()),id:randomUUID(),method:'',uri:'',mediaMethod:'',range:'',cookie:''},headers={...signedEdgeHeaders(secret,envelope),'x-crefans-client-ip':'203.0.113.1'};
 for(const [peer,edit,expected] of [['10.0.0.2',{},'198.51.100.7'],['10.0.0.2',{'x-crefans-edge-ip':'1.1.1.1'},'203.0.113.1'],['10.0.0.3',{},'10.0.0.3']]){const req={headers:{...headers,...edit},method:'GET',socket:{remoteAddress:peer},originalUrl:'/api/v1/feed'},res=Object.assign(new EventEmitter(),{setHeader(){}});await service.middleware(req,res,()=>{});assert.equal(req.requestContext.ip,expected);}
});
