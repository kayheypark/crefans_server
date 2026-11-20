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
async function stub(url,init,expectedModel=photos.settings.model){
 if(url.endsWith('/moderations')){const body=JSON.parse(init.body);calls.push({kind:'moderation',body});if(body.input.filter(i=>i.type==='image_url').length>1)return new Response(JSON.stringify({error:{code:'too_many_images'}}),{status:400});if(moderationDown)return new Response('{}',{status:503});const f=flags.length?flags.shift():false;return new Response(JSON.stringify({results:[{flagged:f}]}),{status:200});}
 if(url.endsWith('/images/generations')){const fields=JSON.parse(init.body),entry={kind:'edit',fields,images:fields.image.map(value=>({type:value.slice(5,value.indexOf(';')),bytes:Buffer.from(value.split(',')[1],'base64')}))};assert.equal(fields.model,expectedModel);calls.push(entry);
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
 // 2026-11-18: provider-call cap/cost counters are per KST day in the shared e2e DB; each run counts under its own day key.
 photos.costDay=()=>'run-'+tag;
});
after(async()=>{await app?.close();try{await db.aiHeartUse.deleteMany({where:{user_id:{in:members}}});await db.aiHeartGame.deleteMany({where:{user_id:{in:members}}});await db.aiHeartWallet.deleteMany({where:{user_id:{in:members}}});await db.aiShopUse.deleteMany({where:{creator_id:{in:members}}});await db.aiShopOrder.deleteMany({where:{creator_id:{in:members}}});const made=await db.media.findMany({where:{user_sub:{in:members}},select:{id:true}});await db.media.deleteMany({where:{id:{in:made.map(m=>m.id)}}});await db.aiPhotoGrant.deleteMany({where:{creator_user_id:{in:members}}});await db.creator.deleteMany({where:{user_id:{in:members}}});await db.member.deleteMany({where:{id:{in:members}}});fs.rmSync(mediaRoot,{recursive:true,force:true});}finally{await db.$disconnect();await release?.();}});

