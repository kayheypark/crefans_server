require('reflect-metadata');require('dotenv').config({path:'.local/platform.env',override:true});
// Studio AI photo editor (2026-11-08). Providers are always stubs (no network); media is stored locally in a temp MEDIA_ROOT on the isolated e2e DB.
const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
assert.equal(process.env.CREFANS_E2E,'true');const source=process.env.DATABASE_URL;assert.match(source||'',/@127\.0\.0\.1:3307\/crefans_platform_dev$/);const url=new URL(source);url.pathname='/crefans_platform_e2e';process.env.DATABASE_URL=url.toString();
const mediaRoot=fs.mkdtempSync(path.join(os.tmpdir(),'ai-photo-'));
Object.assign(process.env,{LOCAL_AUTH_SECRET:'r'.repeat(64),DATA_ENCRYPTION_KEY:'a'.repeat(64),TELEGRAM_OPERATIONS_BOT_TOKEN:'',TELEGRAM_OPERATIONS_CHAT_ID:'',SMTP_HOST:'',BEAN_LEDGER_ENABLED:'false',AUTH_PROVIDER:'local',MEDIA_STORAGE:'local',MEDIA_ROOT:mediaRoot,AI_PHOTO_BYTEPLUS_API_KEY:'seedream-test-key',AI_PHOTO_OPENAI_API_KEY:'sk-test-'+'x'.repeat(20),AI_PHOTO_DAILY_TOTAL:'100000'});
const sharp=require('sharp'),{PrismaClient}=require('@prisma/client'),db=new PrismaClient(),{NestFactory}=require('@nestjs/core'),{PlatformModule}=require('../dist/src/platform/module'),{AiPhotoService,aiPhotoPrompt}=require('../dist/src/platform/ai-photo');
const tag=crypto.randomBytes(3).toString('hex'),members=[];let app,photos,release,creator,other,sourceId,otherSourceId;
const png=(w,h,color={r:200,g:120,b:160})=>sharp({create:{width:w,height:h,channels:3,background:color}}).png().toBuffer();
async function makeCreator(handle){const id=crypto.randomUUID();members.push(id);await db.member.create({data:{id,email:id+'@ai-photo-edit.test.invalid',name:'AI 편집 QA',nickname:'AI 편집 QA',preferred_username:handle,password_hash:'unused',email_verified:true,status:'CONFIRMED'}});await db.creator.create({data:{user_id:id,handle,display_name:'AI 편집 QA'}});return id;}
async function media(owner,w=600,h=900){const id=crypto.randomUUID();fs.writeFileSync(path.join(mediaRoot,id),await sharp(await png(w,h)).webp().toBuffer());await db.media.create({data:{id,user_sub:owner,type:'IMAGE',original_name:'s.webp',file_name:id,file_size:1,mime_type:'image/webp',original_url:`/api/v1/media/${id}/file`,s3_upload_key:`local/${id}`,processing_status:'COMPLETED',processed_at:new Date()}});return id;}
// Provider stub: records calls; moderation verdicts come from `flags` (input first, then each output), edits return `outputs` PNGs.
let calls=[],flags=[],editStatus=200,outputs=2,moderationDown=false,providerError=null,warnings=[];
async function stub(url,init){
 if(url.endsWith('/moderations')){const body=JSON.parse(init.body);calls.push({kind:'moderation',body});if(body.input.filter(i=>i.type==='image_url').length>1)return new Response(JSON.stringify({error:{code:'too_many_images'}}),{status:400});if(moderationDown)return new Response('{}',{status:503});const f=flags.length?flags.shift():false;return new Response(JSON.stringify({results:[{flagged:f}]}),{status:200});}
 if(url.endsWith('/images/generations')){const fields=JSON.parse(init.body),entry={kind:'edit',fields,images:fields.image.map(value=>({type:value.slice(5,value.indexOf(';')),bytes:Buffer.from(value.split(',')[1],'base64')}))};assert.equal(fields.model,'dola-seedream-5-5-261028');calls.push(entry);
  if(editStatus!==200)return new Response(JSON.stringify({error:providerError||{code:editStatus===400?'moderation_blocked':'server_error'}}),{status:editStatus,headers:{'x-request-id':'req_ai_photo_test'}});
  const data=[];for(let i=0;i<outputs;i++)data.push({b64_json:(await png(1024,1536,{r:10*i,g:80,b:200})).toString('base64')});return new Response(JSON.stringify({data}),{status:200});}
 throw new Error('unexpected '+url);
}
const reset=()=>{calls=[];flags=[];editStatus=200;outputs=2;moderationDown=false;providerError=null;warnings=[];};
const base=extra=>({sourceId,kind:'pose',style:'photo',prompt:'벚꽃 아래 벤치에 앉은 포즈',consent:'true',...extra});
const code=wanted=>e=>e.getResponse?.().code===wanted;
async function mask(transparent=true){const img=sharp({create:{width:600,height:900,channels:4,background:{r:255,g:255,b:255,alpha:1}}});return{buffer:await(transparent?img.composite([{input:await sharp({create:{width:200,height:300,channels:4,background:{r:0,g:0,b:0,alpha:1}}}).png().toBuffer(),left:200,top:300,blend:'dest-out'}]):img).png().toBuffer(),mimetype:'image/png',size:1000};}
before(async()=>{
 release=await require('./e2e-db-lock.cjs').lockE2EDatabase(source);
 const result=require('node:child_process').spawnSync(process.execPath,[require.resolve('prisma/build/index.js'),'migrate','deploy'],{env:process.env,encoding:'utf8'});assert.equal(result.status,0,result.stdout+result.stderr);
 creator=await makeCreator('aiedit_'+tag);other=await makeCreator('aiother_'+tag);sourceId=await media(creator);otherSourceId=await media(other);
 app=await NestFactory.create(PlatformModule,{logger:false});await app.init();photos=app.get(AiPhotoService);photos.fetcher=stub;photos.logger={warn:value=>warnings.push(value)};
});
after(async()=>{await app?.close();try{await db.aiHeartUse.deleteMany({where:{user_id:{in:members}}});await db.aiHeartGame.deleteMany({where:{user_id:{in:members}}});await db.aiHeartWallet.deleteMany({where:{user_id:{in:members}}});await db.aiShopUse.deleteMany({where:{creator_id:{in:members}}});await db.aiShopOrder.deleteMany({where:{creator_id:{in:members}}});const made=await db.media.findMany({where:{user_sub:{in:members}},select:{id:true}});await db.media.deleteMany({where:{id:{in:made.map(m=>m.id)}}});await db.aiPhotoGrant.deleteMany({where:{creator_user_id:{in:members}}});await db.creator.deleteMany({where:{user_id:{in:members}}});await db.member.deleteMany({where:{id:{in:members}}});fs.rmSync(mediaRoot,{recursive:true,force:true});}finally{await db.$disconnect();await release?.();}});

test('only allow-listed creators: quota shows not allowed and edits are refused until granted',async()=>{
 reset();assert.deepEqual(await photos.quota(creator),{allowed:false,limit:10,remaining:0,paidRemaining:0,hearts:0,rewardRemaining:0,typicalSeconds:null,resetTickets:{count:0,nextExpiresAt:null}});
 await assert.rejects(photos.edit(creator,base()),code('AI_PHOTO_NOT_ALLOWED'));assert.equal(calls.length,0);
 await db.aiPhotoGrant.create({data:{creator_user_id:creator,reason:'테스트 허용'}});
 {const q=await photos.quota(creator);assert.deepEqual([q.allowed,q.limit,q.remaining],[true,10,10]);assert.ok(q.typicalSeconds===null||Number.isInteger(q.typicalSeconds));}
});

test('input rules are checked before the provider: consent, prompt, personal data, mask, own photo only',async()=>{
 reset();
 await assert.rejects(photos.edit(creator,base({consent:'false'})),code('CONSENT_REQUIRED'));
 await assert.rejects(photos.edit(creator,base({prompt:' '})),code('INVALID_PROMPT'));
 await assert.rejects(photos.edit(creator,base({prompt:'가'.repeat(2001)})),code('INVALID_PROMPT'));
 await assert.rejects(photos.edit(creator,base({prompt:'연락처 010-1234-5678 넣어줘'})),code('PERSONAL_DATA'));
 await assert.rejects(photos.edit(creator,base({kind:'hair'})),code('INVALID_KIND'));
 await assert.rejects(photos.edit(creator,base({kind:'outfit'}),await mask(false)),code('MASK_REQUIRED'));
 await assert.rejects(photos.edit(creator,base({sourceId:otherSourceId})),code('MEDIA_NOT_FOUND'));
 assert.equal(calls.length,0);assert.equal((await photos.quota(creator)).remaining,10);
});

