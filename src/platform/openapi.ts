import type {INestApplication} from '@nestjs/common';
import {GUARDS_METADATA} from '@nestjs/common/constants';
import {ExecutionContextHost} from '@nestjs/core/helpers/execution-context-host';
import {DocumentBuilder,SwaggerModule} from '@nestjs/swagger';
import type {OpenAPIObject,OperationObject,SchemaObject} from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import {PlatformModule} from './module';
import {PlatformAuthGuard,PlatformOptionalAuthGuard,PlatformMediaEdgeGuard} from './platform-auth.guard';
import {PlatformAdminGuard} from './admin.controller';
import {PlatformExceptionFilter} from './http';
import {PlatformOperationsService} from './operations.service';
import {endpoints,object,ref,schemas,str} from './openapi-contract';

export const API_DOCS_PATH='/api/v1/admin/docs';
export const API_DOCS_PAGES={user:API_DOCS_PATH+'/user',studio:API_DOCS_PATH+'/studio',console:API_DOCS_PATH+'/console'} as const;
const envelope=(data:any):SchemaObject=>object({success:{type:'boolean',enum:[true]},data,errorMessage:{nullable:true,enum:[null]},errorCode:{nullable:true,enum:[null]}},['success','data','errorMessage','errorCode']);
const authNames=(controller:any,method:string)=>[...(Reflect.getMetadata(GUARDS_METADATA,controller)||[]),...(Reflect.getMetadata(GUARDS_METADATA,controller.prototype[method])||[])];

