require('reflect-metadata');require('dotenv').config({path:'.local/platform.env',override:true});
// Studio AI photo editor (2026-11-08). OpenAI is always a stub (no network); media is stored locally in a temp MEDIA_ROOT on the isolated e2e DB.
const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
assert.equal(process.env.CREFANS_E2E,'true');const source=process.env.DATABASE_URL;assert.match(source||'',/@127\.0\.0\.1:3307\/crefans_platform_dev$/);const url=new URL(source);url.pathname='/crefans_platform_e2e';process.env.DATABASE_URL=url.toString();
const mediaRoot=fs.mkdtempSync(path.join(os.tmpdir(),'ai-photo-'));
Object.assign(process.env,{LOCAL_AUTH_SECRET:'r'.repeat(64),DATA_ENCRYPTION_KEY:'r'.repeat(64),TELEGRAM_OPERATIONS_BOT_TOKEN:'',TELEGRAM_OPERATIONS_CHAT_ID:'',SMTP_HOST:'',BEAN_LEDGER_ENABLED:'false',AUTH_PROVIDER:'local',MEDIA_STORAGE:'local',MEDIA_ROOT:mediaRoot,AI_PHOTO_OPENAI_API_KEY:'sk-test-'+'x'.repeat(20),AI_PHOTO_DAILY_TOTAL:'100000'});
const sharp=require('sharp'),{PrismaClient}=require('@prisma/client'),db=new PrismaClient(),{NestFactory}=require('@nestjs/core'),{PlatformModule}=require('../dist/src/platform/module'),{AiPhotoService,aiPhotoPrompt}=require('../dist/src/platform/ai-photo');
const tag=crypto.randomBytes(3).toString('hex'),members=[];let app,photos,release,creator,other,sourceId,otherSourceId;
const png=(w,h,color={r:200,g:120,b:160})=>sharp({create:{width:w,height:h,channels:3,background:color}}).png().toBuffer();
async function makeCreator(handle){const id=crypto.randomUUID();members.push(id);await db.member.create({data:{id,email:id+'@ai-photo-edit.test.invalid',name:'AI 편집 QA',nickname:'AI 편집 QA',preferred_username:handle,password_hash:'unused',email_verified:true,status:'CONFIRMED'}});await db.creator.create({data:{user_id:id,handle,display_name:'AI 편집 QA'}});return id;}
async function media(owner,w=600,h=900){const id=crypto.randomUUID();fs.writeFileSync(path.join(mediaRoot,id),await sharp(await png(w,h)).webp().toBuffer());await db.media.create({data:{id,user_sub:owner,type:'IMAGE',original_name:'s.webp',file_name:id,file_size:1,mime_type:'image/webp',original_url:`/api/v1/media/${id}/file`,s3_upload_key:`local/${id}`,processing_status:'COMPLETED',processed_at:new Date()}});return id;}
// Provider stub: records calls; moderation verdicts come from `flags` (input first, then each output), edits return `outputs` PNGs.
let calls=[],flags=[],editStatus=200,outputs=2,moderationDown=false;
async function stub(url,init){
 if(url.endsWith('/moderations')){calls.push({kind:'moderation',body:JSON.parse(init.body)});if(moderationDown)return new Response('{}',{status:503});const f=flags.length?flags.shift():false;return new Response(JSON.stringify({results:[{flagged:f}]}),{status:200});}
 if(url.endsWith('/images/edits')){const form=init.body,entry={kind:'edit',fields:{}};for(const [k,v] of form.entries()){const value=typeof v==='string'?v:{size:v.size,type:v.type,bytes:Buffer.from(await v.arrayBuffer())};if(k==='image[]')(entry.fields[k]??=[]).push(value);else entry.fields[k]=value;}calls.push(entry);
  if(editStatus!==200)return new Response(JSON.stringify({error:{code:editStatus===400?'moderation_blocked':'server_error'}}),{status:editStatus});
  const data=[];for(let i=0;i<outputs;i++)data.push({b64_json:(await png(1024,1536,{r:10*i,g:80,b:200})).toString('base64')});return new Response(JSON.stringify({data}),{status:200});}
 throw new Error('unexpected '+url);
}
const reset=()=>{calls=[];flags=[];editStatus=200;outputs=2;moderationDown=false;};
const base=extra=>({sourceId,kind:'pose',style:'photo',prompt:'벚꽃 아래 벤치에 앉은 포즈',consent:'true',...extra});
const code=wanted=>e=>e.getResponse?.().code===wanted;
async function mask(transparent=true){const img=sharp({create:{width:600,height:900,channels:4,background:{r:255,g:255,b:255,alpha:1}}});return{buffer:await(transparent?img.composite([{input:await sharp({create:{width:200,height:300,channels:4,background:{r:0,g:0,b:0,alpha:1}}}).png().toBuffer(),left:200,top:300,blend:'dest-out'}]):img).png().toBuffer(),mimetype:'image/png',size:1000};}
before(async()=>{
 release=await require('./e2e-db-lock.cjs').lockE2EDatabase(source);
 const result=require('node:child_process').spawnSync(process.execPath,[require.resolve('prisma/build/index.js'),'migrate','deploy'],{env:process.env,encoding:'utf8'});assert.equal(result.status,0,result.stdout+result.stderr);
 creator=await makeCreator('aiedit_'+tag);other=await makeCreator('aiother_'+tag);sourceId=await media(creator);otherSourceId=await media(other);
 app=await NestFactory.create(PlatformModule,{logger:false});await app.init();photos=app.get(AiPhotoService);photos.fetcher=stub;
});
after(async()=>{await app?.close();try{const made=await db.media.findMany({where:{user_sub:{in:members}},select:{id:true}});await db.media.deleteMany({where:{id:{in:made.map(m=>m.id)}}});await db.aiPhotoGrant.deleteMany({where:{creator_user_id:{in:members}}});await db.creator.deleteMany({where:{user_id:{in:members}}});await db.member.deleteMany({where:{id:{in:members}}});fs.rmSync(mediaRoot,{recursive:true,force:true});}finally{await db.$disconnect();await release?.();}});