test('pose edit: moderation of prompt and photo, one image requested, saved as private AI media; original untouched',async()=>{
 reset();const before=fs.readFileSync(path.join(mediaRoot,sourceId));
 const r=await photos.edit(creator,base());
 assert.equal(r.images.length,1);assert.equal(r.remaining,9);assert.ok(r.images.every(i=>i.aiGenerated&&i.type==='image'&&i.url===`/api/v1/media/${i.id}/file`));
 const input=calls[0];assert.equal(input.kind,'moderation');assert.equal(input.body.input[0].text,'벚꽃 아래 벤치에 앉은 포즈');assert.match(input.body.input[1].image_url.url,/^data:image\/png;base64,/);
 const edit=calls.find(c=>c.kind==='edit');assert.equal(edit.fields.n,undefined);assert.equal(edit.fields.model,'dola-seedream-5-5-261028');assert.equal(edit.fields.size,'1024x1536');assert.equal(edit.fields.watermark,false);assert.ok(!('mask' in edit.fields));
 assert.equal(edit.fields.prompt,aiPhotoPrompt('pose','photo','벚꽃 아래 벤치에 앉은 포즈'));assert.match(edit.fields.prompt,/Do not add nudity/);assert.equal(edit.fields.response_format,'b64_json');
 assert.equal(calls.filter(c=>c.kind==='moderation').length,2,'input + one output');
 for(const img of r.images){const row=await db.media.findUnique({where:{id:img.id}});assert.equal(row.user_sub,creator);assert.equal(row.metadata.aiGenerated,true);assert.equal(row.metadata.aiSourceId,sourceId);assert.equal(row.metadata.aiKind,'pose');assert.equal(typeof row.metadata.aiDurationMs,'number');assert.ok(row.metadata.aiDurationMs>=0);assert.equal(row.metadata.watermarkEligible!==undefined,true);assert.ok(fs.existsSync(path.join(mediaRoot,row.file_name)));}
 assert.deepEqual(fs.readFileSync(path.join(mediaRoot,sourceId)),before);
 const q=await photos.quota(creator);assert.ok(Number.isInteger(q.typicalSeconds)&&q.typicalSeconds>=1,'typical time comes from finished edits');
});

test('outfit edit sends a clothing guide aligned with the original image',async()=>{
 reset();const r=await photos.edit(creator,base({kind:'outfit',prompt:'흰색 세일러 교복 코스튬'}),await mask());assert.equal(r.images.length,1);
 const edit=calls.find(c=>c.kind==='edit');assert.equal(edit.images.length,2);assert.equal(edit.images[1].type,'image/png');assert.equal(edit.fields.mask,undefined);
 const [mi,ii]=await Promise.all([sharp(edit.images[1].bytes).metadata(),sharp(edit.images[0].bytes).metadata()]);assert.deepEqual([mi.width,mi.height],[ii.width,ii.height]);assert.notDeepEqual(edit.images[0].bytes,edit.images[1].bytes);
});

test('makeup and expression edits reach the provider with their specific instructions and preserve safety rules',async()=>{
 for(const [kind,request,instruction] of [['makeup','입술을 코랄 톤으로 바꿔줘',/Change only the makeup/],['expression','밝게 웃어줘',/Change only the facial expression/]]){
  reset();const result=await photos.edit(creator,base({kind,prompt:request}));assert.equal(result.images.length,1);
  const edit=calls.find(c=>c.kind==='edit');assert.match(edit.fields.prompt,instruction);assert.match(edit.fields.prompt,/facial structure, identity, age/);assert.match(edit.fields.prompt,/Do not add nudity/);assert.ok(!('mask' in edit.fields));
  const row=await db.media.findUnique({where:{id:result.images[0].id}});assert.equal(row.metadata.aiKind,kind);
 }
});

test('failures: provider error and unavailable moderation give the try back; blocked input/output still count',async()=>{
 const left=async()=>(await photos.quota(creator)).remaining,start=await left();
 reset();editStatus=500;await assert.rejects(photos.edit(creator,base()),code('PROVIDER_ERROR'));assert.equal(await left(),start);
 reset();moderationDown=true;await assert.rejects(photos.edit(creator,base()),code('MODERATION_UNAVAILABLE'));assert.equal(await left(),start);assert.equal(calls.some(c=>c.kind==='edit'),false);
 reset();flags=[true];await assert.rejects(photos.edit(creator,base()),code('UNSAFE_INPUT'));assert.equal(calls.some(c=>c.kind==='edit'),false);assert.equal(await left(),start-1);
 reset();editStatus=400;await assert.rejects(photos.edit(creator,base()),code('UNSAFE_INPUT'));assert.equal(await left(),start-2);
 reset();flags=[false,false,true];const one=await photos.edit(creator,base());assert.equal(one.images.length,1,'extra provider output is ignored');
 reset();flags=[false,true,true];await assert.rejects(photos.edit(creator,base()),code('UNSAFE_OUTPUT'));assert.equal(await left(),start-4);
});

test('daily limit: the eleventh request of the day is refused without calling the provider',async()=>{
 reset();let r;while((r=await photos.quota(creator)).remaining>0)await photos.edit(creator,base());
 calls=[];await assert.rejects(photos.edit(creator,base()),code('DAILY_LIMIT'));assert.equal(calls.some(c=>c.kind==='edit'),false);
 assert.equal((await photos.quota(creator)).remaining,0);
});


test('combined edits and gender transform: actual provider instructions, two source references, chained own generated source',async()=>{
 const user=await makeCreator('aicomb_'+tag);await db.aiPhotoGrant.create({data:{creator_user_id:user,reason:'테스트 허용'}});const id=await media(user);
 const input=base({sourceId:id,kind:'combined',editKinds:JSON.stringify(['outfit','makeup','expression','pose','background']),prompt:'흰 셔츠, 코랄 메이크업, 웃으며 손인사, 서코 실내',targetGender:'male'});
 reset();const result=await photos.edit(user,input,await mask());assert.equal(result.images.length,1);
 const edit=calls.find(c=>c.kind==='edit');assert.equal(edit.fields.n,undefined);assert.equal(edit.images.length,2);assert.ok(!edit.fields.mask);assert.equal(edit.fields.image.length,2);
 assert.match(edit.fields.prompt,/adult man/);assert.match(edit.fields.prompt,/Allow facial features and gender presentation to change/);assert.doesNotMatch(edit.fields.prompt,/facial structure, identity, age, body shape and skin tone exactly/);assert.match(edit.fields.prompt,/Never reproduce the pink guide/);assert.match(edit.fields.prompt,/Do not add nudity/);
 assert.notDeepEqual(edit.images[0].bytes,edit.images[1].bytes);
 const row=await db.media.findUnique({where:{id:result.images[0].id}});assert.deepEqual(row.metadata.aiEditKinds,['outfit','makeup','expression','pose','background']);assert.equal(row.metadata.aiTargetGender,'male');
 reset();const edited=await photos.edit(user,base({sourceId:result.images[0].id,targetGender:'female',prompt:'성인 여성으로 바꿔줘.'}));assert.equal(edited.images.length,1);assert.match(calls.find(c=>c.kind==='edit').fields.prompt,/adult woman/);
 const next=await db.media.findUnique({where:{id:edited.images[0].id}});assert.equal(next.metadata.aiSourceId,result.images[0].id);assert.equal(next.metadata.aiTargetGender,'female');
 await db.aiPhotoGrant.create({data:{creator_user_id:other,reason:'소유권 거절 검사'}});reset();await assert.rejects(photos.edit(other,base({sourceId:edited.images[0].id})),code('MEDIA_NOT_FOUND'));assert.equal(calls.length,0);
 reset();await photos.edit(user,base({sourceId:id,kind:'outfit',targetGender:'female'}),await mask());const outfit=calls.find(c=>c.kind==='edit');assert.equal(outfit.images.length,2);assert.ok(!outfit.fields.mask);assert.match(outfit.fields.prompt,/adult woman/);
});

