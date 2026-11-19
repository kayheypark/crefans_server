const assert = require('node:assert/strict');
const {test} = require('node:test');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {createHash} = require('node:crypto');
const sharp = require('sharp');
const {saveCandidate, prepareFace, approve} = require('../scripts/register-ai-photo-composite-base.cjs');
const {aiPhotoPrompt} = require('../src/platform/ai-photo');
const {readCostumeReference} = require('../src/platform/ai-photo-costume-references');

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const costumeId = '6ee320';
const outfit = '의상 참조 사진 1의 코디를 적용해줘.';
const writeJson = (file,value) => fs.writeFile(file,JSON.stringify(value));
const readJson = async file => JSON.parse(await fs.readFile(file,'utf8'));

async function fixture(t,pose='바닥에 편하게 앉아 쉬는 포즈로 바꿔줘.') {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(),'costume-review-'));
  t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  const settings = {sources:new Map(), candidates:path.join(dir,'candidates'), catalog:path.join(dir,'catalog')};
  await fs.mkdir(settings.catalog);
  const manifest = path.join(settings.catalog, 'approved.json');
  await writeJson(manifest,[]);
  const images = {};
  const names = ['base','jiwoo','moka','untrusted','base-output','jiwoo-output','moka-output'];
  for (const [index,name] of names.entries()) {
    const bytes = await sharp({create:{width:8,height:8,channels:3,background:{r:20+index*20,g:20,b:200}}}).png().toBuffer();
    images[name]=path.join(dir,name+'.png');
    await fs.writeFile(images[name],bytes);
    if (['base','jiwoo','moka'].includes(name)) settings.sources.set(hash(bytes),name);
  }
  const garment = path.join(dir,'mannequin.webp');
  await fs.writeFile(garment,await readCostumeReference(costumeId));
  async function receipt(name,source,reference,body) {
    const file = images[name]+'.json';
    const sha256 = hash(await fs.readFile(images[name]));
    const model='dola-seedream-5-5-261028';
    await writeJson(file,{model,responseModel:model,status:200,usage:{generated_images:1,input_images:2},references:[source,reference],prompt:body,sha256});
    return {receipt:path.basename(file),sha256,verdict:'pass',reason:'Synthetic test fixture reviewed'};
  }
  const kinds = pose ? ['outfit','pose'] : ['outfit'];
  const basePrompt = aiPhotoPrompt(pose?'combined':'outfit','cosplay',[outfit,pose].filter(Boolean).join('\n'),kinds,undefined,1,false,false);
  const base = await receipt('base-output',images.base,garment,basePrompt);
  const candidate = await saveCandidate(path.join(dir,base.receipt),costumeId,pose,settings);
  const faces = [];
  for (const name of ['jiwoo','moka']) {
    const prepared = await prepareFace(candidate,images[name],settings);
    assert.deepEqual(prepared.references,[images[name],path.join(candidate,'base.webp')]);
    faces.push(await receipt(name+'-output',...prepared.references,prepared.prompt));
  }
  const reviewFile=path.join(dir,'review.json');
  const review={costumeId,pose,base,faces};
  await writeJson(reviewFile,review);
  return {dir,settings,manifest,images,review,reviewFile,candidate,garment};
}

test('two inspected fittings of one candidate publish exactly the mannequin-derived base, offline and idempotently',async t=>{
  const f=await fixture(t);
  assert.deepEqual(await fs.readdir(f.settings.catalog),['approved.json']);
  assert.deepEqual(await fs.readFile(path.join(f.candidate,'output.png')), await fs.readFile(f.images['base-output']));
  const entry=await approve(f.reviewFile,f.settings);
  assert.deepEqual(await approve(f.reviewFile,f.settings),entry);
  const webp=await fs.readFile(path.join(f.candidate,'base.webp'));
  assert.deepEqual(await readJson(f.manifest),[{costumeId,pose:f.review.pose,storedWebpSha256:hash(webp)}]);
  assert.deepEqual(await fs.readFile(path.join(f.settings.catalog,entry.storedWebpSha256+'.webp')),webp);
  assert.deepEqual((await fs.readdir(f.settings.catalog)).sort(),[entry.storedWebpSha256+'.webp','approved.json'].sort());
});