test('only allow-listed creators: quota shows not allowed and edits are refused until granted',async()=>{
 reset();assert.deepEqual(await photos.quota(creator),{allowed:false,limit:10,remaining:0,typicalSeconds:null});
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
 await assert.rejects(photos.edit(creator,base({kind:'outfit'})),code('MASK_REQUIRED'));
 await assert.rejects(photos.edit(creator,base({kind:'outfit'}),await mask(false)),code('MASK_REQUIRED'));
 await assert.rejects(photos.edit(creator,base({sourceId:otherSourceId})),code('MEDIA_NOT_FOUND'));
 assert.equal(calls.length,0);assert.equal((await photos.quota(creator)).remaining,10);
});

test('pose edit: moderation of prompt and photo, one image requested, saved as private AI media; original untouched',async()=>{
 reset();const before=fs.readFileSync(path.join(mediaRoot,sourceId));
 const r=await photos.edit(creator,base());
 assert.equal(r.images.length,1);assert.equal(r.remaining,9);assert.ok(r.images.every(i=>i.aiGenerated&&i.type==='image'&&i.url===`/api/v1/media/${i.id}/file`));
 const input=calls[0];assert.equal(input.kind,'moderation');assert.equal(input.body.input[0].text,'벚꽃 아래 벤치에 앉은 포즈');assert.match(input.body.input[1].image_url.url,/^data:image\/png;base64,/);
 const edit=calls.find(c=>c.kind==='edit');assert.equal(edit.fields.n,'1');assert.equal(edit.fields.model,'gpt-image-2');assert.equal(edit.fields.size,'1024x1536');assert.equal(edit.fields.moderation,'auto');assert.ok(!('mask' in edit.fields));
 assert.equal(edit.fields.prompt,aiPhotoPrompt('pose','photo','벚꽃 아래 벤치에 앉은 포즈'));assert.match(edit.fields.prompt,/Do not add nudity/);assert.match(edit.fields.safety_identifier,/^[a-f0-9]{64}$/);
 assert.equal(calls.filter(c=>c.kind==='moderation').length,2,'input + one output');
 for(const img of r.images){const row=await db.media.findUnique({where:{id:img.id}});assert.equal(row.user_sub,creator);assert.equal(row.metadata.aiGenerated,true);assert.equal(row.metadata.aiSourceId,sourceId);assert.equal(row.metadata.aiKind,'pose');assert.equal(typeof row.metadata.aiDurationMs,'number');assert.ok(row.metadata.aiDurationMs>=0);assert.equal(row.metadata.watermarkEligible!==undefined,true);assert.ok(fs.existsSync(path.join(mediaRoot,row.file_name)));}
 assert.deepEqual(fs.readFileSync(path.join(mediaRoot,sourceId)),before);
 const q=await photos.quota(creator);assert.ok(Number.isInteger(q.typicalSeconds)&&q.typicalSeconds>=1,'typical time comes from finished edits');
});