test('combined/gender validation refuses malformed scopes, missing outfit mask and unsupported gender before provider',async()=>{
 const user=await makeCreator('aival_'+tag);await db.aiPhotoGrant.create({data:{creator_user_id:user,reason:'테스트 허용'}});const id=await media(user);reset();
 for(const editKinds of [undefined,'not json','["pose"]','["pose","pose"]','["pose","hair"]','{}'])await assert.rejects(photos.edit(user,base({sourceId:id,kind:'combined',editKinds})),code('INVALID_EDIT_KINDS'));
 await assert.rejects(photos.edit(user,base({sourceId:id,targetGender:'unknown'})),code('INVALID_TARGET_GENDER'));
 assert.equal(calls.length,0);assert.equal((await photos.quota(user)).remaining,10);
 reset();await photos.edit(user,base({sourceId:id,kind:'combined',editKinds:['pose','background']}));const edit=calls.find(c=>c.kind==='edit');assert.equal(edit.images.length,1);assert.ok(!edit.fields.mask);assert.match(edit.fields.prompt,/facial structure, identity, age/);
});


test('all eight aspects including camera, lens and body combine without conflicting body-preservation rules',async()=>{
 const user=await makeCreator('aibody_'+tag);await db.aiPhotoGrant.create({data:{creator_user_id:user,reason:'테스트 허용'}});const id=await media(user);reset();
 const kinds=['outfit','makeup','expression','pose','background','camera','lens','body'];await photos.edit(user,base({sourceId:id,kind:'combined',editKinds:kinds,prompt:'가슴 크기는 조금 작게, 키 비율은 조금 크게. 전신 구도, Canon RF85mm F1.2 촬영 느낌, 벤치에 앉은 포즈.'}),await mask());const edit=calls.find(c=>c.kind==='edit');assert.equal(edit.fields.n,undefined);assert.match(edit.fields.prompt,/Camera: adjust viewpoint/);assert.match(edit.fields.prompt,/Shooting concept: apply/);assert.match(edit.fields.prompt,/Body proportions:/);assert.match(edit.fields.prompt,/Only the requested body proportions may change/);assert.doesNotMatch(edit.fields.prompt,/body shape and skin tone exactly/);assert.match(edit.fields.prompt,/age and skin tone/);assert.match(edit.fields.prompt,/Do not add nudity/);
 reset();await photos.edit(user,base({sourceId:id,kind:'body',prompt:'힙 크기를 조금 크게 자연스럽게 보정해줘.'}));const body=calls.find(c=>c.kind==='edit');assert.match(body.fields.prompt,/fully clothed/);assert.match(body.fields.prompt,/Only the requested body proportions may change/);assert.ok(!body.fields.mask);
});


test('provider image user errors are not safety violations: stable code controls classification, logs omit inputs and credentials',async()=>{
 const user=await makeCreator('aierr_'+tag);await db.aiPhotoGrant.create({data:{creator_user_id:user,reason:'테스트 허용'}});const id=await media(user),request=base({sourceId:id,prompt:'배경을 흰색으로. 비밀문구MARKER'});
 reset();editStatus=400;providerError={type:'image_generation_user_error',code:'invalid_value',message:'private-provider-message-MARKER',param:'size'};await assert.rejects(photos.edit(user,request),code('PROVIDER_INPUT_ERROR'));assert.equal((await photos.quota(user)).remaining,10);assert.equal(warnings[0].code,'invalid_value');assert.equal(warnings[0].requestId,'req_ai_photo_test');assert.doesNotMatch(JSON.stringify(warnings),/비밀문구MARKER|private-provider-message-MARKER|sk-test-|base64|sourceId/);
 reset();editStatus=400;providerError={type:'image_generation_user_error',code:'moderation_blocked',moderation_details:{moderation_stage:'output',categories:['sexual']}};await assert.rejects(photos.edit(user,request),code('UNSAFE_OUTPUT'));assert.equal((await photos.quota(user)).remaining,9);assert.equal(warnings[0].stage,'output');
 reset();editStatus=400;providerError={type:'image_generation_user_error',code:'moderation_blocked',moderation_details:{moderation_stage:'input'}};await assert.rejects(photos.edit(user,request),code('UNSAFE_INPUT'));assert.equal((await photos.quota(user)).remaining,8);assert.equal(warnings[0].stage,'input');
});

test('output safety-check outage is not a confirmed unsafe image and is never returned to the user',async()=>{
 const user=await makeCreator('aiout_'+tag);await db.aiPhotoGrant.create({data:{creator_user_id:user,reason:'테스트 허용'}});const id=await media(user);reset();flags=[false,undefined];await assert.rejects(photos.edit(user,base({sourceId:id})),code('MODERATION_UNAVAILABLE'));assert.equal((await photos.quota(user)).remaining,9,'finished provider work still counts');assert.equal(await db.media.count({where:{user_sub:user}}),1,'only original saved');assert.equal(warnings[0].stage,'output');assert.equal(warnings[0].code,'MODERATION_UNAVAILABLE');
});


test('cosplay complete look sends original plus guide and allows explicitly requested wig and accessories; regular outfit also uses a region guide',async()=>{
 const user=await makeCreator('aifull_'+tag);await db.aiPhotoGrant.create({data:{creator_user_id:user,reason:'테스트 허용'}});const id=await media(user);
 reset();await photos.edit(user,base({sourceId:id,kind:'outfit',style:'cosplay',prompt:'검정에서 보라색으로 이어지는 올림머리 가발, 나비 머리핀, 칼집, 샌들'}),await mask());
 const edit=calls.find(c=>c.kind==='edit');assert.equal(edit.images.length,2);assert.ok(!edit.fields.mask);assert.match(edit.fields.prompt,/wig hair color, hairstyle, headwear, accessories, props and footwear/);assert.match(edit.fields.prompt,/may extend beyond it/);assert.match(edit.fields.prompt,/Keep the face, identity and unrequested details unchanged/);assert.match(edit.fields.prompt,/Never reproduce the pink guide/);assert.match(edit.fields.prompt,/source framing/);assert.doesNotMatch(edit.fields.prompt,/Keep everything outside the mask unchanged/);assert.equal(edit.fields.n,undefined);assert.equal(edit.fields.watermark,false);
 reset();await photos.edit(user,base({sourceId:id,kind:'combined',editKinds:['outfit','background'],style:'cosplay',prompt:'같은 가발과 소품, 흰 스튜디오'}),await mask());
 assert.match(calls.find(c=>c.kind==='edit').fields.prompt,/Cosplay: apply the requested complete costume/);
 reset();await photos.edit(user,base({sourceId:id,mode:'cosplay',kind:'outfit',style:'photo'}),await mask());
 const ordinary=calls.find(c=>c.kind==='edit');assert.equal(ordinary.images.length,2);assert.ok(!ordinary.fields.mask);assert.match(ordinary.fields.prompt,/Keep everything outside the pink guide unchanged/);assert.doesNotMatch(ordinary.fields.prompt,/Cosplay: apply/);
});


test('catalog reference images: real selected bytes reach both moderation and edit in order; other edits stay intact',async()=>{
 const {AI_PHOTO_COSTUME_IDS,readCostumeReference}=require('../dist/src/platform/ai-photo-costume-references');
 assert.equal(AI_PHOTO_COSTUME_IDS.length,90);
 for(const id of AI_PHOTO_COSTUME_IDS){const bytes=await readCostumeReference(id),m=await sharp(bytes).metadata();assert.equal(m.format,'webp');assert.equal(m.width,512);assert.equal(m.height,512);}
 const user=await makeCreator('airef_'+tag);await db.aiPhotoGrant.create({data:{creator_user_id:user,reason:'테스트 허용'}});const id=await media(user);
 reset();const ids=['80bdd0','29581e'],prompt='의상 참조 사진 1의 코디를 적용해줘. 흰 스튜디오';
 await photos.edit(user,base({sourceId:id,kind:'combined',editKinds:['outfit','background'],style:'cosplay',costumeIds:JSON.stringify(ids),prompt}),await mask());
 const tracedInputs=await db.platformAuditLog.findMany({where:{actor_id:user,action:'ai-photo.step.started',metadata:{path:'$.operation',equals:'input'}},orderBy:{occurred_at:'asc'}});assert.deepEqual(tracedInputs.map(r=>r.metadata.source),['original','costume-reference-1','costume-reference-2']);
 const edit=calls.find(c=>c.kind==='edit'),inputs=calls.filter(c=>c.kind==='moderation').slice(0,3);assert.equal(edit.images.length,4);assert.equal(inputs.length,3);for(const c of inputs){assert.equal(c.body.input.filter(i=>i.type==='image_url').length,1);assert.equal(c.body.input[0].text,prompt);}
 for(const [i,ref] of ids.entries()){const bytes=await readCostumeReference(ref);assert.deepEqual(edit.images[i+2].bytes,bytes);assert.equal(inputs[i+1].body.input[1].image_url.url,'data:image/webp;base64,'+bytes.toString('base64'));}
 assert.match(edit.fields.prompt,/Images 3 through 4/);assert.match(edit.fields.prompt,/Do not copy the reference mannequin/);assert.ok(edit.fields.prompt.includes(prompt));assert.match(edit.fields.prompt,/Background:/);assert.equal(edit.fields.watermark,false);assert.equal(edit.fields.n,undefined);assert.equal(calls.filter(c=>c.kind==='moderation').length,4);
 reset();flags=[false,true];await assert.rejects(photos.edit(user,base({sourceId:id,kind:'outfit',style:'cosplay',costumeIds:['maid']}),await mask()),code('UNSAFE_INPUT'));assert.equal(calls.some(c=>c.kind==='edit'),false);
});

