import {request as httpsRequest,Agent} from 'node:https';
import {authCookie,edgeHeader,signedEdgeHeaders,EdgeEnvelope} from './media-edge-protocol';

type Config={secret:string;authHost:string;mediaOnly?:boolean};
const idPattern='[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const mediaPath=new RegExp(`^/api/v1/media/(${idPattern})/file$`);
const objectPath=new RegExp(`^platform/${idPattern}$`);
const agent=new Agent({keepAlive:true,maxSockets:32});
export async function callMediaAuthorization(host:string,path:string,headers:Record<string,string>){
 return new Promise<{status:number;body:any}>((resolve,reject)=>{
  const req=httpsRequest({hostname:host,path,method:'GET',headers,agent,timeout:2500},res=>{let bytes=0;const chunks:Buffer[]=[];res.on('data',(chunk:Buffer)=>{bytes+=chunk.length;if(bytes>8192){req.destroy(new Error('Authorization response too large'));return;}chunks.push(chunk);});res.on('error',reject);res.on('end',()=>{try{resolve({status:res.statusCode||503,body:JSON.parse(Buffer.concat(chunks).toString())});}catch{reject(new Error('Invalid authorization response'));}});});
  const deadline=setTimeout(()=>req.destroy(new Error('Authorization timeout')),3000);req.on('timeout',()=>req.destroy(new Error('Authorization timeout')));req.on('error',reject);req.on('close',()=>clearTimeout(deadline));req.end();
 });
}
function protection(headers:any){
 for(const [key,value]of Object.entries({'cache-control':'private, no-store','vary':'Cookie','referrer-policy':'no-referrer','cross-origin-resource-policy':'same-origin','x-content-type-options':'nosniff'}))headers[key]=[{key,value}];
 delete headers['set-cookie'];return headers;
}
function denied(status:number,code='MEDIA_ACCESS_DENIED'){
 return{status:String(status),headers:protection({'content-type':[{key:'Content-Type',value:'application/json; charset=utf-8'}]}),body:JSON.stringify({success:false,data:null,errorMessage:status===503?'미디어 권한을 확인하지 못했습니다.':'파일 이용 권한이 없습니다.',errorCode:code})};
}
/** Shared by viewer-request and viewer-response. Never logs cookies or provider payloads. */
export function createMediaEdgeHandler(config:Config,authorize=callMediaAuthorization){
 if(!/^[a-f0-9]{64}$/.test(config.secret)||!/^[-a-z0-9.]+$/.test(config.authHost)||!config.authHost.endsWith('.crefans.com'))throw new Error('Invalid edge configuration');
 return async(event:any)=>{
  const cf=event.Records[0].cf,req=cf.request;
  if(cf.config.eventType==='viewer-response'){cf.response.headers=protection(cf.response.headers);return cf.response;}
  const header=(name:string)=>(req.headers[name]||[]).map((h:any)=>h.value).join(name==='cookie'?'; ':',');
  // All incoming edge identity headers are replaced; only signed identities reach the origin.
  for(const name of Object.keys(req.headers))if(name.startsWith(edgeHeader))delete req.headers[name];
  const base:EdgeEnvelope={purpose:'origin',ip:req.clientIp,at:String(Date.now()),id:cf.config.requestId,method:'',uri:'',mediaMethod:'',range:'',cookie:''};
  if(cf.config.eventType!=='viewer-request')return denied(503);
  const match=mediaPath.exec(req.uri);
  if(!match){
   // A media behavior must never route a malformed media path to its S3 origin.
   if(config.mediaOnly||req.uri.startsWith('/api/v1/media/')&&req.uri.endsWith('/file'))return denied(403);
   for(const [key,value]of Object.entries(signedEdgeHeaders(config.secret,base)))req.headers[key]=[{key,value}];
   return req;
  }
  // Existing MediaVideo retries change only this counter, never the authorization or object key.
  if(!['GET','HEAD'].includes(req.method)||req.querystring&&!/^media_retry=[1-9]\d{0,8}$/.test(req.querystring))return denied(403);
  const range=header('range');if(range&&!/^bytes=(?:\d{1,16}-\d{0,16}|-\d{1,16})$/.test(range))return denied(416,'INVALID_RANGE');
  let cookie:string;try{cookie=authCookie(header('cookie'));}catch{return denied(403);}
  const path=`/api/v1/media/${match[1]}/edge-authorize`;
  const envelope:EdgeEnvelope={...base,purpose:'media',method:'GET',uri:path,mediaMethod:req.method,range,cookie};
  try{
   const result=await authorize(config.authHost,path,{...signedEdgeHeaders(config.secret,envelope),...(cookie?{cookie}:{}),...(range?{range}:{}),'accept':'application/json'});
   if(result.status!==200||result.body?.success!==true)return denied([401,403,404,416].includes(result.status)?result.status:503,result.body?.errorCode==='SESSION_EXPIRED'?'SESSION_EXPIRED':undefined);
   const data=result.body.data;
   if(data?.delivery==='api')return{status:'307',headers:protection({location:[{key:'Location',value:`/api/v1/media/${match[1]}/origin-file`}]}),body:''};
   if(data?.delivery!=='s3'||!objectPath.test(data.key)||data.key!==`platform/${match[1]}`)return denied(503);
   req.uri='/'+data.key;req.querystring='';
   // The immutable object is shared in CDN cache only AFTER live authorization. No cookies reach S3.
   const headers:any={host:req.headers.host};for(const name of ['range','if-range','if-none-match','if-modified-since'])if(req.headers[name])headers[name]=req.headers[name];req.headers=headers;
   return req;
  }catch{return denied(503,'MEDIA_AUTH_UNAVAILABLE');}
 };
}