test('outfit edit sends the mask resized to the provider image',async()=>{
 reset();const r=await photos.edit(creator,base({kind:'outfit',prompt:'흰색 세일러 교복 코스튬'}),await mask());assert.equal(r.images.length,1);
 const edit=calls.find(c=>c.kind==='edit');assert.equal(edit.fields.mask.type,'image/png');
 const [mi,ii]=await Promise.all([sharp(edit.fields.mask.bytes).metadata(),sharp(edit.fields.image.bytes).metadata()]);assert.deepEqual([mi.width,mi.height],[ii.width,ii.height]);assert.equal(mi.hasAlpha,true);
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
 const edit=calls.find(c=>c.kind==='edit');assert.equal(edit.fields.n,'1');assert.equal(edit.fields['image[]'].length,2);assert.ok(!edit.fields.mask);assert.ok(!edit.fields.image);
 assert.match(edit.fields.prompt,/adult man/);assert.match(edit.fields.prompt,/Allow facial features and gender presentation to change/);assert.doesNotMatch(edit.fields.prompt,/facial structure, identity, age, body shape and skin tone exactly/);assert.match(edit.fields.prompt,/Never reproduce the pink guide/);assert.match(edit.fields.prompt,/Do not add nudity/);
 assert.notDeepEqual(edit.fields['image[]'][0].bytes,edit.fields['image[]'][1].bytes);
 const row=await db.media.findUnique({where:{id:result.images[0].id}});assert.deepEqual(row.metadata.aiEditKinds,['outfit','makeup','expression','pose','background']);assert.equal(row.metadata.aiTargetGender,'male');
 reset();const edited=await photos.edit(user,base({sourceId:result.images[0].id,targetGender:'female',prompt:'성인 여성으로 바꿔줘.'}));assert.equal(edited.images.length,1);assert.match(calls.find(c=>c.kind==='edit').fields.prompt,/adult woman/);
 const next=await db.media.findUnique({where:{id:edited.images[0].id}});assert.equal(next.metadata.aiSourceId,result.images[0].id);assert.equal(next.metadata.aiTargetGender,'female');
 reset();await assert.rejects(photos.edit(other,base({sourceId:edited.images[0].id})),e=>['AI_PHOTO_NOT_ALLOWED','MEDIA_NOT_FOUND'].includes(e.getResponse?.().code));assert.equal(calls.length,0);
 reset();await photos.edit(user,base({sourceId:id,kind:'outfit',targetGender:'female'}),await mask());const outfit=calls.find(c=>c.kind==='edit');assert.equal(outfit.fields['image[]'].length,2);assert.ok(!outfit.fields.mask);assert.match(outfit.fields.prompt,/adult woman/);
});

test('combined/gender validation refuses malformed scopes, missing outfit mask and unsupported gender before provider',async()=>{
 const user=await makeCreator('aival_'+tag);await db.aiPhotoGrant.create({data:{creator_user_id:user,reason:'테스트 허용'}});const id=await media(user);reset();
 for(const editKinds of [undefined,'not json','["pose"]','["pose","pose"]','["pose","hair"]','{}'])await assert.rejects(photos.edit(user,base({sourceId:id,kind:'combined',editKinds})),code('INVALID_EDIT_KINDS'));
 await assert.rejects(photos.edit(user,base({sourceId:id,kind:'combined',editKinds:'["outfit","background"]'})),code('MASK_REQUIRED'));
 await assert.rejects(photos.edit(user,base({sourceId:id,targetGender:'unknown'})),code('INVALID_TARGET_GENDER'));
 assert.equal(calls.length,0);assert.equal((await photos.quota(user)).remaining,10);
 reset();await photos.edit(user,base({sourceId:id,kind:'combined',editKinds:['pose','background']}));const edit=calls.find(c=>c.kind==='edit');assert.ok(edit.fields.image);assert.ok(!edit.fields.mask);assert.ok(!edit.fields['image[]']);assert.match(edit.fields.prompt,/facial structure, identity, age/);
});


test('all eight aspects including camera, lens and body combine without conflicting body-preservation rules',async()=>{
 const user=await makeCreator('aibody_'+tag);await db.aiPhotoGrant.create({data:{creator_user_id:user,reason:'테스트 허용'}});const id=await media(user);reset();
 const kinds=['outfit','makeup','expression','pose','background','camera','lens','body'];await photos.edit(user,base({sourceId:id,kind:'combined',editKinds:kinds,prompt:'가슴 크기는 조금 작게, 키 비율은 조금 크게. 전신 구도, Canon RF85mm F1.2 촬영 느낌, 벤치에 앉은 포즈.'}),await mask());const edit=calls.find(c=>c.kind==='edit');assert.equal(edit.fields.n,'1');assert.match(edit.fields.prompt,/Camera: adjust viewpoint/);assert.match(edit.fields.prompt,/Lens: simulate/);assert.match(edit.fields.prompt,/Body proportions:/);assert.match(edit.fields.prompt,/Only the requested body proportions may change/);assert.doesNotMatch(edit.fields.prompt,/body shape and skin tone exactly/);assert.match(edit.fields.prompt,/age and skin tone/);assert.match(edit.fields.prompt,/Do not add nudity/);
 reset();await photos.edit(user,base({sourceId:id,kind:'body',prompt:'힙 크기를 조금 크게 자연스럽게 보정해줘.'}));const body=calls.find(c=>c.kind==='edit');assert.match(body.fields.prompt,/fully clothed/);assert.match(body.fields.prompt,/Only the requested body proportions may change/);assert.ok(!body.fields.mask);
});