test('invalid reference IDs, URLs, paths, duplicates, oversized lists and incompatible edits are rejected before provider calls',async()=>{
 const {AI_PHOTO_COSTUME_IDS,costumeReferenceIds}=require('../dist/src/platform/ai-photo-costume-references');
 for(const value of ['{',[],['../secret'],['https://example.com/a.webp'],['maid','maid'],AI_PHOTO_COSTUME_IDS.slice(0,15),[null]])assert.throws(()=>costumeReferenceIds(value,['outfit'],'cosplay'),code('INVALID_COSTUME_REFERENCES'));
 assert.throws(()=>costumeReferenceIds(['maid'],['pose'],'cosplay'),code('INVALID_COSTUME_REFERENCES'));
 assert.throws(()=>costumeReferenceIds(['maid'],['outfit'],'photo'),code('INVALID_COSTUME_REFERENCES'));
 assert.equal(costumeReferenceIds(AI_PHOTO_COSTUME_IDS.slice(0,14),['outfit'],'cosplay').length,14);
 reset();await assert.rejects(photos.edit(creator,base({costumeIds:'["maid"]'})),code('INVALID_COSTUME_REFERENCES'));assert.equal(calls.length,0);
});


test('every reference must pass: later blocked or unavailable reference prevents generation; unavailable restores quota',async()=>{
 const user=await makeCreator('airefgate_'+tag);await db.aiPhotoGrant.create({data:{creator_user_id:user,reason:'테스트 허용'}});const id=await media(user);
 const request=base({sourceId:id,kind:'outfit',style:'cosplay',costumeIds:['maid','aot-scout']});
 reset();flags=[false,false,true];await assert.rejects(photos.edit(user,request,await mask()),code('UNSAFE_INPUT'));assert.equal(calls.filter(c=>c.kind==='moderation').length,3);assert.equal(calls.some(c=>c.kind==='edit'),false);
 const left=(await photos.quota(user)).remaining;
 reset();flags=[false,false,undefined];await assert.rejects(photos.edit(user,request,await mask()),code('MODERATION_UNAVAILABLE'));assert.equal(calls.some(c=>c.kind==='edit'),false);assert.equal((await photos.quota(user)).remaining,left);
});

test('Seedream uses its own key, JSON reference order and one base64 output; moderation remains independent',async()=>{
 const saved={...photos.settings},previous=photos.fetcher;
 const user=await makeCreator('aiseed_'+tag);await db.aiPhotoGrant.create({data:{creator_user_id:user,reason:'테스트 허용'}});const id=await media(user);
 try{
  Object.assign(photos.settings,{seedreamKey:'seedream-test-key'});
  reset();let payload;
  photos.fetcher=async(url,init)=>{
   if(url.endsWith('/moderations')){assert.equal(init.headers.Authorization,'Bearer '+saved.apiKey);return stub(url,init);}
   assert.equal(url,'https://ark.ap-southeast.bytepluses.com/api/v3/images/generations');assert.equal(init.headers.Authorization,'Bearer seedream-test-key');assert.equal(init.headers['Content-Type'],'application/json');payload=JSON.parse(init.body);
   return new Response(JSON.stringify({data:[{b64_json:(await png(1024,1536)).toString('base64')}]}));
  };
  const request=base({sourceId:id,mode:'cosplay',kind:'outfit',style:'cosplay',costumeIds:['blue-shiroko']});
  const r=await photos.edit(user,request,await mask());assert.equal(r.images.length,1);assert.equal(payload.model,'dola-seedream-5-5-261028');assert.equal(payload.image.length,3);assert.notEqual(payload.image[0],payload.image[1]);
  const ref=await require('../dist/src/platform/ai-photo-costume-references').readCostumeReference('blue-shiroko');assert.equal(payload.image[2],'data:image/webp;base64,'+ref.toString('base64'));
  assert.equal(payload.size,'1024x1536');assert.equal(payload.response_format,'b64_json');assert.equal(payload.watermark,false);assert.equal(payload.background,'opaque');assert.match(payload.prompt,/Images 3 through 3/);
  for(const unsupported of ['n','mask','quality','moderation','sequential_image_generation'])assert.equal(unsupported in payload,false);
  assert.equal(calls.filter(c=>c.kind==='moderation').length,3);
  assert.equal((await db.media.findUniqueOrThrow({where:{id:r.images[0].id}})).metadata.aiModel,'dola-seedream-5-5-261028');
  reset();await photos.edit(user,base({sourceId:id,mode:'cosplay',kind:'outfit',style:'photo'}),await mask());assert.equal(payload.image.length,2);assert.match(payload.prompt,/pink clothing-region guide/);assert.doesNotMatch(payload.prompt,/transparent masked area/);
  reset();payload=null;flags=[true];await assert.rejects(photos.edit(user,request,await mask()),code('UNSAFE_INPUT'));assert.equal(payload,null);
  reset();flags=[false,false,true];await assert.rejects(photos.edit(user,request,await mask()),code('UNSAFE_OUTPUT'));
  reset();const left=(await photos.quota(user)).remaining;photos.fetcher=async(url,init)=>url.endsWith('/moderations')?stub(url,init):new Response('{}',{status:503});await assert.rejects(photos.edit(user,request,await mask()),code('PROVIDER_ERROR'));assert.equal((await photos.quota(user)).remaining,left);
  reset();photos.fetcher=async(url,init)=>url.endsWith('/moderations')?stub(url,init):new Response(JSON.stringify({error:{code:'OutputImageSensitiveContentDetected.PolicyViolation'}}),{status:400});await assert.rejects(photos.edit(user,request,await mask()),code('UNSAFE_OUTPUT'));
  reset();const ids=require('../dist/src/platform/ai-photo-costume-references').AI_PHOTO_COSTUME_IDS.slice(0,9);await assert.rejects(photos.edit(user,{...request,costumeIds:ids},await mask()),code('INVALID_COSTUME_REFERENCES'));assert.equal(calls.length,0);
  photos.settings.seedreamKey='';assert.equal((await photos.quota(user)).allowed,false);await assert.rejects(photos.edit(user,request,await mask()),code('PROVIDER_NOT_CONFIGURED'));
 }finally{Object.assign(photos.settings,saved);photos.fetcher=previous;}
});

test('Seedream config pins the international model and does not reuse the OpenAI key',()=>{
 const {aiPhotoConfig}=require('../dist/src/platform/ai-photo');
 const config=values=>({get:k=>values[k]});
 const s=aiPhotoConfig(config({AI_PHOTO_COSPLAY_PROVIDER:'seedream',AI_PHOTO_MODEL:'gpt-image-2',AI_PHOTO_OPENAI_API_KEY:'openai-only'}));
 assert.equal(s.model,'dola-seedream-5-5-261028');assert.equal(s.seedreamKey,'');assert.equal(s.apiKey,'openai-only');
 assert.equal(aiPhotoConfig(config({AI_PHOTO_COSPLAY_PROVIDER:'openai',AI_PHOTO_MODEL:'gpt-image-2'})).model,'dola-seedream-5-5-261028');
});