test('an archived candidate remains verifiable after the original input and output files are moved',async t=>{
  const f=await fixture(t);
  const originalReceipt=path.join(f.dir,f.review.base.receipt);
  assert.deepEqual(await fs.readFile(path.join(f.candidate,'provider-receipt.json')),await fs.readFile(originalReceipt));
  const snapshot=await readJson(path.join(f.candidate,'output.png.json'));
  assert.deepEqual(snapshot.references,['source.png','mannequin.webp']);
  await Promise.all([f.images.base,f.garment,f.images['base-output'],originalReceipt].map(file=>fs.unlink(file)));
  const prepared=await prepareFace(f.candidate,f.images.jiwoo,f.settings);
  assert.equal(prepared.references[1],path.join(f.candidate,'base.webp'));
  f.review.base.receipt=path.relative(f.dir,path.join(f.candidate,'output.png.json'));
  await writeJson(f.reviewFile,f.review);
  const approved=await approve(f.reviewFile,f.settings);
  assert.equal(approved.storedWebpSha256,hash(await fs.readFile(prepared.references[1])));
});

test('an explicit keep-pose review requires the real outfit-only base and fitting prompts',async t=>{
  const f=await fixture(t,'');
  const entry=await approve(f.reviewFile,f.settings);
  assert.equal(entry.pose,'');
  const faceFile=path.join(f.dir,f.review.faces[0].receipt);
  const face=await readJson(faceFile);
  await writeJson(faceFile,{...face,prompt:face.prompt.replace('Requested change:', 'Pose: adjust body position as requested.\nRequested change:')});
  await assert.rejects(approve(f.reviewFile,f.settings),/outfit-only/);
});

test('manual holds, missing approvals and mismatched review digests leave the catalog unchanged',async t=>{
  const f=await fixture(t);
  for (const [patch,expected] of [
    [{faces:[f.review.faces[0]]}, /Two visually/],
    [{faces:[f.review.faces[0],f.review.faces[0]]}, /distinct approved/],
    [{base:{...f.review.base,verdict:'hold'}}, /pass, reason/],
    [{faces:[f.review.faces[0],{...f.review.faces[1],reason:''}]}, /pass, reason/],
    [{base:{...f.review.base,sha256:'0'.repeat(64)}}, /Reviewed base/],
    [{pose:'다른 포즈'}, /selected pose/],
  ]) {
    await writeJson(f.reviewFile,{...f.review,...patch});
    await assert.rejects(approve(f.reviewFile,f.settings),expected);
    assert.deepEqual(await readJson(f.manifest),[]);
  }
});

test('rejects user uploads, failed generation receipts, a different base, modified outputs and face-derived masters',async t=>{
  const f=await fixture(t);
  const faceFile=path.join(f.dir,f.review.faces[0].receipt);
  const face=await readJson(faceFile);
  for (const [patch,expected] of [
    [{references:[f.images.untrusted,face.references[1]]}, /Unrecognized source/],
    [{status:400}, /successful/],
    [{references:[face.references[0],f.garment]}, /exact costume base/],
  ]) {
    await writeJson(faceFile,{...face,...patch});
    await assert.rejects(approve(f.reviewFile,f.settings),expected);
    assert.deepEqual(await readJson(f.manifest),[]);
  }
  await writeJson(faceFile,face);
  await assert.rejects(saveCandidate(faceFile,costumeId,f.review.pose,f.settings),/not a face test/);
  await assert.rejects(prepareFace(f.candidate,f.images.untrusted,f.settings),/face-test source/);
  await fs.copyFile(f.images['base-output'],f.images['jiwoo-output']);
  await assert.rejects(approve(f.reviewFile,f.settings),/studio receipt/);
  assert.deepEqual(await readJson(f.manifest),[]);
});
