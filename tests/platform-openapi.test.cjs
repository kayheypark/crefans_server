require('reflect-metadata');
const ADMIN_TOKEN='aa.'+'a'.repeat(43),DISABLED_TOKEN='aa.'+'d'.repeat(43);
const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const {randomBytes}=require('node:crypto');
// This suite never loads .env, connects to a DB, sends mail or calls payment providers.
process.env.CREFANS_E2E='true';process.env.AUTH_PROVIDER='local';
process.env.LOCAL_AUTH_SECRET=randomBytes(64).toString('hex');
process.env.DATABASE_URL='mysql://unused:unused@127.0.0.1:1/openapi_no_connection';
process.env.TELEGRAM_OPERATIONS_BOT_TOKEN='';process.env.TELEGRAM_OPERATIONS_CHAT_ID='';
const {NestFactory}=require('@nestjs/core');
const {ROUTE_ARGS_METADATA,PATH_METADATA,METHOD_METADATA}=require('@nestjs/common/constants');
const Parser=require('@apidevtools/swagger-parser');
const {PlatformModule}=require('../dist/src/platform/module');
const {PrismaService}=require('../dist/src/prisma/prisma.service');
const {LocalMemberService}=require('../dist/src/auth/local/local-member.service');
const {PlatformOperationsService}=require('../dist/src/platform/operations.service');
const {PlatformService}=require('../dist/src/platform/service');
const {PlatformFinanceService}=require('../dist/src/platform/finance.service');
const {billingMethodView}=require('../dist/src/platform/billing-failures');
const {API_DOCS_PATH,API_DOCS_PAGES,buildPlatformOpenApi,installPlatformOpenApi}=require('../dist/src/platform/openapi');
const {endpoints}=require('../dist/src/platform/openapi-contract');
const {cookieParser}=require('../dist/src/platform/middleware');
const {PlatformExceptionFilter,EnvelopeInterceptor}=require('../dist/src/platform/http');
let app,base,document,documents,denyAdmin=false;
before(async()=>{
 app=await NestFactory.create(PlatformModule,{logger:false});
 const db=app.get(PrismaService),members=app.get(LocalMemberService);
 app.get(PlatformOperationsService).error=async()=>{};
 db.onModuleInit=async()=>{};db.onModuleDestroy=async()=>{};members.onModuleInit=async()=>{};
 members.validateToken=async token=>{if(!['admin','member','disabled-admin'].includes(token))throw Error('invalid test session');return{sub:token};};
 // Console docs use the separate operator session (admin_sessions), never a member session.
 const {digest}=require('../dist/src/auth/local/credentials'),future=new Date(Date.now()+3600000),operatorSessions={[digest(ADMIN_TOKEN)]:true,[digest(DISABLED_TOKEN)]:false};
 db.adminSession.findUnique=async({where})=>{if(denyAdmin)throw Error('private-db-failure');const active=operatorSessions[where.access_hash];return active===undefined?null:{access_until:future,expires_at:future,admin:{id:1,user_sub:'admin',name:'Test operator',role:'ADMIN',is_active:active,must_change_password:false}};};
 app.use(cookieParser());app.setGlobalPrefix('api/v1');
 app.useGlobalInterceptors(new EnvelopeInterceptor());app.useGlobalFilters(new PlatformExceptionFilter());
 document=buildPlatformOpenApi(app);documents=installPlatformOpenApi(app);await app.listen(0,'127.0.0.1');base=await app.getUrl();
});
after(async()=>{await app?.close();});
const request=(path,cookie)=>fetch(base+path,{headers:cookie?{cookie}:{},redirect:'manual'});
test('OpenAPI 3 validates, has all 172 runtime operations and no legacy controllers',async()=>{
 await Parser.validate(structuredClone(document));
 const operations=Object.entries(document.paths).flatMap(([path,item])=>Object.keys(item).filter(method=>['get','post','put','patch','delete','head','options'].includes(method)).map(method=>method+' '+path));
 assert.equal(operations.length,172);assert.deepEqual(operations.sort(),Object.keys(endpoints).sort());// 171: +4 manual payout routes, +1 GET categories (2026-10-31)
 assert.ok(operations.every(key=>key.includes(' /api/v1/')));assert.equal(document.info.version,'v1');
 assert.equal(document.components.securitySchemes.memberSession.name,'access_token');
 assert.equal(document.paths['/api/v1/admin/me'].get.security[0].adminSession.length,0);assert.equal(document.paths['/api/v1/admin/me'].get.security[0].memberSession,undefined,'console uses the operator session only');assert.equal(document.components.securitySchemes.adminSession.name,'admin_access_token');
});
test('named Body/Query parameters from every controller are documented',()=>{
 const controllers=Reflect.getMetadata('controllers',PlatformModule);
 for(const c of controllers)for(const method of Object.getOwnPropertyNames(c.prototype)){
  const handler=c.prototype[method];if(typeof handler!=='function'||Reflect.getMetadata(METHOD_METADATA,handler)===undefined)continue;
  const path='/api/v1/'+[Reflect.getMetadata(PATH_METADATA,c),Reflect.getMetadata(PATH_METADATA,handler)].filter(x=>x&&x!=='/').join('/').replace(/:([^/]+)/g,'{$1}');
  const op=Object.values(document.paths[path]).find(o=>o.operationId===c.name+'_'+method);
  assert.ok(op,path);const metadata=Reflect.getMetadata(ROUTE_ARGS_METADATA,c,method)||{};
  for(const [key,param]of Object.entries(metadata)){
   if(typeof param.data!=='string')continue;
   if(key.startsWith('3:'))assert.ok(op.requestBody?.content['application/json'].schema.properties[param.data],path+' body '+param.data);
   if(key.startsWith('4:'))assert.ok(op.parameters.some(p=>p.in==='query'&&p.name===param.data),path+' query '+param.data);
  }
 }
});
test('missing and stale contracts fail generation, with restored positive control',()=>{
 const key='get /api/v1/health',saved=endpoints[key];
 try{delete endpoints[key];assert.throws(()=>buildPlatformOpenApi(app),/Missing OpenAPI contract/);}finally{endpoints[key]=saved;}
 try{endpoints['get /api/v1/stale-doc']=saved;assert.throws(()=>buildPlatformOpenApi(app),/without controller/);}finally{delete endpoints['get /api/v1/stale-doc'];}
 assert.ok(buildPlatformOpenApi(app).paths['/api/v1/health']);
});
test('HTML, JSON, YAML, assets, trailing slash and encoded path require login',async()=>{
 for(const path of Object.values(API_DOCS_PAGES))for(const suffix of ['', '/', '/openapi.json','/openapi.yaml','/swagger-ui-init.js','/swagger-ui-bundle.js','/swagger-ui.css']){
  const response=await request(path+suffix);assert.equal(response.status,401,suffix);
  assert.equal((await response.json()).errorCode,'UNAUTHORIZED');assert.match(response.headers.get('cache-control'),/no-store/);
 }
 for(const path of Object.values(API_DOCS_PAGES))for(const cookie of ['access_token=expired','refresh_token=admin','access_token=member','admin_access_token=expired'])assert.equal((await request(path+'/openapi.json',cookie)).status,401);
 for(const audience of ['user','studio','console'])for(const path of ['/api/v1/admin/%64ocs/'+audience+'/openapi.json','/api/v1/admin/docs%2f'+audience+'/openapi.json'])assert.notEqual((await request(path)).status,200);
});
test('regular members and inactive operators cannot read or load docs',async()=>{
 for(const path of Object.values(API_DOCS_PAGES))for(const cookie of ['access_token=member','admin_access_token='+DISABLED_TOKEN])for(const suffix of ['', '/openapi.json','/openapi.yaml','/swagger-ui-bundle.js']){
  const response=await request(path+suffix,cookie);assert.equal(response.status,401);assert.equal((await response.json()).errorCode,'UNAUTHORIZED');
 }
});
test('active administrator can load local assets and both export formats; unsafe UI actions disabled',async()=>{
 for(const [audience,path]of Object.entries(API_DOCS_PAGES))for(const suffix of ['', '/openapi.json','/openapi.yaml','/swagger-ui.css','/swagger-ui-bundle.js','/swagger-ui-init.js']){
  const response=await request(path+suffix,'admin_access_token='+ADMIN_TOKEN);assert.equal(response.status,200,suffix);
  assert.match(response.headers.get('x-robots-tag'),/noindex/);assert.equal(response.headers.get('x-frame-options'),'DENY');assert.match(response.headers.get('content-security-policy'),/connect-src 'self'/);
  const content=await response.text();
  if(suffix==='')assert.ok(content.includes(documents[audience].info.title));
  if(suffix==='/openapi.json')assert.deepEqual(JSON.parse(content),JSON.parse(JSON.stringify(documents[audience])));
  if(suffix==='/openapi.yaml')assert.match(content,/openapi: 3\.0\.0/);
  if(suffix==='/swagger-ui-init.js'){assert.match(content,/"supportedSubmitMethods": \[\]/);assert.match(content,/"validatorUrl": null/);assert.match(content,/"persistAuthorization": false/);}
 }
 for(const path of ['/api/v1/admin/docs/openapi.json','/api/v1/admin/docs/openapi.yaml','/api/v1/admin/docs-json','/api/v1/admin/docs-yaml','/api-json','/api-yaml','/api/docs'])assert.equal((await request(path,'admin_access_token='+ADMIN_TOKEN)).status,404);
});
test('guard backend failure is closed and never exposes internal exception',async()=>{
 denyAdmin=true;
 try{for(const path of Object.values(API_DOCS_PAGES)){const response=await request(path+'/openapi.json','admin_access_token='+ADMIN_TOKEN);assert.equal(response.status,500);assert.doesNotMatch(await response.text(),/private-db-failure|openapi/);}}finally{denyAdmin=false;}
});
test('documented serializers use the current response field names',async()=>{
 const schema=document.components.schemas;
 const check=(name,value)=>assert.deepEqual(Object.keys(schema[name].properties).sort(),Object.keys(value).sort(),name);
 const finance=new PlatformFinanceService({}, {}, {}, {});
 check('Order',finance.orderView({id:'example',membership_id:'plan',amount:100,status:'pending',snapshot:{},expires_at:new Date()}));
 check('Account',finance.accountView({}));check('Withdrawal',finance.withdrawalView({created_at:new Date()}));check('BillingMethod',billingMethodView({}));
 const service=new PlatformService({$queryRaw:async()=>[{count:0n}],creator:{findUnique:async()=>({comments_enabled:true})}});service.consumeContent=async()=>true;
 const post=await service.post({id:'example',user_sub:'creator',medias:[],created_at:new Date()});check('Post',post);
 assert.equal(document.paths['/api/v1/studio/content'].post.requestBody.content['application/json'].schema.properties.body.maxLength,10000);
 assert.equal(document.paths['/api/v1/me/inquiries'].post.requestBody.content['application/json'].schema.properties.title.maxLength,80);
});
test('media is documented as binary, JSON APIs have common envelope, key material has no real examples',()=>{
 for(const [path,methods]of Object.entries(document.paths))for(const [method,op]of Object.entries(methods)){
  const success=op.responses[path==='/api/v1/beans/webhook'?'200':method==='post'?'201':'200'];if(!success)continue;
  if(path.endsWith('/file')||path.endsWith('/origin-file')){assert.equal(success.content['application/octet-stream'].schema.format,'binary');assert.ok(op.responses['206']);}
  else if(path==='/api/v1/marketing/unsubscribe'&&method==='get')assert.equal(success.content['text/html'].schema.type,'string');
  else assert.deepEqual(success.content['application/json'].schema.required,['success','data','errorMessage','errorCode']);
 }
 assert.doesNotMatch(JSON.stringify(document),/test_sk_|live_sk_|BEGIN PRIVATE KEY|smtp\.gmail|@gmail\.com/);
});