test('all modes including omitted mode use Seedream and require its key without fallback',async()=>{
 const saved={...photos.settings},previous=photos.fetcher;
 const user=await makeCreator('aimode_'+tag);await db.aiPhotoGrant.create({data:{creator_user_id:user,reason:'테스트 허용'}});const id=await media(user);
 try{
  for(const mode of [undefined,'general','cosplay']){
   reset();photos.fetcher=stub;const r=await photos.edit(user,base({sourceId:id,mode}));
   assert.equal(calls.find(c=>c.kind==='edit').fields.model,'dola-seedream-5-5-261028');assert.equal((await db.media.findUniqueOrThrow({where:{id:r.images[0].id}})).metadata.aiMode,mode??'general');
  }
  const starts=await db.platformAuditLog.findMany({where:{actor_id:user,action:'ai-photo.started'}});assert.equal(starts.length,3);assert.ok(starts.every(r=>r.metadata.selectedProvider==='seedream'&&r.metadata.selectedModel==='dola-seedream-5-5-261028'));
  reset();await assert.rejects(photos.edit(user,base({sourceId:id,mode:'bad'})),code('INVALID_EDIT_MODE'));assert.equal(calls.length,0);
  photos.settings.seedreamKey='';assert.equal((await photos.quota(user)).allowed,false);
  for(const mode of [undefined,'general','cosplay'])await assert.rejects(photos.edit(user,base({sourceId:id,mode})),code('PROVIDER_NOT_CONFIGURED'));
  assert.equal(calls.length,0);
 }finally{Object.assign(photos.settings,saved);photos.fetcher=previous;}
});

test('failure diagnostics correlate IDs, encrypt prompts, restrict access and expire after 30 days',async()=>{
 const {requestContext}=require('../dist/src/platform/request-context');
 const {adminLogDetail}=require('../dist/src/platform/admin-logs');
 const {pruneAiFailureDetails}=require('../dist/src/platform/ai-photo-failures');
 const {ConfigService}=require('@nestjs/config');
 const config=new ConfigService(),user=await makeCreator('aidiag_'+tag);await db.aiPhotoGrant.create({data:{creator_user_id:user,reason:'테스트'}});const id=await media(user);
 reset();editStatus=401;providerError={code:'Authentication.InvalidKey',message:'DO_NOT_STORE_PROVIDER_SECRET'};
 const requestId=crypto.randomUUID(),prompt='진한 갈색 메이크업 진단MARKER';
 await assert.rejects(requestContext.run({requestId,ip:'127.0.0.1',peerIp:'127.0.0.1'},()=>photos.edit(user,base({sourceId:id,prompt}))),code('PROVIDER_ERROR'));
 const log=await db.platformAuditLog.findFirst({where:{request_id:requestId,action:'ai-photo.failed'}});assert.ok(log);assert.equal(log.metadata.providerCode,'Authentication.InvalidKey');assert.equal(log.metadata.providerRequestId,'req_ai_photo_test');assert.equal(log.metadata.httpStatus,401);assert.doesNotMatch(JSON.stringify(log),/진단MARKER|DO_NOT_STORE_PROVIDER_SECRET/);
 const stored=await db.aiPhotoFailureDetail.findUnique({where:{request_id:requestId}});assert.ok(stored);assert.doesNotMatch(stored.payload_encrypted,/진단MARKER/);assert.ok(stored.expires_at-Date.now()>29*86400000);
 const admin={id:crypto.randomUUID(),role:'SUPER_ADMIN'};const detail=await adminLogDetail(db,admin,log.id,config);assert.equal(detail.aiFailure.prompt,prompt);assert.equal(detail.aiFailure.stage,'provider');assert.equal(detail.aiFailure.provider,'seedream');assert.ok(await db.platformAuditLog.findFirst({where:{action:'admin.ai_photo_failure_viewed',entity_id:requestId}}));
 await assert.rejects(adminLogDetail(db,{role:'MODERATOR'},log.id,config),code('LOG_ADMIN_REQUIRED'));
 const restricted=await adminLogDetail(db,{id:admin.id,role:'ADMIN',permissions:{logs:{view:true}}},log.id,config);assert.equal(restricted.aiFailure.state,'restricted');assert.equal(restricted.aiFailure.prompt,undefined);
 await db.aiPhotoFailureDetail.update({where:{request_id:requestId},data:{expires_at:new Date(Date.now()-1000)}});assert.equal((await adminLogDetail(db,admin,log.id,config)).aiFailure.state,'expired');await pruneAiFailureDetails(db);assert.equal(await db.aiPhotoFailureDetail.findUnique({where:{request_id:requestId}}),null);assert.ok(await db.platformAuditLog.findUnique({where:{id:log.id}}));
});

test('diagnostic secrets are redacted and concurrent failures never exchange prompts or IDs',async()=>{
 const {diagnosticPrompt,aiFailureTrace,recordAiFailure}=require('../dist/src/platform/ai-photo-failures');
 assert.doesNotMatch(diagnosticPrompt('test@example.com 010-1234-5678 Bearer abcsecret sk-secretkey ark-secretkey'),/example.com|1234|abcsecret|sk-secret|ark-secret/);
 const seen=[],fakeDb={$transaction:async fn=>fn({platformAuditLog:{create:async()=>{}},aiPhotoFailureDetail:{create:async({data})=>seen.push(data)}})},config={get:k=>k==='DATA_ENCRYPTION_KEY'?'a'.repeat(64):undefined};
 await Promise.all(['alpha','beta'].map((prompt,i)=>aiFailureTrace.run({requestId:crypto.randomUUID(),stage:'input',provider:'openai'},async()=>{await new Promise(r=>setTimeout(r,i?1:10));await recordAiFailure(fakeDb,config,'synthetic',{prompt},{getResponse:()=>({code:'UNSAFE_INPUT'}),getStatus:()=>400},aiFailureTrace.getStore(),Date.now());})));
 const {PaymentProvider}=require('../dist/src/platform/payment-provider'),cipher=new PaymentProvider(config);assert.equal(seen.length,2);for(const row of seen){const payload=JSON.parse(cipher.decrypt(row.payload_encrypted));assert.equal(payload.requestId,row.request_id);assert.ok(['alpha','beta'].includes(payload.prompt));}assert.equal(new Set(seen.map(r=>r.request_id)).size,2);
 // Storage outage must not throw a second error or leak prompt text.
 await recordAiFailure({$transaction:async()=>{throw Error('down')},platformAuditLog:{upsert:async()=>{throw Error('down')}}},config,'synthetic',{prompt:'private'},Error('original'),{requestId:crypto.randomUUID(),stage:'source',provider:'local'},Date.now());
});

test('transport failure and timeout remain distinct and retain the underlying failure code',async()=>{
 const {requestContext}=require('../dist/src/platform/request-context');const user=await makeCreator('ainet_'+tag);await db.aiPhotoGrant.create({data:{creator_user_id:user,reason:'테스트'}});const source=await media(user);
 try{for(const [name,cause,wanted] of [['TypeError','ENOTFOUND','PROVIDER_CONNECTION_ERROR'],['TimeoutError',undefined,'PROVIDER_TIMEOUT']]){
  reset();const requestId=crypto.randomUUID();photos.fetcher=async(url,init)=>{if(url.endsWith('/moderations'))return stub(url,init);const e=new Error('secret URL must not be logged');e.name=name;e.cause={code:cause};throw e;};
  await assert.rejects(requestContext.run({requestId,ip:'',peerIp:''},()=>photos.edit(user,base({sourceId:source}))),code(wanted));const row=await db.platformAuditLog.findFirst({where:{request_id:requestId,action:'ai-photo.failed'}});assert.equal(row.metadata.operation,'generation');assert.equal(row.metadata.providerCode,cause||wanted);assert.equal(row.metadata.errorCode,wanted);assert.equal((await photos.quota(user)).remaining,10);
 }}finally{photos.fetcher=stub;}
});

