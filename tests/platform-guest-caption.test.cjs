// 2026-11-16 user decisions: guest trial post title/body written by AI at publish time (item names + request text only), and
// every AI photo failure sent to Telegram through the operations alert queue without IP, prompt, photo or member id.
const test=require('node:test');
const assert=require('node:assert/strict');
const {GuestCaptionService,captionInput,fallbackCaption,parseCaption,CAPTION_LIMITS}=require('../dist/src/platform/guest-caption');
const {AiPhotoService}=require('../dist/src/platform/ai-photo');
const {PlatformOperationsService,operationsAlertText}=require('../dist/src/platform/operations.service');
const {requestContext}=require('../dist/src/platform/request-context');

const config=values=>({get:key=>values[key]});
const limiter=(fail=false)=>({calls:[],async limit(key,max,seconds){this.calls.push([key,max,seconds]);if(fail){const e=new Error('limit');e.getStatus=()=>429;throw e;}}});
function provider({flagIn=false,flagOut=false,status=200,text='{"title":"오늘은 마법사로 변신","body":"판타지 마법사 의상으로 AI 사진을 만들어 봤어요 ✨"}'}={}){
 const calls=[];let moderation=0;
 const fetcher=async(url,init)=>{const body=JSON.parse(init.body);calls.push({url,body,headers:init.headers});
  if(url.endsWith('/moderations')){moderation++;const flagged=moderation===1&&body.input.includes('요청 문장')?flagIn:flagOut;return{ok:true,json:async()=>({results:[{flagged}]})};}
  return{ok:status===200,json:async()=>({output:[{type:'message',content:[{type:'output_text',text}]}]})};};
 return{fetcher,calls};
}
const service=(p,{key='sk-test',fail=false}={})=>{const s=new GuestCaptionService(config({AI_PHOTO_OPENAI_API_KEY:key,GUIDE_ADVISOR_MODEL:'gpt-6-luna'}),limiter(fail));s.fetcher=p.fetcher;return s;};

test('input keeps only short item names and request text: control characters, duplicates and extras are dropped',()=>{
 const items=Array.from({length:20},(_,i)=>`항목${i}`);
 const out=captionInput({items:['판타지 마법사','판타지 마법사',' 벚꽃\n한복 ','x'.repeat(80),...items],prompt:'a'.repeat(500),photo:'data:image/png;base64,AAAA',ip:'1.2.3.4'});
 assert.equal(out.items.length,CAPTION_LIMITS.items);assert.deepEqual(out.items.slice(0,2),['판타지 마법사','벚꽃 한복']);assert.equal(out.items[2].length,CAPTION_LIMITS.itemLength);
 assert.equal(out.prompt.length,CAPTION_LIMITS.promptLength);assert.deepEqual(Object.keys(out).sort(),['items','prompt']);
 assert.throws(()=>captionInput({items:'판타지'}),e=>e.getResponse?.().code==='INVALID_CAPTION_INPUT');
});

test('AI caption: moderated request goes to the Responses API with store:false and no identifier; result is trimmed and moderated',async()=>{
 const p=provider(),s=service(p);
 const out=await s.caption('guest:abc',{items:['판타지 마법사','스튜디오 배경'],prompt:'신비로운 분위기로'});
 assert.deepEqual(out,{title:'오늘은 마법사로 변신',body:'판타지 마법사 의상으로 AI 사진을 만들어 봤어요 ✨',source:'ai'});
 const generation=p.calls.find(c=>c.url.endsWith('/responses'));assert.equal(generation.body.model,'gpt-6-luna');assert.equal(generation.body.store,false);
 assert.equal(generation.body.safety_identifier,undefined);assert.match(generation.body.input,/판타지 마법사, 스튜디오 배경/);assert.match(generation.body.input,/신비로운 분위기로/);
 assert.deepEqual(p.calls.map(c=>c.url.split('/').pop()),['moderations','responses','moderations']);
 assert.doesNotMatch(JSON.stringify(p.calls.map(c=>c.body)),/guest:abc|base64|image_url/);
 assert.deepEqual(s.limiter.calls,[['guest-caption:guest:abc',CAPTION_LIMITS.perDay,86400]]);
});