export function buildPlatformOpenApi(app:INestApplication):OpenAPIObject{
 const builder=new DocumentBuilder().setTitle('CREFANS Platform API').setVersion('v1')
  .setDescription('운영 중인 /api/v1 API 계약. 관리자 전용 문서이며 UI에서 요청 실행은 비활성화되어 있습니다. 인증은 HttpOnly 쿠키를 사용합니다. 쿠키가 포함된 변경 요청은 허용된 Origin이 필요합니다. POST 기본 성공 상태는 201, GET/PUT은 200입니다. 미디어 파일은 JSON 응답 예외이며 GET 조회도 유료 콘텐츠 이용 기록을 남길 수 있습니다. 문서 열람이 PG/PASS/은행 실연동을 보장하지 않습니다.')
  .addServer('/').addCookieAuth('access_token',{type:'apiKey',in:'cookie'},'memberSession')
  .addCookieAuth('refresh_token',{type:'apiKey',in:'cookie'},'refreshSession')
  .addCookieAuth('admin_access_token',{type:'apiKey',in:'cookie',description:'운영 콘솔 전용 세션. 회원 세션과 분리'},'adminSession')
  .addApiKey({type:'apiKey',in:'header',name:'x-pass-signature',description:'서버 브리지 HMAC-SHA256; 비밀키 직접 입력 금지'},'passSignature')
  .addApiKey({type:'apiKey',in:'header',name:'x-crefans-edge-signature',description:'내부 엣지 HMAC와 관련 헤더가 모두 필요'},'edgeSignature');
 const document=SwaggerModule.createDocument(app,builder.build(),{include:[PlatformModule],deepScanRoutes:false});
 const controllers:any[]=Reflect.getMetadata('controllers',PlatformModule)||[];
 const handlers=new Map<string,any>();
 for(const controller of controllers)for(const name of Object.getOwnPropertyNames(controller.prototype))handlers.set(controller.name+'_'+name,{controller,name});
 const seen=new Set<string>();
 for(const [path,item]of Object.entries(document.paths))for(const [method,value]of Object.entries(item)){
  if(!['get','post','put','patch','delete','head','options'].includes(method))continue;
  const op=value as OperationObject,key=method+' '+path,contract=endpoints[key],handler=handlers.get(op.operationId);
  if(!contract||!handler)throw new Error('Missing OpenAPI contract: '+key);
  seen.add(key);const guards=authNames(handler.controller,handler.name),admin=guards.includes(PlatformAdminGuard),member=guards.includes(PlatformAuthGuard),optional=guards.includes(PlatformOptionalAuthGuard),edge=guards.includes(PlatformMediaEdgeGuard);
  op.summary=contract.summary;op.tags=[contract.tag];op.description=[contract.description,admin?'활성 운영자 계정 필수. 역할별 추가 제한은 각 API 설명을 따릅니다.':member?'로그인한 회원 세션 필수.':optional?'비로그인 조회 가능하나 콘텐츠별 권한 제한을 검사합니다. 유효하지 않은 갱신 세션은 401을 반환할 수 있습니다.':'공개 또는 요청별 증명 검증 API.'].filter(Boolean).join('\n\n');
  op.deprecated=contract.deprecated;
  op.security=edge?[{edgeSignature:[],memberSession:[]},{edgeSignature:[]}]:path==='/api/v1/identity/callback'?[{passSignature:[]}]:path==='/api/v1/auth/refresh'?[{refreshSession:[]}]:admin?[{adminSession:[]}]:member?[{memberSession:[]}]:optional?[{}, {memberSession:[]}]:[];
  op.parameters=[...(op.parameters||[]).filter((p:any)=>p.in==='path').map((p:any)=>({...p,required:true,schema:str(p.name==='id'&&path==='/api/v1/profiles/{id}'?'회원 UUID 또는 핸들':undefined)})),...(contract.query||[])];
  if(contract.body)op.requestBody={required:true,content:{[contract.contentType||'application/json']:{schema:contract.body}}};else delete op.requestBody;
  const success=String(contract.successStatus||(method==='post'?201:200));
  op.responses={[success]:{description:'성공',content:{'application/json':{schema:envelope(contract.response)}}}};
  if(path==='/api/v1/marketing/unsubscribe')op.responses[success]={description:method==='get'?'수신거부 확인 HTML. 상태 변경 없음.':'수신거부 처리. Accept: text/html이면 완료 화면.',content:{...(method==='post'?{'application/json':{schema:envelope(contract.response)}}:{}),'text/html':{schema:{type:'string'}}}};
  for(const [status,description]of Object.entries({400:'입력값 또는 상태 오류',401:'로그인 또는 세션 갱신 필요',403:'권한·Origin·본인확인 실패',404:'대상 없음',409:'중복·버전·처리 상태 충돌',429:'요청 제한',500:'서버 내부 오류',502:'외부 공급사 응답 검증 실패',503:'정책/공급사 준비 또는 일시적 처리 불가'}))op.responses[status]={description,content:{'application/json':{schema:ref('Error')}}};
  if(path==='/api/v1/auth/identity')delete op.responses[success];
  if(path==='/api/v1/admin/auth/login'||path==='/api/v1/admin/auth/refresh')op.responses[success]['headers']={'Set-Cookie':{schema:str(),description:'HttpOnly·SameSite=Strict admin_access_token(1시간)·admin_refresh_token(7일) 쿠키, 콘솔 도메인 전용. 운영에서는 Secure.'}};
  if(path==='/api/v1/auth/login'||path==='/api/v1/auth/refresh')op.responses[success]['headers']={'Set-Cookie':{schema:str(),description:'HttpOnly access_token 및 refresh_token 쿠키. 운영에서는 Secure.'}};
  if(path==='/api/v1/media')op.responses['413']={description:'파일 용량 제한 초과',content:{'application/json':{schema:ref('Error')}}};
  if(['/api/v1/media/{id}/file','/api/v1/media/{id}/origin-file'].includes(path)){
   op.parameters.push({name:'Range',in:'header',schema:{type:'string',example:'bytes=0-1023'},description:'단일 바이트 범위. HEAD도 지원.'});
   for(const status of ['200','206'])op.responses[status]={description:status==='200'?'전체 파일. HEAD는 본문 없음.':'부분 파일',headers:{'Accept-Ranges':{schema:str()},'Content-Length':{schema:{type:'integer'}},'Content-Range':{schema:str()}},content:{'application/octet-stream':{schema:{type:'string',format:'binary'}}}};
   op.responses['416']={description:'지원하지 않는 범위. 스트리밍 경로에서는 Content-Range와 빈 본문을 반환할 수 있습니다.'};
  }
  if(edge)for(const name of ['purpose','ip','at','id','method'])op.parameters.push({name:'x-crefans-edge-'+name,in:'header',required:true,schema:str()});
 }
 for(const key of Object.keys(endpoints))if(!seen.has(key))throw new Error('OpenAPI contract without controller: '+key);
 document.components.schemas={...document.components.schemas,...schemas};
 document.tags=[...new Set(Object.values(endpoints).map(e=>e.tag))].map(name=>({name}));
 return document;
}