test('attempt traces distinguish planned and actually called models, responses and every provider step',async()=>{
 const {requestContext}=require('../dist/src/platform/request-context'),{adminLogs,adminLogDetail}=require('../dist/src/platform/admin-logs'),{ConfigService}=require('@nestjs/config');
 const user=await makeCreator('aitrace_'+tag);await db.aiPhotoGrant.create({data:{creator_user_id:user,reason:'테스트'}});const id=await media(user),previous={...photos.settings},admin={id:crypto.randomUUID(),role:'SUPER_ADMIN'};
 Object.assign(photos.settings,{seedreamKey:'test-key'});
 photos.fetcher=async(url,init)=>url.endsWith('/images/generations')?new Response(JSON.stringify({model:'resolved-seedream-test',data:[{b64_json:(await png(600,900)).toString('base64')}]}),{headers:{'x-tt-logid':'seedream_trace_123'}}):stub(url,init);
 try{
  reset();const requestId=crypto.randomUUID();const result=await requestContext.run({requestId,ip:'',peerIp:''},()=>photos.edit(user,base({sourceId:id,mode:'cosplay',prompt:'trace-private-marker'})));
  const rows=await db.platformAuditLog.findMany({where:{request_id:requestId},orderBy:{occurred_at:'asc'}}),start=rows.find(r=>r.action==='ai-photo.started');assert.equal(start.metadata.selectedModel,'dola-seedream-5-5-261028');const starts=rows.filter(r=>r.action==='ai-photo.step.started');assert.deepEqual(starts.map(r=>r.metadata.operation),['input','generation','output','storage']);assert.equal(new Set(starts.map(r=>r.metadata.attemptId)).size,4);
  for(const step of starts){const end=rows.find(r=>r.action==='ai-photo.step.succeeded'&&r.metadata.attemptId===step.metadata.attemptId);assert.ok(end);assert.ok(end.duration_ms>=0);}
  const generation=rows.find(r=>r.action==='ai-photo.step.succeeded'&&r.metadata.operation==='generation');assert.equal(generation.metadata.model,'dola-seedream-5-5-261028');assert.equal(generation.metadata.responseModel,'resolved-seedream-test');assert.equal(generation.metadata.providerRequestId,'seedream_trace_123');assert.equal(rows.find(r=>r.action==='ai-photo.succeeded').metadata.targetId,result.images[0].id);
  assert.doesNotMatch(JSON.stringify(rows),/trace-private-marker|base64|test-key/);assert.equal(await db.aiPhotoFailureDetail.findUnique({where:{request_id:requestId}}),null,'successful prompt is not stored');
  const list=await adminLogs(db,admin,{aiAttempts:'true',requestId});assert.equal(list.total,1);assert.equal(list.items[0].aiAttempt.status,'succeeded');assert.deepEqual(list.items[0].aiAttempt.attemptedModels,['omni-moderation-latest','dola-seedream-5-5-261028']);const detail=await adminLogDetail(db,admin,start.id,new ConfigService());assert.equal(detail.aiAttempt.events.length,rows.length);assert.equal(detail.aiFailure,null);
  reset();flags=[true];const blocked=crypto.randomUUID();await assert.rejects(requestContext.run({requestId:blocked,ip:'',peerIp:''},()=>photos.edit(user,base({sourceId:id,mode:'cosplay'}))),code('UNSAFE_INPUT'));
  const denied=await adminLogs(db,admin,{aiAttempts:'true',requestId:blocked});assert.equal(denied.items[0].aiAttempt.status,'failed');assert.deepEqual(denied.items[0].aiAttempt.attemptedModels,['omni-moderation-latest']);assert.equal(denied.items[0].aiAttempt.selectedModel,'dola-seedream-5-5-261028');
 }finally{Object.assign(photos.settings,previous);photos.fetcher=stub;}
});

test('attempt start is persisted while provider is pending; incomplete old attempts are unknown, not success',async()=>{
 const {requestContext}=require('../dist/src/platform/request-context'),{adminLogs}=require('../dist/src/platform/admin-logs'),{auditRow}=require('../dist/src/platform/audit');
 const user=await makeCreator('aipending_'+tag);await db.aiPhotoGrant.create({data:{creator_user_id:user,reason:'테스트'}});const source=await media(user),requestId=crypto.randomUUID(),admin={role:'SUPER_ADMIN'};let releaseCall,enteredCall;const gate=new Promise(r=>releaseCall=r),entered=new Promise(r=>enteredCall=r);reset();
 photos.fetcher=async(url,init)=>{if(url.endsWith('/images/generations')){enteredCall();await gate;}return stub(url,init);};
 const pending=requestContext.run({requestId,ip:'',peerIp:''},()=>photos.edit(user,base({sourceId:source})));
 try{await entered;const list=await adminLogs(db,admin,{aiAttempts:'true',requestId});assert.equal(list.items[0].aiAttempt.status,'in_progress');assert.ok(list.items[0].aiAttempt.attemptedModels.includes(photos.settings.model));}finally{releaseCall();await pending;photos.fetcher=stub;}
 const old=crypto.randomUUID();await db.platformAuditLog.create({data:{...auditRow({category:'business',action:'ai-photo.started',data:{model:'gpt-image-2'}},{requestId:old,ip:'',peerIp:''}),occurred_at:new Date(Date.now()-660000)}});const result=await adminLogs(db,admin,{aiAttempts:'true',requestId:old});assert.equal(result.items[0].aiAttempt.status,'unknown');assert.deepEqual(result.items[0].aiAttempt.attemptedModels,[]);
});


test('six-character costume IDs map to identical assets and normalize legacy aliases before duplicates',async()=>{
 const {AI_PHOTO_COSTUME_IDS,costumeReferenceIds,readCostumeReference}=require('../dist/src/platform/ai-photo-costume-references');
 assert.equal(AI_PHOTO_COSTUME_IDS.length,90);assert.equal(new Set(AI_PHOTO_COSTUME_IDS).size,90);for(const id of AI_PHOTO_COSTUME_IDS)assert.match(id,/^[a-f0-9]{6}$/);
 const mapping={"maid": "773106", "sailor": "80974e", "gothic": "ffb58f", "mage": "666147", "cyber": "b4bf5d", "idol": "e614f6", "cheer": "190513", "beach": "ab36e8", "nikke-rapi": "313a28", "nikke-anis": "1947f3", "nikke-helm": "173f1e", "nikke-noir": "ce1f18", "overwatch-dva": "70219a", "overwatch-mercy": "7281fe", "overwatch-widow": "8971c9", "overwatch-ashe": "9a01b2", "diablo-sorcerer": "da6901", "diablo-necromancer": "87ad51", "diablo-rogue": "72db9a", "diablo-barbarian": "b3bfdd", "aot-scout": "1a73b4", "aot-captain": "3e20e3", "aot-police": "556b2b", "aot-final": "8f1113", "demon-giyu": "c65204", "demon-shinobu": "9e6184", "demon-rengoku": "8d3d3e", "demon-mitsuri": "6ee320", "jjk-gojo": "07c722", "jjk-nanami": "edf3b8", "jjk-geto": "6c9ecb", "jjk-toji": "a77dd5", "genshin-raiden": "b516a6", "genshin-jean": "752866", "genshin-zhongli": "2056e8", "genshin-diluc": "d69be9", "blue-shiroko": "80bdd0", "blue-hoshino": "4298dc", "blue-yuuka": "c7289e", "blue-aris": "29581e"};
 for(const [old,id] of Object.entries(mapping)){assert.deepEqual(costumeReferenceIds([old],['outfit'],'cosplay'),[id]);assert.deepEqual(costumeReferenceIds([id],['outfit'],'cosplay'),[id]);assert.deepEqual(await readCostumeReference(id),await readCostumeReference(old));assert.throws(()=>costumeReferenceIds([old,id],['outfit'],'cosplay'),code('INVALID_COSTUME_REFERENCES'));}
 for(const id of ['ffffff','__proto__','constructor','../maid']){assert.throws(()=>costumeReferenceIds([id],['outfit'],'cosplay'),code('INVALID_COSTUME_REFERENCES'));await assert.rejects(readCostumeReference(id),code('INVALID_COSTUME_REFERENCES'));}
});

test('outfit mask is optional: original and costume references keep correct order without a guide',async()=>{
 const user=await makeCreator('ainoguide_'+tag);await db.aiPhotoGrant.create({data:{creator_user_id:user,reason:'테스트 허용'}});const id=await media(user);
 for(const combined of [false,true]){
 reset();await photos.edit(user,base({sourceId:id,kind:combined?'combined':'outfit',...(combined?{editKinds:['outfit','background']}:{}),style:'cosplay',costumeIds:['313a28']}));
 const edit=calls.find(c=>c.kind==='edit');assert.equal(edit.images.length,2);assert.match(edit.fields.prompt,/Images 2 through 2/);assert.doesNotMatch(edit.fields.prompt,/pink|masked area|outside the mask/);assert.equal(edit.images[1].type,'image/webp');assert.equal(calls.filter(c=>c.kind==='moderation').length,3);
 }
 reset();await photos.edit(user,base({sourceId:id,kind:'outfit'}));const edit=calls.find(c=>c.kind==='edit');assert.equal(edit.images.length,1);assert.doesNotMatch(edit.fields.prompt,/pink|masked area|outside the mask/);
});

