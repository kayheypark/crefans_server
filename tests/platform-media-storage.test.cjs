require('reflect-metadata');
const {test}=require('node:test'),assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {mkdtemp,writeFile,readFile,readdir,rm}=require('node:fs/promises'),{tmpdir}=require('node:os'),{join}=require('node:path');
const {ConfigService}=require('@nestjs/config');
const {PlatformMediaStorage,managedMediaKey}=require('../dist/src/platform/media-storage');
const {PlatformMediaController}=require('../dist/src/platform/media.controller');
const {Readable,Writable}=require('node:stream');
const settings={MEDIA_STORAGE:'s3',AWS_REGION:'ap-northeast-2',S3_MEDIA_BUCKET:'test-private-media'};
const config=extra=>new ConfigService({...settings,...extra});
const errorCode=code=>e=>e.getResponse?.().code===code;
test('S3 startup requires only private storage config, with no signing capability',()=>{
 for(const extra of[{S3_MEDIA_BUCKET:''},{AWS_REGION:''}])assert.throws(()=>new PlatformMediaStorage(config(extra)).onModuleInit(),/configuration/);
 const storage=new PlatformMediaStorage(config());storage.onModuleInit();assert.equal(storage.signedUrl,undefined);
 new PlatformMediaStorage(new ConfigService()).onModuleInit();assert.throws(()=>new PlatformMediaStorage(config({MEDIA_STORAGE:'typo'})).onModuleInit(),/Invalid/);
});
test('S3 read is server side, scopes keys, forwards ranges and cancellation, HEAD never downloads the body',async()=>{
 const storage=new PlatformMediaStorage(config()),key=`platform/${randomUUID()}`,commands=[],signal=new AbortController().signal;
 storage.client={send:async(command,options)=>{commands.push([command.constructor.name,command.input,options]);return{ContentLength:5,Body:Readable.from('bytes')};}};
 await storage.read(key,{range:'bytes=0-4',signal});const head=await storage.read(key,{head:true});assert.equal(head.Body,undefined);
 assert.deepEqual(commands.map(c=>c[0]),['GetObjectCommand','HeadObjectCommand']);assert.equal(commands[0][1].Range,'bytes=0-4');assert.equal(commands[0][2].abortSignal,signal);assert.equal(commands[0][1].Bucket,settings.S3_MEDIA_BUCKET);
 for(const invalid of['platform/../private','other/'+randomUUID(),'platform/'+randomUUID()+'?x=1']){assert.equal(managedMediaKey(invalid),false);await assert.rejects(storage.read(invalid));}
});
test('S3 upload streams the normalized file with encryption, immutable object key and no public ACL',async()=>{
 const root=await mkdtemp(join(tmpdir(),'cf-storage-')),path=join(root,'fixture'),id=randomUUID(),storage=new PlatformMediaStorage(config());
 try{await writeFile(path,'video-bytes');let captured;
  storage.client={send:async command=>{captured=command.input;const chunks=[];for await(const b of captured.Body)chunks.push(b);assert.equal(Buffer.concat(chunks).toString(),'video-bytes');},destroy(){}};
  await storage.put(id,path,'video/mp4',11);assert.equal(captured.Key,`platform/${id}`);assert.equal(captured.ServerSideEncryption,'AES256');assert.equal(captured.ContentLength,11);assert.equal(captured.ACL,undefined);assert.equal(captured.ContentType,'video/mp4');assert.equal(captured.CacheControl,'max-age=0, s-maxage=86400');
  storage.client.send=async()=>{throw Error('sensitive provider body')};await assert.rejects(storage.put(id,path,'video/mp4',11),errorCode('STORAGE_UNAVAILABLE'));
 }finally{await rm(root,{recursive:true,force:true});}
});
async function uploadFixture(fail){
 const root=await mkdtemp(join(tmpdir(),'cf-upload-')),file=join(root,'upload'),bytes=await require('sharp')({create:{width:4,height:4,channels:3,background:'#aabbcc'}}).png().toBuffer(),events=[];let row;
 await writeFile(file,bytes);
 const service={db:{creator:{findUnique:async()=>null},media:{create:async({data})=>{row={...data};events.push('row:'+data.processing_status);return row;},update:async({data})=>{events.push('row:'+data.processing_status);Object.assign(row,data);return row;}}}};
 const storage={enabled:true,put:async(id,path,mime)=>{events.push('put');assert.equal(mime,'image/webp');assert.ok((await readFile(path)).length);if(fail)throw Error('S3 failure');},remove:async()=>events.push('remove')};
 const controller=new PlatformMediaController(service,config({MEDIA_ROOT:root}),storage);
 try{let result,error;try{result=await controller.upload({path:file,mimetype:'image/png',size:bytes.length,originalname:'test.png'},{user:{sub:'owner'}});}catch(e){error=e;}
  assert.deepEqual(await readdir(root),[]);return{events,row,result,error};
 }finally{await rm(root,{recursive:true,force:true});}
}
test('new remote upload is not readable before S3 completion and leaves no local media copy',async()=>{
 const {events,row,result,error}=await uploadFixture(false);assert.equal(error,undefined);assert.deepEqual(events,['row:UPLOADING','put','row:COMPLETED']);assert.ok(managedMediaKey(row.s3_upload_key));assert.equal(result.url,`/api/v1/media/${row.id}/file`);
});
test('failed S3 upload leaves a recoverable failed row and cleans local staging and remote object',async()=>{
 const {events,row,error}=await uploadFixture(true);assert.ok(error);assert.deepEqual(events,['row:UPLOADING','put','row:FAILED','remove']);assert.equal(row.is_deleted,true);assert.equal(row.processing_status,'FAILED');
});
function delivery({allowed=true,consumed=true,owner=false,links,range,method='GET',storageError}={}){
 const post={id:'post',user_sub:'owner',is_membership:true,access_plan_id:'plan'},media={id:randomUUID(),file_size:5,user_sub:'owner',type:'VIDEO',mime_type:'video/mp4',processing_status:'COMPLETED',s3_upload_key:`platform/${randomUUID()}`,postings:links||[{posting:post}]},calls=[],chunks=[];
 const response=new Writable({write(chunk,encoding,done){chunks.push(chunk);done();}});response.headers={};response.setHeader=(k,v)=>response.headers[k]=v;response.status=n=>{response.statusCode=n;return response;};response.statusCode=200;
 const service={db:{media:{findUnique:async()=>media},membershipItem:{findFirst:async()=>null}},access:async()=>{calls.push('access');return allowed;},consumeContent:async()=>{calls.push('consume');return owner||consumed;}};
 const storage={read:async(key,options)=>{calls.push('read');assert.equal(key,media.s3_upload_key);if(storageError)throw storageError;return{ContentLength:5,...(range?{ContentRange:'bytes 0-4/5'}:{}),Body:options.head?undefined:Readable.from('bytes')};}};
 return{controller:new PlatformMediaController(service,config(),storage),media,response,calls,chunks,req:{method,headers:{range},user:owner?{sub:'owner'}:{sub:'fan'}}};
}
test('rights and usage recording precede streaming, with no redirect or cacheable response',async()=>{
 const f=delivery();await f.controller.download(f.media.id,f.req,f.response);assert.deepEqual(f.calls,['access','access','consume','read']);assert.equal(f.response.statusCode,200);assert.equal(Buffer.concat(f.chunks).toString(),'bytes');assert.equal(f.response.headers.Location,undefined);assert.equal(f.response.headers['Cache-Control'],'private, no-store');assert.equal(f.response.headers.Vary,'Cookie');assert.equal(f.response.headers['Cross-Origin-Resource-Policy'],'same-origin');
});
test('foreign account, refund race, deleted or incomplete media cannot reach storage',async()=>{
 for(const setting of[{allowed:false},{consumed:false}])for(const req of[{},{method:'HEAD'},{range:'bytes=0-4'}]){const f=delivery({...setting,...req});await assert.rejects(f.controller.download(f.media.id,f.req,f.response),errorCode('MEDIA_ACCESS_DENIED'));assert.equal(f.calls.includes('read'),false);}
 for(const change of[{is_deleted:true},{processing_status:'UPLOADING'},{processing_status:'FAILED'}]){const f=delivery();Object.assign(f.media,change);await assert.rejects(f.controller.download(f.media.id,f.req,f.response),errorCode('MEDIA_NOT_FOUND'));assert.equal(f.calls.includes('read'),false);}
});
test('owner can read unpublished media without a subscription',async()=>{
 const f=delivery({owner:true,links:[]});await f.controller.download(f.media.id,f.req,f.response);assert.deepEqual(f.calls,['read']);
});
test('HEAD and partial responses keep authorization and expected body semantics',async()=>{
 const head=delivery({method:'HEAD'});await head.controller.download(head.media.id,head.req,head.response);assert.equal(head.chunks.length,0);assert.equal(head.response.headers['Content-Length'],5);assert.ok(head.calls.includes('consume'));
 const range=delivery({range:'bytes=0-4'});await range.controller.download(range.media.id,range.req,range.response);assert.equal(range.response.statusCode,206);assert.equal(range.response.headers['Content-Range'],'bytes 0-4/5');assert.equal(Buffer.concat(range.chunks).toString(),'bytes');
});
test('invalid/multiple ranges fail after rights checking, S3 failure never exposes a URL',async()=>{
 for(const range of['bytes=0-1,3-4','bytes=-','bytes=abc','items=0-1']){const f=delivery({range});await f.controller.download(f.media.id,f.req,f.response);assert.equal(f.response.statusCode,416);assert.equal(f.calls.includes('read'),false);assert.equal(f.response.headers['Content-Range'],'bytes */5');}
 const f=delivery({storageError:{$metadata:{httpStatusCode:416}}});await f.controller.download(f.media.id,f.req,f.response);assert.equal(f.response.statusCode,416);
 const bad=delivery({storageError:Error('secret upstream URL')});await assert.rejects(bad.controller.download(bad.media.id,bad.req,bad.response),errorCode('STORAGE_UNAVAILABLE'));assert.equal(bad.response.headers.Location,undefined);
});