test('three valid documents isolate business APIs, retain required shared calls and cover all operations',async()=>{
 const operations=doc=>Object.entries(doc.paths).flatMap(([path,item])=>Object.keys(item).map(method=>method+' '+path));
 const user=operations(documents.user),studio=operations(documents.studio),console=operations(documents.console);
 assert.equal(user.length,73);assert.equal(studio.length,45);assert.equal(console.length,73);
 assert.deepEqual([...new Set([...user,...studio,...console])].sort(),operations(document).sort());
 const auth=['post /api/v1/auth/login','post /api/v1/auth/logout','post /api/v1/auth/refresh'];
 assert.deepEqual(user.filter(key=>console.includes(key)).sort(),auth);
 assert.deepEqual(studio.filter(key=>console.includes(key)).sort(),auth);
 assert.deepEqual(user.filter(key=>studio.includes(key)).sort(),[...auth,'get /api/v1/session','get /api/v1/bootstrap','get /api/v1/common','post /api/v1/identity/start','post /api/v1/identity/status','post /api/v1/media','get /api/v1/media/{id}/file','get /api/v1/media/{id}/origin-file','post /api/v1/members/{id}/messages','put /api/v1/members/{id}/messages/read','put /api/v1/members/{id}/block','post /api/v1/reports','post /api/v1/telemetry/browser-errors'].sort());
 assert.ok(user.every(key=>!key.includes('/api/v1/admin/')&&!key.includes('/api/v1/studio/')));
 assert.ok(studio.every(key=>!key.includes('/api/v1/admin/')));
 for(const path of Object.keys(document.paths).filter(path=>path.startsWith('/api/v1/studio/')))assert.ok(documents.studio.paths[path],path);
 assert.ok(!documents.studio.paths['/api/v1/checkout']);assert.ok(!documents.studio.paths['/api/v1/billing/methods']);
 assert.ok(!documents.console.paths['/api/v1/studio/overview']);assert.ok(!documents.console.paths['/api/v1/checkout']);
 assert.ok(!documents.user.components.schemas.AuditEvent);assert.ok(!documents.studio.components.schemas.AuditEvent);assert.ok(!documents.console.components.schemas.Post);
 assert.ok(!documents.user.components.schemas.Finance);assert.ok(documents.studio.components.schemas.Finance);
 assert.ok(!documents.console.components.securitySchemes.passSignature);assert.ok(documents.user.components.securitySchemes.passSignature);
 assert.deepEqual(Object.keys(documents),['user','studio','console']);
 for(const doc of Object.values(documents))await Parser.validate(structuredClone(doc));
});
test('entry redirects to user page, all three pages link to each other and HEAD stays protected',async()=>{
 const entry=await request(API_DOCS_PATH,'admin_access_token='+ADMIN_TOKEN);assert.equal(entry.status,302);assert.equal(entry.headers.get('location'),API_DOCS_PAGES.user);
 assert.equal((await request(API_DOCS_PATH)).status,401);
 for(const [audience,path]of Object.entries(API_DOCS_PAGES)){
  for(const link of Object.values(API_DOCS_PAGES))assert.ok(documents[audience].info.description.includes(link));
  const response=await fetch(base+path+'/openapi.json',{method:'HEAD'});assert.equal(response.status,401);
  const init=await request(path+'/swagger-ui-init.js','admin_access_token='+ADMIN_TOKEN);assert.ok((await init.text()).includes(documents[audience].info.title));
 }
});