test('paid generation counts are used only after free quota and restored on failed generation',async()=>{const user=await makeCreator('aipaid_'+tag);await db.aiPhotoGrant.create({data:{creator_user_id:user,reason:'횟수권 테스트'}});const id=await media(user),order=await db.aiShopOrder.create({data:{creator_id:user,product_id:'fixture',request_key:crypto.randomUUID(),name:'격리 대역 2회',amount:200,quantity:2,validity_days:30,terms:'test',environment:'test',status:'paid',remaining:2,paid_at:new Date(),expires_at:new Date(Date.now()+86400000)}});reset();await photos.edit(user,base({sourceId:id}));assert.equal((await db.aiShopOrder.findUnique({where:{id:order.id}})).remaining,2);for(let i=1;i<10;i++)await photos.limiter.limit('ai-photo:creator-day:'+user,10,86400);reset();editStatus=500;await assert.rejects(photos.edit(user,base({sourceId:id})));assert.equal((await db.aiShopOrder.findUnique({where:{id:order.id}})).remaining,2);reset();const r=await photos.edit(user,base({sourceId:id}));assert.equal(r.remaining,1);assert.equal((await db.aiShopOrder.findUnique({where:{id:order.id}})).remaining,1);assert.equal(await db.aiShopUse.count({where:{order_id:order.id,status:'consumed'}}),1);assert.equal(await db.aiShopUse.count({where:{order_id:order.id,status:'released'}}),1);});

test('shooting-concept instructions allow selfie/mirror handling in single and combined edits',()=>{const single=aiPhotoPrompt('lens','photo','거울샷');assert.match(single,/mirror selfie/);assert.match(single,/phone-holding pose and mirror reflection/);const combined=aiPhotoPrompt('combined','photo','DSLR 촬영',['pose','lens']);assert.match(combined,/Shooting concept:/);assert.match(combined,/Pose: adjust/);assert.match(combined,/identity/);});

test('heart wallet: threshold, ownership, server-verified clicks, idempotent concurrent settlement and credit restoration',async()=>{
 const h=require('../dist/src/platform/ai-photo-hearts');
 for(const [input,hearts,credits] of [[99,99,0],[100,0,10],[109,9,10],[110,0,11],[115,5,11]])assert.deepEqual(h.heartConversion(input),{hearts,credits});
 const game=await h.createHeartGame(db,creator);await assert.rejects(()=>h.startHeartGame(db,other,game.id));await h.startHeartGame(db,creator,game.id);await assert.rejects(()=>h.startHeartGame(db,creator,game.id));
 await assert.rejects(()=>h.clickHeart(db,other,game.id,1,'x'));await assert.rejects(()=>h.clickHeart(db,creator,game.id,465,'future'));await assert.rejects(()=>h.clickHeart(db,creator,game.id,1.5,'fraction'));
 assert.equal((await h.clickHeart(db,creator,game.id,1,'one')).score,1);assert.equal((await h.clickHeart(db,creator,game.id,1,'one')).score,1);await assert.rejects(()=>h.clickHeart(db,creator,game.id,1,'replay'));assert.equal((await h.clickHeart(db,creator,game.id,0,'blank')).score,0);
 await assert.rejects(()=>h.settleHeartGame(db,creator,game.id));await db.aiHeartGame.update({where:{id:game.id},data:{score:30}});assert.equal((await h.clickHeart(db,creator,game.id,2,'cap')).score,30);
 await db.aiHeartWallet.upsert({where:{user_id:creator},create:{user_id:creator,hearts:85},update:{hearts:85,credits:0}});await h.closeHeartGame(db,creator,game.id);await Promise.all([h.settleHeartGame(db,creator,game.id),h.settleHeartGame(db,creator,game.id)]);let wallet=await h.heartBalance(db,creator);assert.equal(wallet.hearts,5);assert.equal(wallet.credits,11);
 const id=crypto.randomUUID();await h.reserveHeartCredit(db,creator,id);assert.equal((await h.heartBalance(db,creator)).credits,10);await Promise.all([h.finishHeartCredit(db,id,false),h.finishHeartCredit(db,id,false)]);assert.equal((await h.heartBalance(db,creator)).credits,11);
 const id2=crypto.randomUUID();await h.reserveHeartCredit(db,creator,id2);await h.finishHeartCredit(db,id2,true);await h.finishHeartCredit(db,id2,false);assert.equal((await h.heartBalance(db,creator)).credits,10);
 await db.aiHeartUse.deleteMany({where:{user_id:creator}});await db.aiHeartGame.deleteMany({where:{user_id:creator}});await db.aiHeartWallet.deleteMany({where:{user_id:creator}});
});

test('reward credit is usable after daily quota and provider failure restores it; game closes and settles on actual generation',async()=>{
 reset();while((await photos.quota(creator)).remaining>0)await photos.edit(creator,base());
 await db.aiHeartWallet.upsert({where:{user_id:creator},create:{user_id:creator,credits:1,hearts:99},update:{credits:1,hearts:99}});
 assert.equal((await photos.quota(creator)).remaining,1);const game=await photos.hearts(creator,{action:'start'});let sawGame=false;
 photos.fetcher=async(url,init)=>{if(url.endsWith('/images/generations')){await photos.hearts(creator,{action:'click',id:game.id,piece:1,eventId:'during-generation'});sawGame=true;}return stub(url,init)};
 try{const result=await photos.edit(creator,base({heartGameId:game.id}));assert.equal(result.images.length,1);assert.ok(sawGame);const reward=await photos.hearts(creator,{action:'finish',id:game.id});assert.equal(reward.hearts,0);assert.equal(reward.converted,10);assert.equal(reward.credits,10);assert.equal(reward.remaining,10);
 reset();editStatus=500;await assert.rejects(photos.edit(creator,base()),code('PROVIDER_ERROR'));assert.equal((await photos.quota(creator)).rewardRemaining,10);assert.equal((await photos.quota(creator)).paidRemaining,0);
 }finally{photos.fetcher=stub;reset();await db.aiHeartUse.deleteMany({where:{user_id:creator}});await db.aiHeartGame.deleteMany({where:{user_id:creator}});await db.aiHeartWallet.deleteMany({where:{user_id:creator}});}
});

test('aspect ratios map to explicit provider dimensions; unknown ratio rejected before provider',async()=>{
 reset();
 await assert.rejects(photos.edit(creator,base({aspectRatio:'bogus'})),code('INVALID_ASPECT_RATIO'));assert.equal(calls.length,0);
 // Separate fresh allowed creator avoids interference with earlier daily-limit tests.
 const who=await makeCreator('ratio_'+tag);await db.aiPhotoGrant.create({data:{creator_user_id:who,reason:'비율 QA'}});const id=await media(who);
 for(const [aspectRatio,size] of Object.entries({'1:1':'1024x1024','4:5':'1024x1280','3:4':'960x1280','9:16':'864x1536','16:9':'1536x864'})){
  reset();await photos.edit(who,base({sourceId:id,aspectRatio}));assert.equal(calls.find(c=>c.kind==='edit').fields.size,size);
 }
});

test('crop persists exact dimensions with AI metadata without provider calls or quota use; rejects foreign and invalid areas',async()=>{
 reset();const id=await media(creator,600,900);await db.media.update({where:{id},data:{metadata:{aiGenerated:true,aiSourceId:sourceId}}});
 const before=await photos.quota(creator),bytes=fs.readFileSync(path.join(mediaRoot,id));
 const result=await photos.crop(creator,{sourceId:id,left:100,top:200,width:400,height:500});
 const saved=await db.media.findUnique({where:{id:result.id}}),dim=await sharp(fs.readFileSync(path.join(mediaRoot,result.id))).metadata();
 assert.deepEqual([dim.width,dim.height],[400,500]);assert.equal(saved.metadata.aiGenerated,true);assert.equal(saved.metadata.aiSourceId,sourceId);assert.equal(saved.metadata.croppedFrom,id);assert.equal(saved.user_sub,creator);assert.equal((await photos.quota(creator)).remaining,before.remaining);assert.equal(calls.length,0);assert.deepEqual(fs.readFileSync(path.join(mediaRoot,id)),bytes);
 await assert.rejects(photos.crop(other,{sourceId:id,left:0,top:0,width:100,height:100}),code('MEDIA_NOT_FOUND'));
 await assert.rejects(photos.crop(creator,{sourceId,left:0,top:0,width:100,height:100}),code('INVALID_CROP_SOURCE'));
 for(const patch of [{left:-1},{left:.5},{left:'1'},{width:0},{width:601},{height:901},{top:899}])await assert.rejects(photos.crop(creator,{sourceId:id,left:0,top:0,width:100,height:100,...patch}),code('INVALID_CROP'));
});