export function splitPlatformOpenApi(document:OpenAPIObject):Record<keyof typeof API_DOCS_PAGES,OpenAPIObject>{
 const sharedAuth=new Set(['/api/v1/auth/login','/api/v1/auth/logout','/api/v1/auth/refresh']);
 // Shared calls used by StudioRouter/useStudioModel and their session, identity and media adapters.
 const studioShared=new Set([...sharedAuth,'/api/v1/session','/api/v1/bootstrap','/api/v1/common','/api/v1/identity/start','/api/v1/identity/status','/api/v1/media','/api/v1/media/{id}/file','/api/v1/media/{id}/origin-file','/api/v1/members/{id}/messages','/api/v1/members/{id}/messages/read','/api/v1/members/{id}/block','/api/v1/reports','/api/v1/telemetry/browser-errors']);
 const labels={user:'유저',studio:'크리에이터 스튜디오',console:'관리자 콘솔'};
 const descriptions={user:'팬 서비스와 공통 인증·결제·미디어·연동 API. 스튜디오 전용 API는 크리에이터 스튜디오 문서에서 확인합니다.',studio:'크리에이터 콘텐츠·멤버십·구독자·통계·수익·정산·출금 API. 화면 초기화·인증·출금 본인확인·미디어·소통·오류 보고의 공통 API도 포함합니다.',console:'운영자 API와 콘솔에서 사용하는 공통 로그인·세션 갱신·로그아웃 API.'};
 const links=(Object.keys(API_DOCS_PAGES) as (keyof typeof API_DOCS_PAGES)[]).map(key=>`[${labels[key]}](${API_DOCS_PAGES[key]})`).join(' | ');
 const create=(audience:keyof typeof API_DOCS_PAGES):OpenAPIObject=>{
  const paths=Object.fromEntries(Object.entries(document.paths).filter(([path])=>audience==='user'?!path.startsWith('/api/v1/admin/')&&!path.startsWith('/api/v1/studio/'):audience==='studio'?path.startsWith('/api/v1/studio/')||studioShared.has(path):path.startsWith('/api/v1/admin/')||sharedAuth.has(path)));
  const selectedSchemas:NonNullable<OpenAPIObject['components']>['schemas']={},securityNames=new Set<string>(),tags=new Set<string>();
  // Keep each page's models isolated as well as its operations, following nested schema refs.
  const visit=(value:any)=>{if(!value||typeof value!=='object')return;const name=value.$ref?.startsWith('#/components/schemas/')?value.$ref.slice('#/components/schemas/'.length):undefined;if(name&&!selectedSchemas[name]){selectedSchemas[name]=document.components.schemas[name];visit(selectedSchemas[name]);}for(const child of Object.values(value))visit(child);};
  visit(paths);
  for(const item of Object.values(paths))for(const op of Object.values(item) as OperationObject[]){for(const tag of op.tags||[])tags.add(tag);for(const security of op.security||[])for(const name of Object.keys(security))securityNames.add(name);}
  return{...document,info:{...document.info,title:`CREFANS ${labels[audience]} API`,description:`문서 전환: ${links}\n\n${descriptions[audience]}\n\n${document.info.description}`},paths,tags:document.tags.filter(tag=>tags.has(tag.name)),components:{schemas:selectedSchemas,securitySchemes:Object.fromEntries(Object.entries(document.components.securitySchemes).filter(([name])=>securityNames.has(name)))}};
 };
 return{user:create('user'),studio:create('studio'),console:create('console')};
}

export function installPlatformOpenApi(app:INestApplication){
 const documents=splitPlatformOpenApi(buildPlatformOpenApi(app)),adminGuard=app.get(PlatformAdminGuard),filter=new PlatformExceptionFilter(app.get(PlatformOperationsService));
 // Swagger registers Express routes outside Nest guards: protect HTML, assets and BOTH raw formats first.
 app.use(API_DOCS_PATH,async(req:any,res:any,next:any)=>{
  res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Robots-Tag','noindex, nofollow, noarchive');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY');res.vary('Cookie');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'none'");
  const context=new ExecutionContextHost([req,res]);
  try{await adminGuard.canActivate(context);next();}catch(error){filter.catch(error,context);}
 });
 // The base URL is only an entry redirect; it does not serve a combined document.
 app.getHttpAdapter().get(API_DOCS_PATH,(_req:any,res:any)=>res.redirect(302,API_DOCS_PAGES.user));
 for(const audience of ['user','studio','console'] as const){const path=API_DOCS_PAGES[audience],document=documents[audience];
  SwaggerModule.setup(path,app,document,{jsonDocumentUrl:path+'/openapi.json',yamlDocumentUrl:path+'/openapi.yaml',customSiteTitle:document.info.title,swaggerOptions:{url:path+'/openapi.json',validatorUrl:null,persistAuthorization:false,supportedSubmitMethods:[],tryItOutEnabled:false,filter:true,docExpansion:'none',displayOperationId:true},customCss:'.swagger-ui .topbar {display:none}'});
 }
 return documents;
}