test('2026-11-16: every member may use AI photo editing (no allow-list); a grant row changes nothing',async()=>{
 reset();{const q=await photos.quota(creator);assert.deepEqual([q.allowed,q.limit,q.remaining],[true,10,10]);assert.ok(q.typicalSeconds===null||Number.isInteger(q.typicalSeconds));}
 await db.aiPhotoGrant.create({data:{creator_user_id:creator,reason:'테스트 허용'}});
 {const q=await photos.quota(creator);assert.deepEqual([q.allowed,q.limit,q.remaining],[true,10,10]);}
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
 assert.equal(AI_PHOTO_COSTUME_IDS.length,353);
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
  assert.equal(payload.size,'1024x1536');assert.equal(payload.response_format,'b64_json');assert.equal(payload.watermark,false);assert.equal(payload.background,'opaque');assert.match(payload.prompt,/Images 3 through 3/);assert.ok(payload.prompt.includes(require('../dist/src/platform/ai-photo').COSTUME_DETAIL_RULE),'costume fidelity rule from the first request');
  for(const unsupported of ['n','mask','quality','moderation','sequential_image_generation'])assert.equal(unsupported in payload,false);
  assert.equal(calls.filter(c=>c.kind==='moderation').length,3);
  assert.equal((await db.media.findUniqueOrThrow({where:{id:r.images[0].id}})).metadata.aiModel,'dola-seedream-5-5-261028');
  reset();await photos.edit(user,base({sourceId:id,mode:'cosplay',kind:'outfit',style:'photo'}),await mask());assert.equal(payload.image.length,2);assert.doesNotMatch(payload.prompt,/Costume fidelity/,'plain outfit edits without references keep the old prompt');assert.match(payload.prompt,/pink clothing-region guide/);assert.doesNotMatch(payload.prompt,/transparent masked area/);
  reset();payload=null;flags=[true];await assert.rejects(photos.edit(user,request,await mask()),code('UNSAFE_INPUT'));assert.equal(payload,null);
  reset();flags=[false,false,true];await assert.rejects(photos.edit(user,request,await mask()),code('UNSAFE_OUTPUT'));
  reset();const left=(await photos.quota(user)).remaining;photos.fetcher=async(url,init)=>url.endsWith('/moderations')?stub(url,init):new Response('{}',{status:503});await assert.rejects(photos.edit(user,request,await mask()),code('PROVIDER_ERROR'));assert.equal((await photos.quota(user)).remaining,left);
  // 2026-11-17: a Seedream output block gives the try back and offers a retry; requests naming stocking/see-through materials
  // are retried once with the approved stocking wording before that.
  const blocked=()=>new Response(JSON.stringify({error:{code:'OutputImageSensitiveContentDetected.PolicyViolation'}}),{status:400});let prompts=[];
  reset();let before=(await photos.quota(user)).remaining;photos.fetcher=async(url,init)=>{if(url.endsWith('/moderations'))return stub(url,init);prompts.push(JSON.parse(init.body).prompt);return blocked();};
  await assert.rejects(photos.edit(user,request,await mask()),code('PROVIDER_OUTPUT_BLOCKED'));assert.equal(prompts.length,1,'no stocking words: no rewritten retry');assert.equal((await photos.quota(user)).remaining,before,'the try is given back');
  const {STOCKING_CLAUSE}=require('../dist/src/platform/ai-photo'),stocking={...request,prompt:'검정 시스루 전신 슈트와 흰 사이하이 스타킹으로 바꿔줘'};
  reset();prompts=[];before=(await photos.quota(user)).remaining;
  await assert.rejects(photos.edit(user,stocking,await mask()),code('OUTPUT_MATERIAL_BLOCKED'));assert.equal(prompts.length,2,'one rewritten retry');
  assert.doesNotMatch(prompts[0],/25데니어/);assert.ok(prompts[1].includes(STOCKING_CLAUSE));assert.doesNotMatch(prompts[1],/시스루/);assert.match(prompts[1],/반투명 나일론 전신 슈트/);
  assert.equal((await photos.quota(user)).remaining,before,'still not used up after both blocks');
  reset();prompts=[];photos.fetcher=async(url,init)=>{if(url.endsWith('/moderations'))return stub(url,init);prompts.push(JSON.parse(init.body).prompt);return prompts.length===1?blocked():new Response(JSON.stringify({data:[{b64_json:(await png(1024,1536)).toString('base64')}]}));};
  const ok=await photos.edit(user,stocking,await mask());assert.equal(ok.images.length,1,'the rewritten retry result reaches the member');assert.equal(prompts.length,2);
  // Wardrobe picks send only the costume ID, including the restored Mitsuri preset.
  reset();prompts=[];photos.fetcher=async(url,init)=>{if(url.endsWith('/moderations'))return stub(url,init);prompts.push(JSON.parse(init.body).prompt);return blocked();};
  await assert.rejects(photos.edit(user,{...request,prompt:'의상 참조 사진 1의 코디를 적용해줘.',costumeIds:['6ee320']},await mask()),code('OUTPUT_MATERIAL_BLOCKED'));assert.equal(prompts.length,2);assert.ok(prompts[1].includes(STOCKING_CLAUSE));
  // 네 after a refusal: one request, already with the improved wording (and the stocking clause when it applies)
  const {IMPROVED_PHOTO_CLAUSE}=require('../dist/src/platform/ai-photo');reset();prompts=[];
  await assert.rejects(photos.edit(user,{...request,retryImproved:'true'},await mask()),code('PROVIDER_OUTPUT_BLOCKED'));assert.equal(prompts.length,1,'no extra automatic retry');assert.ok(prompts[0].includes(IMPROVED_PHOTO_CLAUSE));assert.ok(!prompts[0].includes(STOCKING_CLAUSE));
  reset();prompts=[];await assert.rejects(photos.edit(user,{...stocking,retryImproved:true},await mask()),code('OUTPUT_MATERIAL_BLOCKED'));assert.equal(prompts.length,1);assert.ok(prompts[0].includes(STOCKING_CLAUSE)&&prompts[0].includes(IMPROVED_PHOTO_CLAUSE));
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
  assert.doesNotMatch(JSON.stringify(rows),/trace-private-marker|base64|test-key/);{// 2026-11-16 user decision: successful prompts are kept too, encrypted for 30 days and marked as succeeded.
   const kept=await db.aiPhotoFailureDetail.findUnique({where:{request_id:requestId}});assert.ok(kept,'successful prompt is kept');assert.doesNotMatch(kept.payload_encrypted,/trace-private-marker/);assert.ok(kept.expires_at-Date.now()>29*86400000);
   const {PaymentProvider}=require('../dist/src/platform/payment-provider');const decoded=JSON.parse(new PaymentProvider(app.get(require('@nestjs/config').ConfigService)).decrypt(kept.payload_encrypted));assert.equal(decoded.outcome,'succeeded');assert.equal(typeof decoded.prompt,'string');assert.ok(decoded.count>=1);}
  const list=await adminLogs(db,admin,{aiAttempts:'true',requestId});assert.equal(list.total,1);assert.equal(list.items[0].aiAttempt.status,'succeeded');assert.deepEqual(list.items[0].aiAttempt.attemptedModels,['omni-moderation-latest','dola-seedream-5-5-261028']);const detail=await adminLogDetail(db,admin,start.id,new ConfigService());assert.equal(detail.aiAttempt.events.length,rows.length);assert.equal(detail.aiFailure.state,'available');assert.equal(detail.aiFailure.outcome,'succeeded');assert.equal(typeof detail.aiFailure.prompt,'string');
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
 assert.equal(AI_PHOTO_COSTUME_IDS.length,353);assert.equal(new Set(AI_PHOTO_COSTUME_IDS).size,353);for(const id of AI_PHOTO_COSTUME_IDS)assert.match(id,/^[a-f0-9]{6}$/);
 const mapping={"maid": "773106", "sailor": "80974e", "gothic": "ffb58f", "mage": "666147", "cyber": "b4bf5d", "idol": "e614f6", "cheer": "190513", "beach": "ab36e8", "nikke-rapi": "313a28", "nikke-anis": "1947f3", "nikke-helm": "173f1e", "nikke-noir": "ce1f18", "overwatch-dva": "70219a", "overwatch-mercy": "7281fe", "overwatch-widow": "8971c9", "overwatch-ashe": "9a01b2", "diablo-sorcerer": "da6901", "diablo-necromancer": "87ad51", "diablo-rogue": "72db9a", "diablo-barbarian": "b3bfdd", "aot-scout": "1a73b4", "aot-captain": "3e20e3", "aot-police": "556b2b", "aot-final": "8f1113", "demon-giyu": "c65204", "demon-shinobu": "9e6184", "demon-rengoku": "8d3d3e", "demon-mitsuri": "6ee320", "jjk-gojo": "07c722", "jjk-nanami": "edf3b8", "jjk-geto": "6c9ecb", "jjk-toji": "a77dd5", "genshin-raiden": "b516a6", "genshin-jean": "752866", "genshin-zhongli": "2056e8", "genshin-diluc": "d69be9", "blue-shiroko": "80bdd0", "blue-hoshino": "4298dc", "blue-yuuka": "c7289e", "blue-aris": "29581e"};
 const {HIDDEN_COSTUME_IDS}=require('../dist/src/platform/ai-photo-costume-references');
 for(const [old,id] of Object.entries(mapping)){if(HIDDEN_COSTUME_IDS.has(id)){assert.throws(()=>costumeReferenceIds([old],['outfit'],'cosplay'),code('COSTUME_UNAVAILABLE'));continue;}assert.deepEqual(costumeReferenceIds([old],['outfit'],'cosplay'),[id]);assert.deepEqual(costumeReferenceIds([id],['outfit'],'cosplay'),[id]);assert.deepEqual(await readCostumeReference(id),await readCostumeReference(old));assert.throws(()=>costumeReferenceIds([old,id],['outfit'],'cosplay'),code('INVALID_COSTUME_REFERENCES'));}
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
 assert.equal((await photos.library(who,{q:'의자',category:'pose'})).items[0].id,id);assert.equal((await photos.library(who,{category:'pose'})).total,1,'2026-11-15: total counts the filter');assert.equal((await photos.library(who,{category:'background'})).total,0);assert.equal((await photos.library(creator,{q:'의자'})).items.some(x=>x.id===id),false);
 await photos.saveLibrary(who,{id,title:'낮은 구도',category:'camera'});assert.equal((await photos.library(who,{category:'pose'})).items.length,0);assert.equal((await photos.library(who,{category:'camera'})).items[0].id,id);
 await assert.rejects(photos.saveLibrary(creator,{id,title:'타인',category:'pose'}),code('MEDIA_NOT_FOUND'));
 await assert.rejects(photos.saveLibrary(who,{id,title:'x',category:'unknown'}),code('INVALID_LIBRARY_ASSET'));
 await assert.rejects(photos.library(who,{page:-1}),code('INVALID_LIBRARY_FILTER'));
 await photos.saveLibrary(who,{id,remove:true});assert.equal((await photos.library(who,{})).items.length,0);assert.equal((await photos.library(who,{})).total,0);const row=await db.media.findUnique({where:{id}});assert.equal(row.is_deleted,false);assert.equal(row.metadata.keep,'original');assert.equal(row.metadata.aiGenerated,true);
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

const floorPose='바닥에 편하게 앉아 쉬는 포즈로 바꿔줘.';
const compositeRequest=sourceId=>base({
 sourceId,mode:'cosplay',kind:'combined',style:'cosplay',editKinds:['outfit','pose'],costumeIds:['d63f76'],
 prompt:['의상 참조 사진 1의 코디를 적용해줘.',floorPose].join('\r\n'),
});
const compositeInstruction='Image 2 is a service-created costume and pose reference.';

async function useTestComposite(t,approvedPose=floorPose,approvedCostumeId='d63f76'){
 const registry=require('../dist/src/platform/ai-photo-composite-bases');
 const image=await sharp(await png(72,90)).webp().toBuffer();
 t.mock.method(registry,'readCostumeCompositeBase',async(id,request,hasPose)=>{
  const matchesPose=hasPose?approvedPose&&request.split(/\r?\n/).includes(approvedPose):approvedPose==='';
  return id===approvedCostumeId&&matchesPose?image:null;
 });
 return image;
}

test('approved composite uses the member or guest original, then shared base, then optional public background',async t=>{
 const shared=await useTestComposite(t);
 const owner=await makeCreator('composite_'+tag);
 const visitor='guest:'+crypto.randomBytes(20).toString('hex');
 const background=await require('../dist/src/platform/ai-photo-background-references').readBackgroundReference('b7a101');
 t.after(()=>db.media.deleteMany({where:{user_sub:visitor}}));
 const ownId=await media(owner);
 for(const [actor,id,guest] of [[owner,ownId,undefined],[visitor,await media(visitor,720,900),{ipHash:'composite-'+tag}]]){
  const input=compositeRequest(id);
  if(guest){input.editKinds.push('background');input.backgroundId='b7a101';}
  reset();
  const result=await photos.edit(actor,input,undefined,guest);
  const edit=calls.find(entry=>entry.kind==='edit');
  assert.ok(edit.fields.prompt.includes(compositeInstruction));
  assert.match(edit.fields.prompt,/Image 1 is the only source for facial identity/);
  const original=await sharp(fs.readFileSync(path.join(mediaRoot,id))).rotate().png().toBuffer();
  const expected=guest?[original,shared,background]:[original,shared];
  assert.deepEqual(edit.images.map(item=>item.bytes),expected);
  assert.deepEqual(calls.map(c=>c.kind),[...expected.map(()=>'moderation'),'edit','moderation']);
  for(const [i,bytes] of expected.entries()){
   const checked=calls[i].body.input.find(item=>item.type==='image_url').image_url.url;
   assert.equal(checked.split(',')[1],bytes.toString('base64'));
  }
  if(guest)assert.match(edit.fields.prompt,/Image 3 is a public background reference/);
  const saved=await db.media.findUniqueOrThrow({where:{id:result.images[0].id}});
  assert.equal(saved.user_sub,actor);
  assert.equal(saved.metadata.aiSourceId,id);
 }
 const trace=await db.platformAuditLog.findMany({where:{actor_id:owner,action:'ai-photo.step.started',
  metadata:{path:'$.operation',equals:'input'}},orderBy:{occurred_at:'asc'}});
 assert.deepEqual(trace.map(row=>row.metadata.source),['original','costume-composite-base']);
 reset();
 await assert.rejects(photos.edit(visitor,compositeRequest(ownId),undefined,{ipHash:'composite-'+tag}),code('MEDIA_NOT_FOUND'));
 assert.equal(calls.length,0);
});

test('outfit-only composite explicitly keeps the original pose and framing',async t=>{
 const shared=await useTestComposite(t,'');
 const owner=await makeCreator('comp_outfit'+tag),id=await media(owner);
 const request={...compositeRequest(id),kind:'outfit',editKinds:undefined,prompt:'의상 참조 사진 1의 코디를 적용해줘.'};
 reset();
 await photos.edit(owner,request);
 const edit=calls.find(entry=>entry.kind==='edit');
 assert.deepEqual(edit.images[1].bytes,shared);
 assert.match(edit.fields.prompt,/Image 2 is a service-created costume reference/);
 assert.match(edit.fields.prompt,/Keep the pose and framing from image 1/);
 assert.doesNotMatch(edit.fields.prompt,/and requested pose/);
 reset();
 await photos.edit(owner,compositeRequest(id));
 assert.match(calls.find(entry=>entry.kind==='edit').fields.prompt,/Do not copy the reference mannequin/);
});

test('approved composite is subject to input and output moderation',async t=>{
 await useTestComposite(t);
 const owner=await makeCreator('comp_gate'+tag),id=await media(owner);
 for(const [verdicts,error,expected] of [
  [[true],'UNSAFE_INPUT',['moderation']],
  [[false,true],'UNSAFE_INPUT',['moderation','moderation']],
  [[false,false,true],'UNSAFE_OUTPUT',['moderation','moderation','edit','moderation']],
 ]){
  reset();flags=[...verdicts];
  await assert.rejects(photos.edit(owner,compositeRequest(id)),code(error));
  assert.deepEqual(calls.map(c=>c.kind),expected);
 }
 assert.equal(await db.media.count({where:{user_sub:owner}}),1);
});

test('unapproved costume with a pose, and combinations outside composite scope, use the regular mannequin prompt and bytes',async t=>{
 const {readCostumeReference}=require('../dist/src/platform/ai-photo-costume-references');
 const owner=await makeCreator('comp_miss'+tag),id=await media(owner),privatePose=await media(owner);
 await photos.saveLibrary(owner,{id:privatePose,title:'포즈',category:'pose'});
 const verify=async(overrides,guide)=>{
  reset();
  const request={...compositeRequest(id),...overrides};
  await photos.edit(owner,request,guide);
  const edit=calls.find(c=>c.kind==='edit');
  assert.ok(!edit.fields.prompt.includes(compositeInstruction));
  assert.match(edit.fields.prompt,/Do not copy the reference mannequin/);
  assert.deepEqual(edit.images[guide?2:1].bytes,await readCostumeReference(request.costumeIds[0]));
 };
 await verify({costumeIds:['6ee320']}); // Real catalog: Mitsuri has no validated composite.
 await useTestComposite(t);
 await verify({prompt:'자연스럽게 서 있는 포즈로 바꿔줘.'});
 await verify({prompt:floorPose+'\n한 손을 들어 가볍게 인사해줘.'});
 await verify({libraryIds:[privatePose]});
 await verify({mode:'general'});
 await verify({costumeIds:['d63f76','313a28']});
 await verify({},await mask());
 await verify({kind:'outfit',editKinds:undefined});
});

test('repeated failures queue one preset and a later member success records only the approved studio base',async t=>{
 const {AI_PHOTO_COSTUME_IDS}=require('../dist/src/platform/ai-photo-costume-references');
 const existing=await db.$queryRaw`SELECT costume_id FROM ai_costume_fit_reviews WHERE pose=${floorPose}`;
 const seen=new Set(existing.map(row=>row.costume_id));
 const costumeId=AI_PHOTO_COSTUME_IDS.find(id=>!seen.has(id));
 assert.ok(costumeId,'a new costume and pose combination in the isolated database');
 t.after(()=>db.$executeRaw`DELETE FROM ai_costume_fit_reviews WHERE costume_id=${costumeId} AND pose=${floorPose}`);
 const owner=await makeCreator('comp_queue'+tag),id=await media(owner);
 const request={...compositeRequest(id),costumeIds:[costumeId]};
 for(let i=0;i<2;i++){
  reset();editStatus=400;providerError={code:'moderation_blocked',moderation_details:{moderation_stage:'output'}};
  await assert.rejects(photos.edit(owner,request),code('UNSAFE_OUTPUT'));
 }
 const rows=()=>db.$queryRaw`SELECT policy_failures,fitting_failures,verified_base_sha256,last_verified_at FROM ai_costume_fit_reviews WHERE costume_id=${costumeId} AND pose=${floorPose}`;
 const pending=await rows();
 assert.deepEqual(pending.map(row=>[Number(row.policy_failures),Number(row.fitting_failures),row.verified_base_sha256,row.last_verified_at]),[[2,0,null,null]]);

 const nextOwner=await makeCreator('comp_next'+tag),nextSource=await media(nextOwner,720,900);
 const nextRequest={...request,sourceId:nextSource};
 reset();
 await photos.edit(nextOwner,nextRequest);
 assert.equal((await rows())[0].verified_base_sha256,null,'ordinary mannequin generation leaves review pending');
 const shared=await useTestComposite(t,floorPose,costumeId);
 reset();flags=[false,false,true];
 await assert.rejects(photos.edit(nextOwner,nextRequest),code('UNSAFE_OUTPUT'));
 assert.equal((await rows())[0].verified_base_sha256,null,'blocked composite output was never saved');
 reset();
 const generated=await photos.edit(nextOwner,nextRequest);
 const edit=calls.find(entry=>entry.kind==='edit');
 assert.deepEqual(edit.images[1].bytes,shared);
 const saved=await db.media.findUniqueOrThrow({where:{id:generated.images[0].id}});
 assert.equal(saved.user_sub,nextOwner);
 assert.equal(saved.metadata.aiSourceId,nextSource);
 const [verified]=await rows();
 assert.equal(Number(verified.policy_failures),3);
 assert.equal(verified.verified_base_sha256,crypto.createHash('sha256').update(shared).digest('hex'));
 assert.ok(verified.last_verified_at instanceof Date);
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

test('every public background reference id resolves to a 1024x1536 WebP, including the X-likes batch',async()=>{
 const {readBackgroundReference,backgroundReferenceId}=require('../dist/src/platform/ai-photo-background-references');
 const ids=['b7a101','b7a102','b7a103','b7a104','b7a105','b7a106','b7a107','c8b201','c8b202','c8b203','c8b204','c8b205','c8b206','c8b207','c8b208','c8b209','d9c301','d9c302','d9c303','d9c304','d9c305','d9c306',...Array.from({length:16},(_,i)=>'ead4'+String(i+1).padStart(2,'0')),...Array.from({length:94},(_,i)=>'fb50'+String(i+1).padStart(2,'0'))];
 assert.equal(ids.length,132);
 for(const id of ids){const m=await sharp(await readBackgroundReference(id)).metadata();assert.equal(m.format,'webp');assert.equal(m.width,1024);assert.equal(m.height,1536);}
 assert.throws(()=>backgroundReferenceId('ead417',['background']),/배경을 다시 선택/);assert.throws(()=>backgroundReferenceId('fb5095',['background']),/배경을 다시 선택/);
});

test('heart rewards stop at 100 hearts per member per KST day (2026-11-15 ask-me)',async()=>{
 const h=require('../dist/src/platform/ai-photo-hearts');assert.equal(h.AI_HEART_DAILY_CAP,100);
 const member=crypto.randomUUID();await db.creator.create({data:{user_id:member,is_active:true}}).catch(()=>{});
 await db.aiHeartWallet.upsert({where:{user_id:member},create:{user_id:member,hearts:0},update:{hearts:0,credits:0}});
 const play=async score=>{const g=await db.aiHeartGame.create({data:{id:crypto.randomUUID(),user_id:member,kinds:[],clicks:[],score,status:'ended'}});return h.settleHeartGame(db,member,g.id);};
 const results=[];for(let i=0;i<4;i++)results.push(await play(30));
 assert.deepEqual(results.map(r=>r.earned),[30,30,30,10],'the fourth game is cut to the remaining 10');assert.equal(results[3].capped,true);
 const after=await play(30);assert.equal(after.earned,0);assert.equal(after.capped,true);
 const w=await h.heartBalance(db,member);assert.equal(w.hearts+w.credits*10,100,'exactly 100 hearts credited today');
 const yesterday=new Date(Date.now()-36*3600000);await db.aiHeartGame.updateMany({where:{user_id:member},data:{created_at:yesterday}});assert.equal((await play(30)).earned,30,'a new KST day starts fresh');
 await db.aiHeartGame.deleteMany({where:{user_id:member}});await db.aiHeartWallet.deleteMany({where:{user_id:member}});await db.creator.deleteMany({where:{user_id:member}}).catch(()=>{});
});

// 2026-11-17 user decision: blocked outputs give the try back at most BLOCKED_GIVEBACK_DAILY times a day per member; the next
// block counts the try and says so, so a refused request cannot be repeated without limit on the provider.
test('blocked-output give-backs stop after the daily cap and the next block uses the try',async()=>{
 const saved={...photos.settings},previous=photos.fetcher,{BLOCKED_GIVEBACK_DAILY}=require('../dist/src/platform/ai-photo');
 const user=await makeCreator('aicap_'+tag);const id=await media(user);
 try{
  Object.assign(photos.settings,{seedreamKey:'seedream-test-key'});
  photos.fetcher=async(url,init)=>url.endsWith('/moderations')?stub(url,init):new Response(JSON.stringify({error:{code:'OutputImageSensitiveContentDetected.PolicyViolation'}}),{status:400});
  const request=base({sourceId:id,mode:'cosplay',kind:'outfit',style:'cosplay',costumeIds:['blue-shiroko']});
  const start=(await photos.quota(user)).remaining;assert.equal(BLOCKED_GIVEBACK_DAILY,5);
  for(let n=0;n<BLOCKED_GIVEBACK_DAILY;n++){reset();await assert.rejects(photos.edit(user,request,await mask()),code('PROVIDER_OUTPUT_BLOCKED'));}
  assert.equal((await photos.quota(user)).remaining,start,'the first five blocks give the try back');
  reset();await assert.rejects(photos.edit(user,request,await mask()),code('OUTPUT_BLOCKED_LIMIT'));
  assert.equal((await photos.quota(user)).remaining,start-1,'past the cap the try is used');
 }finally{Object.assign(photos.settings,saved);photos.fetcher=previous;}
});

// 2026-11-17: paid uses are serialized on the member row, so a member without a creators row cannot spend one balance twice.
test('two concurrent paid reservations by a non-creator member use one remaining count once',async()=>{
 const {reservePaidPhoto}=require('../dist/src/platform/ai-shop');const id=crypto.randomUUID();members.push(id);
 await db.member.create({data:{id,email:id+'@ai-photo-edit.test.invalid',name:'AI 동시성 QA',nickname:'AI 동시성 QA',preferred_username:'aiconc_'+tag,password_hash:'unused',email_verified:true,status:'CONFIRMED'}});
 assert.equal(await db.creator.findUnique({where:{user_id:id}}),null);
 const order=await db.aiShopOrder.create({data:{creator_id:id,product_id:'fixture',request_key:crypto.randomUUID(),name:'동시성 1회',amount:100,quantity:1,validity_days:30,terms:'test',environment:'test',status:'paid',remaining:1,paid_at:new Date(),expires_at:new Date(Date.now()+86400000)}});
 const results=await Promise.allSettled([reservePaidPhoto(db,id),reservePaidPhoto(db,id)]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1,'exactly one reservation succeeds');
 assert.equal((await db.aiShopOrder.findUniqueOrThrow({where:{id:order.id}})).remaining,0,'the balance never goes below zero');
});

test('Mitsuri haori accepts its public ID and legacy name with the same costume reference',async()=>{
 const {costumeReferenceIds,readCostumeReference,franchiseCostumeMeta}=require('../dist/src/platform/ai-photo-costume-references');
 const reference=fs.readFileSync(path.join(__dirname,'../src/platform/ai-photo-costumes/demon-mitsuri-v2.webp'));
 for(const key of ['6ee320','demon-mitsuri']){
  const ids=costumeReferenceIds([key],['outfit','pose'],'cosplay');
  assert.deepEqual(ids,['6ee320']);
  assert.deepEqual(await readCostumeReference(ids[0]),reference);
  assert.deepEqual(franchiseCostumeMeta(ids),{aiFranchiseCostume:true,aiCostumeCategory:'demon-slayer'});
 }
});

// 2026-11-17 user decision: successful requests add one to an aggregate per KST day, kind and preset (no person is stored).
test('preset usage is counted per day and preset only after a successful generation',async()=>{
 const {presetUsageKeys,kstDay}=require('../dist/src/platform/ai-preset-usage');
 assert.deepEqual(presetUsageKeys({costumeIds:'["4a0c8f","bad"]',backgroundId:'fb5001',presetKeys:JSON.stringify([{kind:'makeup',key:'지뢰계 메이크업'},{kind:'pose',key:'의자에 앉기'},{kind:'outfit',key:'forged'},{kind:'nope',key:'x'},{kind:'pose',key:'의자에 앉기'}])}),
  [{kind:'outfit',key:'4a0c8f'},{kind:'background',key:'fb5001'},{kind:'makeup',key:'지뢰계 메이크업'},{kind:'pose',key:'의자에 앉기'}],'outfit/background only from validated IDs, duplicates and unknown kinds dropped');
 assert.equal(kstDay(new Date('2026-11-17T15:30:00Z')).toISOString(),'2026-11-18T00:00:00.000Z','KST calendar day');
 const saved={...photos.settings},previous=photos.fetcher,user=await makeCreator('aiusage_'+tag),id=await media(user),key='사용량 테스트 '+tag,day=kstDay();
 const count=async()=>(await db.aiPresetUsageDaily.findUnique({where:{day_kind_preset_key:{day,kind:'pose',preset_key:key}}}))?.count||0;
 try{
  Object.assign(photos.settings,{seedreamKey:'seedream-test-key'});const request=base({sourceId:id,mode:'cosplay',kind:'outfit',style:'cosplay',costumeIds:['blue-shiroko'],presetKeys:JSON.stringify([{kind:'pose',key}])});
  photos.fetcher=async(url,init)=>url.endsWith('/moderations')?stub(url,init):new Response(JSON.stringify({error:{code:'OutputImageSensitiveContentDetected.PolicyViolation'}}),{status:400});
  reset();await assert.rejects(photos.edit(user,request,await mask()));assert.equal(await count(),0,'failures are not counted');
  photos.fetcher=async(url,init)=>url.endsWith('/moderations')?stub(url,init):new Response(JSON.stringify({data:[{b64_json:(await png(1024,1536)).toString('base64')}]}));
  reset();await photos.edit(user,request,await mask());reset();await photos.edit(user,request,await mask());assert.equal(await count(),2);
  const row=await db.aiPresetUsageDaily.findUnique({where:{day_kind_preset_key:{day,kind:'pose',preset_key:key}}});assert.deepEqual(Object.keys(row).sort(),['count','day','kind','preset_key','updated_at'],'no person or request column');
 }finally{Object.assign(photos.settings,saved);photos.fetcher=previous;await db.aiPresetUsageDaily.deleteMany({where:{preset_key:key}});}
});

// 2026-11-18 user decision: every successful generation sends an immediate ai-photo.succeeded alert (categories and counts only).
test('member and guest generation alerts display the catalog character and protect private request details',async t=>{
 const {requestContext}=require('../dist/src/platform/request-context');
 const {operationsAlertText}=require('../dist/src/platform/operations.service');
 const user=await makeCreator('aisuccess_'+tag),visitor='guest:'+crypto.randomBytes(20).toString('hex');
 t.after(()=>db.media.deleteMany({where:{user_sub:visitor}}));
 const prompt='성공알림프롬프트표식 벚꽃 아래 포즈';
 const providerBodies=[];
 function checkSeedreamRequest(owner,sourceId){
  const [{fields}]=calls.filter(call=>call.kind==='edit');
  const {image,...options}=fields;
  assert.equal(image.length,3);assert.ok(image.every(value=>/^data:image\/(png|webp);base64,/.test(value)));
  assert.ok(options.prompt.includes(prompt));
  assert.doesNotMatch(JSON.stringify(options),/Shiroko|80bdd0|costumeIds|blue-shiroko/i);
  assert.ok(!JSON.stringify(options).includes(owner)&&!JSON.stringify(options).includes(sourceId));
  providerBodies.push(crypto.createHash('sha256').update(JSON.stringify(fields)).digest('hex'));
 }
 for(const [owner,actor,guest,id] of [[user,'member',undefined,'80bdd0'],[visitor,'guest',{ipHash:'costume-alert-'+tag},'blue-shiroko']]){
  const ok=crypto.randomUUID(),bad=crypto.randomUUID(),invalid=crypto.randomUUID();
  t.after(()=>db.platformOperationalEvent.deleteMany({where:{request_id:{in:[ok,bad,invalid]}}}));
  const request=base({sourceId:await media(owner),mode:'cosplay',kind:'outfit',style:'cosplay',prompt,costumeIds:JSON.stringify([id]),presetKeys:JSON.stringify([{kind:'pose',key:'의자에 앉기'}])});
  const run=requestId=>requestContext.run({requestId,ip:'203.0.113.7',peerIp:'10.0.0.7'},async()=>photos.edit(owner,request,await mask(),guest));
  reset();editStatus=500;await assert.rejects(run(bad));
  checkSeedreamRequest(owner,request.sourceId);
  assert.equal(await db.platformOperationalEvent.count({where:{request_id:bad,type:'ai-photo.succeeded'}}),0,'a failure is not a success alert');
  const failed=await db.platformOperationalEvent.findFirstOrThrow({where:{request_id:bad,type:'ai-photo.failed'}});
  assert.equal(failed.data.costumeIds,'80bdd0');assert.equal(failed.data.actor,actor);
  const failedText=operationsAlertText(failed,'synthetic','secret');
  assert.match(failedText,/^의상: Shiroko$/m);assert.match(failedText,/접속 IP: 203\.0\.113\.7/);
  assert.doesNotMatch(failedText,new RegExp(['80bdd0','blue-shiroko','성공알림프롬프트표식',owner,'10\\.0\\.0\\.7'].join('|')));
  reset();outputs=1;await run(ok);
  checkSeedreamRequest(owner,request.sourceId);
  const rows=await db.platformOperationalEvent.findMany({where:{request_id:ok,type:'ai-photo.succeeded'}});assert.equal(rows.length,1);const [row]=rows;
  assert.equal(row.delivered_at,null,'queued for Telegram now (not deduped or digested)');assert.equal(row.last_error_code,null);assert.equal(row.ip,null);assert.equal(row.peer_ip,null);
  // estimatedUsd (dev integration with feat/ai-cost-caps): original + clothing guide + 1 costume reference = 3 input images, 3×$0.008+$0.020.
  assert.deepEqual({...row.data,durationMs:0},{actor,mode:'cosplay',style:'cosplay',kinds:'outfit',costumeIds:'80bdd0',presets:'pose:의자에 앉기',references:1,estimatedUsd:'0.044',durationMs:0});
  const text=operationsAlertText(row,'synthetic','secret');assert.match(text,/^\[crefans\] AI 사진 생성 성공/);assert.match(text,/접속 IP: 보내지 않음/);
  assert.match(text,/^의상: Shiroko$/m);assert.match(text,/^presets: pose:의자에 앉기$/m);assert.doesNotMatch(text,/80bdd0|blue-shiroko/);
  assert.doesNotMatch(JSON.stringify(row)+text,new RegExp(['성공알림프롬프트표식','@','203\\.0\\.113','10\\.0\\.0\\.7',owner,'aisuccess_','base64'].join('|')));
  request.costumeIds=JSON.stringify(['private-costume-input']);
  await assert.rejects(run(invalid),code('INVALID_COSTUME_REFERENCES'));
  const rejected=await db.platformOperationalEvent.findFirstOrThrow({where:{request_id:invalid,type:'ai-photo.failed'}});
  assert.doesNotMatch(operationsAlertText(rejected,'synthetic','secret'),/private-costume-input|의상:/);
 }
 assert.equal(new Set(providerBodies).size,1,'both catalog ID formats send identical Seedream requests, including reference images');
});

// 2026-11-17 user decision: operators reset every signed-out visitor's AI tries at once (guest quota epoch).
test('console reset gives every visitor a fresh 10 tries and keeps the guests daily budget',async()=>{
 const {resetGuestAiQuota,guestAiQuotaStatus}=require('../dist/src/platform/ai-photo-grants'),{GUEST_QUOTA_EPOCH_SETTING}=require('../dist/src/platform/guest-policy');
 const prior=await db.platformSetting.findUnique({where:{key:GUEST_QUOTA_EPOCH_SETTING}});
 const admin={id:crypto.randomUUID(),role:'SUPER_ADMIN',is_active:true},viewer={id:crypto.randomUUID(),role:'VIEWER',is_active:true,permissions:{members:['view']}};
 const visitor='guest:'+crypto.randomBytes(20).toString('hex'),{guestQuotaEpoch,guestQuotaKey}=require('../dist/src/platform/guest-policy');
 try{
  const epoch=await guestQuotaEpoch(db);for(let n=0;n<3;n++)await photos.limiter.limit(guestQuotaKey('ai-photo:guest:',visitor,epoch),10,86400);// 2026-11-20: the guest window is daily
  assert.equal(await photos.guestRemaining(visitor),0);
  await assert.rejects(resetGuestAiQuota(db,admin,{reason:'테스트 초기화',confirm:'틀림'}),code('CONFIRMATION_REQUIRED'));
  await assert.rejects(resetGuestAiQuota(db,viewer,{reason:'테스트 초기화',confirm:'전체 초기화'}));
  const r=await resetGuestAiQuota(db,admin,{reason:'테스트 초기화',confirm:'전체 초기화'});assert.equal(r.epoch,epoch+1);
  assert.equal(await photos.guestRemaining(visitor),3,'fresh credits after the reset');assert.equal((await guestAiQuotaStatus(db,admin)).epoch,epoch+1);
 }finally{if(prior)await db.platformSetting.update({where:{key:GUEST_QUOTA_EPOCH_SETTING},data:{value:prior.value}});else await db.platformSetting.deleteMany({where:{key:GUEST_QUOTA_EPOCH_SETTING}});}
});

// 2026-11-18 user decisions: AI photo cost controls (paid bypass of the service total, provider-call cap, cost alerts).
const paidOrder=(user,remaining)=>db.aiShopOrder.create({data:{creator_id:user,product_id:'fixture',request_key:crypto.randomUUID(),name:'격리 대역',amount:100*remaining,quantity:remaining,validity_days:30,terms:'test',environment:'test',status:'paid',remaining,paid_at:new Date(),expires_at:new Date(Date.now()+86400000)}});
test('2026-11-18: when the service-wide total is full, paid uses still generate while free tries are refused and given back',async()=>{
 const saved={...photos.settings},free=await makeCreator('aitotf_'+tag),paid=await makeCreator('aitotp_'+tag),freeSrc=await media(free),paidSrc=await media(paid),order=await paidOrder(paid,2);
 try{
  photos.settings.dailyTotal=await photos.used('ai-photo:total');const total=await photos.used('ai-photo:total');
  reset();await assert.rejects(photos.edit(free,base({sourceId:freeSrc})),code('SERVICE_BUSY'));assert.equal(calls.length,0,'no provider call');
  assert.equal((await photos.quota(free)).remaining,10,'the free try is given back');assert.equal(await photos.used('ai-photo:total'),total);
  // Free tries left: the free reservation is given back and the paid count is used instead.
  reset();assert.equal((await photos.edit(paid,base({sourceId:paidSrc}))).images.length,1);
  assert.equal((await db.aiShopOrder.findUnique({where:{id:order.id}})).remaining,1);assert.equal(await photos.used('ai-photo:creator-day:'+paid),0,'free try not used');
  // Free tries used up: the paid count goes straight through without touching the total.
  for(let i=0;i<10;i++)await photos.limiter.limit('ai-photo:creator-day:'+paid,10,86400);
  reset();assert.equal((await photos.edit(paid,base({sourceId:paidSrc}))).images.length,1);
  assert.equal((await db.aiShopOrder.findUnique({where:{id:order.id}})).remaining,0);assert.equal(await db.aiShopUse.count({where:{order_id:order.id,status:'consumed'}}),2);
  assert.equal(await photos.used('ai-photo:total'),total,'paid uses do not count toward the service total');
  // No paid count left: refused like a free user.
  reset();await assert.rejects(photos.edit(paid,base({sourceId:paidSrc})),code('DAILY_LIMIT'));assert.equal(calls.length,0);
 }finally{Object.assign(photos.settings,saved);}
});
test('2026-11-18: provider cap counts every Seedream call (retries too) and refuses the 901st before calling, without charging',async()=>{
 const {AI_PROVIDER_DAILY_CALLS}=require('../dist/src/platform/ai-photo-cost'),{digest}=require('../dist/src/auth/local/credentials'),prev=photos.costDay,previous=photos.fetcher,day='cap-'+tag,counter=digest(`ai-photo:provider-calls:${day}`);
 const user=await makeCreator('aipcap_'+tag),id=await media(user),order=await paidOrder(user,1),count=async()=>(await db.authRateBucket.findUnique({where:{id:counter}}))?.count??0;
 try{photos.costDay=()=>day;assert.equal(AI_PROVIDER_DAILY_CALLS,900);
  reset();await photos.edit(user,base({sourceId:id}));assert.equal(await count(),1);
  let blocked=true;photos.fetcher=async(url,init)=>{if(url.endsWith('/images/generations')&&blocked){blocked=false;calls.push({kind:'edit'});return new Response(JSON.stringify({error:{code:'OutputImageSensitiveContentDetected.PolicyViolation'}}),{status:400});}return stub(url,init);};
  reset();await photos.edit(user,base({sourceId:id,kind:'outfit',prompt:'검은 스타킹 코디'}));photos.fetcher=previous;
  assert.equal(calls.filter(c=>c.kind==='edit').length,2);assert.equal(await count(),3,'the stocking-wording retry is a second counted call');
  await db.authRateBucket.update({where:{id:counter},data:{count:AI_PROVIDER_DAILY_CALLS-1}});
  reset();await photos.edit(user,base({sourceId:id}));assert.equal(calls.filter(c=>c.kind==='edit').length,1,'the 900th call is made');assert.equal(await count(),900);
  const free=(await photos.quota(user)).remaining,total=await photos.used('ai-photo:total');
  for(let i=0;i<2;i++){reset();await assert.rejects(photos.edit(user,base({sourceId:id})),code('AI_PROVIDER_DAILY_CAP'));assert.equal(calls.filter(c=>c.kind==='edit').length,0,'the 901st call is never made');}
  assert.equal((await photos.quota(user)).remaining,free,'free try given back');assert.equal(await photos.used('ai-photo:total'),total);assert.equal(await count(),900);
  for(let i=await photos.used('ai-photo:creator-day:'+user);i<10;i++)await photos.limiter.limit('ai-photo:creator-day:'+user,10,86400);
  reset();await assert.rejects(photos.edit(user,base({sourceId:id})),code('AI_PROVIDER_DAILY_CAP'));
  assert.equal((await db.aiShopOrder.findUnique({where:{id:order.id}})).remaining,1,'paid count released');assert.equal(await db.aiShopUse.count({where:{order_id:order.id,status:'released'}}),1);
  const events=await db.platformOperationalEvent.findMany({where:{type:'ai-photo.provider_cap',dedupe_key:`ai-provider-cap:${day}`}});assert.equal(events.length,1,'one alert for the day');
  assert.equal(await db.platformOperationalEvent.count({where:{type:'ai-photo.failed',data:{path:'$.errorCode',equals:'AI_PROVIDER_DAILY_CAP'}}}),0,'refusals do not alert one by one');
  const {operationsAlertText}=require('../dist/src/platform/operations.service'),text=operationsAlertText(events[0],'test');assert.match(text,/공급사 호출 오늘 상한\(900회\)/);assert.match(text,/접속 IP: 보내지 않음/);assert.ok(!text.includes(user));
 }finally{photos.costDay=prev;photos.fetcher=previous;}
});
test('2026-11-18: estimated cost alerts fire once when crossing $30 and once when crossing $60',async()=>{
 const {digest}=require('../dist/src/auth/local/credentials'),{estimateMilliUsd}=require('../dist/src/platform/ai-photo-cost'),prev=photos.costDay,record=photos.operations.record,day='cost-'+tag,cost=digest(`ai-photo:provider-cost-milli:${day}`),seen=[];
 const user=await makeCreator('aicost_'+tag),id=await media(user),set=value=>db.authRateBucket.update({where:{id:cost},data:{count:value}}),alerts=()=>seen.filter(t=>t.startsWith('ai-photo.cost'));
 try{photos.costDay=()=>day;photos.operations.record=function(type,...rest){seen.push(type);return record.call(this,type,...rest);};
  assert.equal(estimateMilliUsd(1),28,'one input $0.008 + one output $0.020');
  reset();await photos.edit(user,base({sourceId:id}));assert.equal((await db.authRateBucket.findUnique({where:{id:cost}})).count,28);assert.deepEqual(alerts(),[]);
  await set(30000-29);reset();await photos.edit(user,base({sourceId:id}));assert.deepEqual(alerts(),[],'below $30 no alert');
  reset();await photos.edit(user,base({sourceId:id}));assert.deepEqual(alerts(),['ai-photo.cost_warning']);
  reset();await photos.edit(user,base({sourceId:id}));assert.deepEqual(alerts(),['ai-photo.cost_warning'],'not repeated above $30');
  await set(60000-1);reset();await photos.edit(user,base({sourceId:id}));assert.deepEqual(alerts(),['ai-photo.cost_warning','ai-photo.cost_critical']);
  reset();await photos.edit(user,base({sourceId:id}));assert.deepEqual(alerts(),['ai-photo.cost_warning','ai-photo.cost_critical'],'not repeated above $60');
  const warn=await db.platformOperationalEvent.findMany({where:{dedupe_key:`ai-photo.cost_warning:${day}`}}),crit=await db.platformOperationalEvent.findMany({where:{dedupe_key:`ai-photo.cost_critical:${day}`}});
  assert.equal(warn.length,1);assert.equal(crit.length,1);assert.deepEqual([warn[0].data.thresholdUsd,crit[0].data.thresholdUsd,crit[0].data.estimatedUsd],[30,60,'60.03']);assert.equal(warn[0].ip,null);
 }finally{photos.costDay=prev;photos.operations.record=record;}
});

test('Flash configuration reaches generation, saved media and the estimated budget',async t=>{
 const {ConfigService}=require('@nestjs/config'),{aiPhotoConfig}=require('../dist/src/platform/ai-photo');
 const {digest}=require('../dist/src/auth/local/credentials'),{estimateMilliUsd}=require('../dist/src/platform/ai-photo-cost');
 const flash='dola-seedream-5-0-flash-260915',settings=photos.settings,day=photos.costDay;
 const dayKey='flash-'+tag;
 t.after(()=>{photos.settings=settings;photos.costDay=day;});
 assert.equal(aiPhotoConfig(new ConfigService({AI_PHOTO_BYTEPLUS_MODEL:''})).model,'dola-seedream-5-5-261028');
 assert.throws(()=>aiPhotoConfig(new ConfigService({AI_PHOTO_BYTEPLUS_MODEL:'typo'})),/Unsupported AI_PHOTO_BYTEPLUS_MODEL/);
 photos.settings=aiPhotoConfig(new ConfigService({AI_PHOTO_BYTEPLUS_MODEL:flash}));
 photos.costDay=()=>dayKey;
 const user=await makeCreator('aiflash_'+tag);
 reset();outputs=1;
 const result=await photos.edit(user,base({sourceId:await media(user),kind:'outfit',style:'cosplay',mode:'cosplay',costumeIds:['80bdd0']}));
 const sent=calls.find(c=>c.kind==='edit').fields;
 assert.equal(sent.model,flash);assert.equal(sent.image.length,2);
 assert.equal((await db.media.findUniqueOrThrow({where:{id:result.images[0].id}})).metadata.aiModel,flash);
 assert.equal((await db.authRateBucket.findUniqueOrThrow({where:{id:digest('ai-photo:provider-cost-milli:'+dayKey)}})).count,18);
 assert.equal(estimateMilliUsd(1,flash),18);
 assert.equal(estimateMilliUsd(10,flash),18);
});


test('generationMethod selects the server model, usage and actual budget for both editors',async t=>{
 const {digest}=require('../dist/src/auth/local/credentials');
 const {estimateMilliUsd,resolveAiPhotoMethod}=require('../dist/src/platform/ai-photo-cost');
 const previousDay=photos.costDay,day='method-'+tag,cost=digest('ai-photo:provider-cost-milli:'+day);
 const user=await makeCreator('aimethod_'+tag),visitor='guest:'+crypto.randomBytes(20).toString('hex');
 photos.costDay=()=>day;
 t.after(async()=>{photos.fetcher=stub;photos.costDay=previousDay;await db.media.deleteMany({where:{user_sub:visitor}});});
 const methods=[
  ['fast','dola-seedream-5-0-flash-260915',0.5,18],
  ['standard','dola-seedream-5-5-261028',1,36],
  ['precise','dola-seedream-5-0-pro-260628',2,48]
 ];
 const legacyDefault=photos.settings.model;
 assert.deepEqual(resolveAiPhotoMethod(undefined,legacyDefault),{model:legacyDefault,units:1});
 assert.equal(estimateMilliUsd(1,methods[2][1]),45);
 assert.equal(estimateMilliUsd(10,methods[2][1]),72);
 let spent=0;
 for(const [owner,guest] of [[user,undefined],[visitor,{ipHash:'method-'+tag}]]){
  const id=await media(owner);
  if(guest)await require('../dist/src/platform/guest-policy').grantGuestPostReward(db,owner);
  let remaining=guest?6:10;
  reset();
  for(const invalid of ['',[],null,'constructor',methods[2][1]]){
   await assert.rejects(photos.edit(owner,base({sourceId:id,generationMethod:invalid}),undefined,guest),code('INVALID_GENERATION_METHOD'));
  }
  assert.equal(calls.length,0);
  for(const [method,model,units,price] of methods){
   reset();outputs=1;
   photos.fetcher=(url,init)=>stub(url,init,model);
   const result=await photos.edit(owner,base({sourceId:id,kind:'outfit',style:'cosplay',costumeIds:['80bdd0'],generationMethod:method}),undefined,guest);
   const sent=calls.find(call=>call.kind==='edit').fields;
   assert.equal(sent.image.length,2);
   assert.equal(sent.model,model);
   assert.equal((await db.media.findUniqueOrThrow({where:{id:result.images[0].id}})).metadata.aiModel,model);
   remaining-=units;
   spent+=price;
   assert.equal(result.remaining,remaining);
   assert.equal((await db.authRateBucket.findUniqueOrThrow({where:{id:cost}})).count,spent);
   assert.equal(photos.settings.model,legacyDefault);
  }
 }
});

test('fractional credits combine daily, reward and two expiring orders atomically and restore exact amounts on failure',async()=>{
 const {reserveMemberUsage,finishPhotoUsage}=require('../dist/src/platform/ai-photo-usage');
 const {remainingRefund}=require('../dist/src/platform/ai-shop');
 const user=await makeCreator('aihalf_'+tag),day={key:'ai-photo:creator-day:'+user,seconds:86400,max:10},pool={key:'ai-photo:test-pool:'+user,seconds:86400,max:10};
 await photos.limiter.limit(day.key,10,86400);
 const {aiPhotoUsageId}=require('../dist/src/platform/ai-photo-grants');
 await db.authRateBucket.update({where:{id:aiPhotoUsageId(user)},data:{count:9.5}});
 await db.aiHeartWallet.create({data:{user_id:user,credits:.5}});
 const orders=await Promise.all([paidOrder(user,1),paidOrder(user,1)]);
 await db.aiShopOrder.updateMany({where:{id:{in:orders.map(o=>o.id)}},data:{remaining:.5}});
 const reserve=()=>reserveMemberUsage(db,user,crypto.randomUUID(),2,day,pool);
 const balances=async()=>[(await photos.quota(user)).remaining,await photos.used(day.key),await photos.used(pool.key),(await db.aiHeartWallet.findUnique({where:{user_id:user}})).credits,...(await db.aiShopOrder.findMany({where:{creator_id:user},orderBy:{id:'asc'}})).map(o=>o.remaining)];
 assert.deepEqual(await balances(),[2,9.5,0,.5,.5,.5]);
 const failure=await reserve();
 assert.deepEqual(await balances(),[0,10,1,0,0,0]);
 await assert.rejects(reserve(),code('DAILY_LIMIT'));
 assert.equal(await db.aiShopUse.count({where:{request_id:failure.id,status:'reserved',units:.5}}),2);
 await finishPhotoUsage(db,failure,false,true);
 assert.deepEqual(await balances(),[2,9.5,0,.5,.5,.5]);
 const results=await Promise.allSettled([reserve(),reserve()]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 assert.equal(results.find(r=>r.status==='rejected').reason.getResponse().code,'DAILY_LIMIT');
 const success=results.find(r=>r.status==='fulfilled').value;
 await finishPhotoUsage(db,success,true,false);
 assert.deepEqual(await balances(),[0,10,1,0,0,0]);
 assert.equal(await db.aiShopUse.count({where:{request_id:success.id,status:'consumed',units:.5}}),2);
 const audit=await db.platformAuditLog.findFirstOrThrow({where:{action:'shop.use_consumed',entity_id:orders[0].id}});
 assert.equal(audit.metadata.count,.5);
 const {safeAuditData}=require('../dist/src/platform/audit');
 assert.deepEqual(safeAuditData({amount:.5,count:.25}),{});
 assert.equal(remainingRefund(990,10,9.5),940);
});

test('fractional credits respect shared guest request caps under concurrency and do not restore a reset member bucket',async()=>{
 const {reserveGuestUsage,reserveMemberUsage,finishPhotoUsage}=require('../dist/src/platform/ai-photo-usage');
 const limits=user=>['visitor-'+user,'ip','total'].map((name,i)=>({key:'ai-test:'+tag+':'+name,max:i===0?2:1,seconds:86400,code:i===0?'GUEST_AI_LIMIT':'GUEST_IP_LIMIT',message:'limit'}));
 const reserve=(user,n)=>reserveGuestUsage(db,user,crypto.randomUUID(),n,limits(user));
 const results=await Promise.allSettled([reserve('a',.5),reserve('b',2)]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 assert.equal(results.find(r=>r.status==='rejected').reason.getResponse().code,'GUEST_IP_LIMIT');
 const success=results.find(r=>r.status==='fulfilled').value;
 assert.equal(await photos.used(limits('a')[1].key),1);
 await finishPhotoUsage(db,success,false,true);
 assert.equal(await photos.used(limits('a')[1].key),0);
 for(const user of ['a','b'])assert.equal(await photos.used(limits(user)[0].key),0);
 const user=await makeCreator('aireset_'+tag),day={key:'ai-photo:creator-day:'+user,max:10,seconds:86400},pool={...day,key:'ai-photo:test-pool:'+user};
 const first=await reserveMemberUsage(db,user,crypto.randomUUID(),.5,day,pool);
 await db.authRateBucket.delete({where:{id:first.buckets.find(b=>b.units===.5).id}});
 await reserveMemberUsage(db,user,crypto.randomUUID(),1,day,pool);
 await finishPhotoUsage(db,first,false,true);
 assert.equal(await photos.used(day.key),1);
 assert.equal(await photos.used(pool.key),1);
});

// 2026-11-20 user request: a photo the user uploaded becomes the background (personal background reference, moderated).
test('own background photo: attached as a personal background reference, checked, and limited to the user\'s own other photo',async()=>{
 reset();const who=await makeCreator('ownbg_'+tag);await db.aiPhotoGrant.create({data:{creator_user_id:who,reason:'내 배경 QA'}});const id=await media(who),place=await media(who);
 await photos.edit(who,base({sourceId:id,kind:'background',backgroundMediaId:place}));
 const request=calls.find(x=>x.kind==='edit');assert.equal(request.images.length,2);assert.match(request.fields.prompt,/Image 2 is a personal background reference/);assert.equal(calls.filter(x=>x.kind==='moderation').length,3,'prompt+source and the background photo are moderated');
 reset();
 await assert.rejects(photos.edit(who,base({sourceId:id,kind:'pose',backgroundMediaId:place})),code('INVALID_BACKGROUND_PHOTO'),'needs a background edit');
 await assert.rejects(photos.edit(who,base({sourceId:id,kind:'background',backgroundMediaId:id})),code('INVALID_BACKGROUND_PHOTO'),'not the source itself');
 await assert.rejects(photos.edit(who,base({sourceId:id,kind:'background',backgroundMediaId:'x'})),code('INVALID_BACKGROUND_PHOTO'));
 const stranger=await makeCreator('ownbg2_'+tag),theirs=await media(stranger);
 await assert.rejects(photos.edit(who,base({sourceId:id,kind:'background',backgroundMediaId:theirs})),code('BACKGROUND_PHOTO_NOT_FOUND'),'another user\'s photo');
 await assert.rejects(photos.edit(who,base({sourceId:id,kind:'background',backgroundMediaId:place,backgroundId:'b7a101'})),code('INVALID_BACKGROUND_REFERENCE'),'one background only');
 assert.equal(calls.filter(x=>x.kind==='edit').length,0);
});