test('private photo library: save, search, category edit and remove preserve media and other metadata',async()=>{
 const who=await makeCreator('library_'+tag);await db.aiPhotoGrant.create({data:{creator_user_id:who,reason:'보관함 QA'}});const id=await media(who);
 await db.media.update({where:{id},data:{metadata:{aiGenerated:true,keep:'original'}}});
 const saved=await photos.saveLibrary(who,{id,title:'  의자에 앉기  ',category:'pose'});assert.equal(saved.title,'의자에 앉기');assert.equal(saved.category,'pose');assert.equal(saved.aiGenerated,true);
 const cropped=await photos.crop(who,{sourceId:id,left:0,top:0,width:100,height:100});assert.equal((await db.media.findUnique({where:{id:cropped.id}})).metadata.aiLibrary,undefined);assert.equal((await photos.library(who,{})).items.length,1,'cropping does not silently duplicate a library entry');
 assert.equal((await photos.library(who,{q:'의자',category:'pose'})).items[0].id,id);assert.equal((await photos.library(creator,{q:'의자'})).items.some(x=>x.id===id),false);
 await photos.saveLibrary(who,{id,title:'낮은 구도',category:'camera'});assert.equal((await photos.library(who,{category:'pose'})).items.length,0);assert.equal((await photos.library(who,{category:'camera'})).items[0].id,id);
 await assert.rejects(photos.saveLibrary(creator,{id,title:'타인',category:'pose'}),code('MEDIA_NOT_FOUND'));
 await assert.rejects(photos.saveLibrary(who,{id,title:'x',category:'unknown'}),code('INVALID_LIBRARY_ASSET'));
 await assert.rejects(photos.library(who,{page:-1}),code('INVALID_LIBRARY_FILTER'));
 await photos.saveLibrary(who,{id,remove:true});assert.equal((await photos.library(who,{})).items.length,0);const row=await db.media.findUnique({where:{id}});assert.equal(row.is_deleted,false);assert.equal(row.metadata.keep,'original');assert.equal(row.metadata.aiGenerated,true);
});

test('library photos are real image references, individually moderated and numbered by category',async()=>{
 reset();const who=await makeCreator('ref_'+tag);await db.aiPhotoGrant.create({data:{creator_user_id:who,reason:'참고사진 QA'}});const original=await media(who),pose=await media(who,500,700),background=await media(who,900,600);
 await photos.saveLibrary(who,{id:pose,title:'PRIVATE_TITLE_NEVER_PROMPT',category:'pose'});await photos.saveLibrary(who,{id:background,title:'배경 예시',category:'background'});
 await photos.edit(who,base({sourceId:original,kind:'combined',editKinds:['pose','background'],libraryIds:JSON.stringify([pose,background])}));
 const request=calls.find(x=>x.kind==='edit');assert.equal(request.images.length,3);assert.match(request.fields.prompt,/Image 2 is a personal pose reference/);assert.match(request.fields.prompt,/Image 3 is a personal background reference/);assert.doesNotMatch(request.fields.prompt,/costume references|PRIVATE_TITLE/);
 const expected=await sharp(fs.readFileSync(path.join(mediaRoot,pose))).rotate().resize({width:1536,height:1536,fit:'inside',withoutEnlargement:true}).webp().toBuffer();assert.deepEqual(request.images[1].bytes,expected);assert.equal(calls.filter(x=>x.kind==='moderation').length,4);
 reset();await photos.edit(who,base({sourceId:original,kind:'combined',editKinds:['outfit','background'],style:'cosplay',costumeIds:['b4bf5d'],libraryIds:[background]}),await mask());const mixed=calls.find(x=>x.kind==='edit');assert.equal(mixed.images.length,4);assert.match(mixed.fields.prompt,/Images 3 through 3 are costume references/);assert.match(mixed.fields.prompt,/Image 4 is a personal background reference/);
 reset();await assert.rejects(photos.edit(who,base({sourceId:original,libraryIds:[otherSourceId]})),code('LIBRARY_ASSET_NOT_FOUND'));assert.equal(calls.length,0);
 await assert.rejects(photos.edit(who,base({sourceId:original,libraryIds:[pose,background,sourceId,otherSourceId,original]})),code('INVALID_LIBRARY_REFERENCES'));
 await assert.rejects(photos.edit(who,base({sourceId:original,libraryIds:[background]})),code('INVALID_LIBRARY_REFERENCES'));
 await assert.rejects(photos.edit(who,base({sourceId:original,libraryIds:[pose,pose]})),code('INVALID_LIBRARY_REFERENCES'));
 await photos.saveLibrary(who,{id:pose,remove:true});await assert.rejects(photos.edit(who,base({sourceId:original,libraryIds:[pose]})),code('LIBRARY_ASSET_NOT_FOUND'));assert.equal(calls.length,0);
 reset();flags=[false,true];const before=(await photos.quota(who)).remaining;await assert.rejects(photos.edit(who,base({sourceId:original,kind:'background',libraryIds:[background]})),code('UNSAFE_INPUT'));assert.equal(calls.filter(x=>x.kind==='edit').length,0);assert.equal((await photos.quota(who)).remaining,before-1,'existing unsafe-input charging policy is preserved');
});

test('public backgrounds attach exact catalog bytes, moderate independently and reject invalid or conflicting choices',async()=>{
 reset();const who=await makeCreator('publicbg_'+tag);await db.aiPhotoGrant.create({data:{creator_user_id:who,reason:'공용배경 QA'}});const id=await media(who);
 await photos.edit(who,base({sourceId:id,kind:'background',backgroundId:'b7a101'}));
 const request=calls.find(x=>x.kind==='edit');assert.equal(request.images.length,2);assert.match(request.fields.prompt,/Image 2 is a public background reference/);assert.deepEqual(request.images[1].bytes,fs.readFileSync(path.join(__dirname,'../dist/src/platform/ai-photo-backgrounds/b7a101.webp')));assert.equal(calls.filter(x=>x.kind==='moderation').length,3);
 reset();for(const value of ['../../secret','unknown',[],null])await assert.rejects(photos.edit(who,base({sourceId:id,kind:'background',backgroundId:value})),code('INVALID_BACKGROUND_REFERENCE'));
 await assert.rejects(photos.edit(who,base({sourceId:id,kind:'pose',backgroundId:'b7a101'})),code('INVALID_BACKGROUND_REFERENCE'));assert.equal(calls.length,0);
 const privateId=await media(who);await photos.saveLibrary(who,{id:privateId,title:'개인 배경',category:'background'});await assert.rejects(photos.edit(who,base({sourceId:id,kind:'background',backgroundId:'b7a101',libraryIds:[privateId]})),code('INVALID_BACKGROUND_REFERENCE'));assert.equal(calls.length,0);
 await photos.edit(who,base({sourceId:id,kind:'combined',editKinds:['outfit','background'],style:'cosplay',costumeIds:['b4bf5d'],backgroundId:'b7a102'}),await mask());assert.match(calls.find(x=>x.kind==='edit').fields.prompt,/Image 4 is a public background reference/);
 reset();flags=[false,true];await assert.rejects(photos.edit(who,base({sourceId:id,kind:'background',backgroundId:'b7a103'})),code('UNSAFE_INPUT'));assert.equal(calls.filter(x=>x.kind==='edit').length,0);
});

test('second public background batch is packaged and sends all nine reference files',async()=>{
 const who=await makeCreator('bgsecond_'+tag);await db.aiPhotoGrant.create({data:{creator_user_id:who,reason:'추가배경 QA'}});const sourceId=await media(who);
 for(let n=1;n<=9;n++){reset();const id='c8b20'+n;await photos.edit(who,base({sourceId,kind:'background',backgroundId:id}));const sent=calls.find(x=>x.kind==='edit');assert.deepEqual(sent.images[1].bytes,fs.readFileSync(path.join(__dirname,'../dist/src/platform/ai-photo-backgrounds/'+id+'.webp')));assert.match(sent.fields.prompt,/Image 2 is a public background reference/);}
});

test('third public background batch sends all six packaged reference files',async()=>{
 const who=await makeCreator('bgthird_'+tag);await db.aiPhotoGrant.create({data:{creator_user_id:who,reason:'추가배경 QA'}});const sourceId=await media(who);
 for(let n=1;n<=6;n++){reset();const id='d9c30'+n;await photos.edit(who,base({sourceId,kind:'background',backgroundId:id}));const sent=calls.find(x=>x.kind==='edit');assert.deepEqual(sent.images[1].bytes,fs.readFileSync(path.join(__dirname,'../dist/src/platform/ai-photo-backgrounds/'+id+'.webp')));assert.match(sent.fields.prompt,/Image 2 is a public background reference/);}
});