test('a flagged request keeps only the catalog item names; a flagged or broken result falls back to the fixed sentence',async()=>{
 {const p=provider({flagIn:true}),out=await service(p).caption('guest:a',{items:['핑크 아이돌'],prompt:'부적절한 요청'});
  assert.equal(out.source,'ai');const generation=p.calls.find(c=>c.url.endsWith('/responses'));assert.doesNotMatch(generation.body.input,/부적절한 요청/);assert.match(generation.body.input,/핑크 아이돌/);}
 {const out=await service(provider({flagOut:true})).caption('guest:a',{items:['핑크 아이돌']});assert.deepEqual(out,{...fallbackCaption(['핑크 아이돌']),source:'template'});}
 {const out=await service(provider({text:'제목 없음'})).caption('guest:a',{items:['핑크 아이돌']});assert.equal(out.source,'template');}
 {const out=await service(provider({status:500})).caption('guest:a',{items:['핑크 아이돌']});assert.equal(out.source,'template');}
});

test('no key, nothing chosen or the daily limit never blocks publishing: the fixed sentence is returned without calling OpenAI',async()=>{
 for(const [opts,input] of [[{key:''},{items:['핑크 아이돌']}],[{},{items:[]}],[{fail:true},{items:['핑크 아이돌']}]]){
  const p=provider(),out=await service(p,opts).caption('guest:a',input);assert.equal(out.source,'template');assert.ok(out.title&&out.body);assert.equal(p.calls.length,0);
 }
 assert.equal(fallbackCaption([]).title,'AI로 바꾼 오늘의 사진');
 assert.equal(parseCaption('```json\n{"title":"'+'가'.repeat(80)+'","body":"본문"}\n```').title.length,CAPTION_LIMITS.title);
});

test('every AI photo failure is queued for Telegram with codes only: no IP, prompt, photo or member id',async()=>{
 const recorded=[];const photos=Object.create(AiPhotoService.prototype);photos.operations={record:async(...args)=>recorded.push(args)};photos.logger={warn(){}};
 const error=new Error('x');error.getStatus=()=>400;error.getResponse=()=>({code:'MODERATION_BLOCKED'});
 await photos.failureAlert('guest:abc',error,{requestId:'r1',stage:'moderation',provider:'openai',providerCode:'moderation_blocked'},Date.now()-1200,true);
 await photos.failureAlert('member-1',new Error('boom'),{requestId:'r2',stage:'generation',provider:'seedream'},Date.now(),false);
 assert.equal(recorded.length,2);
 const [type,data,dedupe,options]=recorded[0];assert.equal(type,'ai-photo.failed');assert.equal(dedupe,undefined);assert.deepEqual(options,{omitIp:true});
 assert.deepEqual({...data,durationMs:undefined},{errorCode:'MODERATION_BLOCKED',status:400,stage:'moderation',provider:'openai',errorType:'moderation_blocked',actor:'guest',durationMs:undefined});
 assert.deepEqual([recorded[1][1].errorCode,recorded[1][1].status,recorded[1][1].actor],['INTERNAL_ERROR',500,'member']);
 assert.doesNotMatch(JSON.stringify(recorded),/guest:abc|member-1/);
 // A broken alert path never replaces the user's original error.
 photos.operations={record:async()=>{throw new Error('down');}};await photos.failureAlert('member-1',error,{requestId:'r3',stage:'x',provider:'y'},Date.now(),false);
});

test('the stored alert row and the Telegram text carry no IP for AI photo failures, while other alerts keep it',async()=>{
 const rows=[];const tx={platformOperationalEvent:{create:async({data})=>{rows.push(data);return{id:'e1',...data,created_at:new Date()};}},platformAuditLog:{create:async()=>({})}};
 const ops=new PlatformOperationsService({$transaction:async fn=>fn(tx)},config({}));
 await requestContext.run({requestId:'q1',ip:'203.0.113.9',peerIp:'10.0.0.1'},()=>ops.record('ai-photo.failed',{errorCode:'X',stage:'generation',provider:'seedream',actor:'guest',status:502},undefined,{omitIp:true}));
 await requestContext.run({requestId:'q2',ip:'203.0.113.9',peerIp:'10.0.0.1'},()=>ops.record('http.error',{errorCode:'Y',status:500}));
 assert.equal(rows[0].ip,null);assert.equal(rows[0].peer_ip,null);assert.deepEqual(rows[0].data,{errorCode:'X',stage:'generation',provider:'seedream',actor:'guest',status:502});
 assert.equal(rows[1].ip,'203.0.113.9');
 const row={id:'e1',type:'ai-photo.failed',ip:'203.0.113.9',peer_ip:null,created_at:new Date('2026-11-16T00:00:00Z'),request_id:'q1',data:rows[0].data};
 const text=operationsAlertText(row,'production','secret');assert.match(text,/AI 사진 편집 실패/);assert.match(text,/접속 IP: 보내지 않음/);assert.doesNotMatch(text,/203\.0\.113\.9/);assert.match(text,/errorCode: X/);
 assert.match(operationsAlertText({...row,type:'http.error'},'production','secret'),/203\.0\.113\.9/);
});
