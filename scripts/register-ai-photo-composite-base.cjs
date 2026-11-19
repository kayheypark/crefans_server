// Offline operator workflow. Only --approve changes the production registry.
// --candidate BASE.png.json COSTUME_ID 'POSE'  -> saves the original, receipt and lossless candidate in .local.
// --prepare-face CANDIDATE_DIR FACE_FILE      -> prints the studio prompt and the two input paths, without calling Seedream.
// --approve REVIEW.json                       -> validates the base and two different face receipts before publication.
// An explicit empty POSE ('') means the outfit-only studio prompt, preserving image 1's pose.
// Review paths are relative to REVIEW.json. Copy each PNG's actual digest into its reviewed entry:
// { "costumeId":"...", "pose":"...", "base":{"receipt":"base.png.json","sha256":"...","verdict":"pass","reason":"..."},
//   "faces":[{"receipt":"jiwoo.png.json","sha256":"...","verdict":"pass","reason":"..."},{...}] }
// A pass records visual inspection of outfit, props and pose, and both original faces and backgrounds for fittings.
// --candidate snapshots both verified input images. Archive the two fitting receipts/inputs/outputs with the review.
const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');
require('ts-node/register/transpile-only');
const {costumeReferenceIds, readCostumeReference} = require('../src/platform/ai-photo-costume-references');
const {costumeReviewPoses} = require('../src/platform/ai-costume-review-poses');

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const model = 'dola-seedream-5-5-261028';
const root = path.resolve(__dirname, '..');
const studioSources = new Map([
  // The same first-party synthetic adult, original WebP and the studio's resized PNG.
  ['8d2f3b361d783d86c1bf2056b8c7df25e555162c73486631e98c6d4f626c7462', 'base'],
  ['c2a1115fab243e2c84f8c95d5bed43a73f0d5040dafe71578602c981db82cd2e', 'base'],
  ['5f5bbbfb8a8c27e95f0b1b7150900c4bcdc012aea3c25d674712d3d5d87db76d', 'jiwoo'],
  ['2a5c20871f976bd7d19caad6b051bccf480c22f9d68869c953df57411d0a324b', 'moka'],
]);
const operator = {
  sources: studioSources,
  candidates: path.join(root, '.local', 'ai-photo-composite-candidates'),
  catalog: path.join(root, 'src', 'platform', 'ai-photo-composite-bases'),
};
const readJson = async file => JSON.parse(await fs.readFile(file, 'utf8'));
const json = value => JSON.stringify(value, null, 2) + '\n';

function validateSelection(costumeId, pose) {
  assert(/^[0-9a-f]{6}$/.test(costumeId) && (pose === '' || costumeReviewPoses.has(pose)),
    'Expected a catalog costume ID and the selected pose from the pose catalog (or an explicit empty string)');
  costumeReferenceIds([costumeId], ['outfit'], 'cosplay');
}

function studioPrompt(pose, isFitting) {
  const {aiPhotoPrompt} = require('../src/platform/ai-photo');
  const outfit = '의상 참조 사진 1의 코디를 적용해줘.';
  return pose
    ? aiPhotoPrompt('combined','cosplay',outfit+'\n'+pose,['outfit','pose'],undefined,1,false,isFitting)
    : aiPhotoPrompt('outfit','cosplay',outfit,['outfit'],undefined,1,false,isFitting);
}

async function readGeneration(file, pose, sources, isFitting) {
  assert(file.endsWith('.png.json'), 'Expected a studio PNG receipt');
  const receipt = await readJson(file);
  assert(receipt.status === 200 && receipt.model === model && receipt.responseModel === model &&
    receipt.usage?.generated_images === 1 && receipt.usage?.input_images === 2 &&
    Array.isArray(receipt.references) && receipt.references.length === 2, 'Expected one successful two-image Seedream edit');
  const request = receipt.prompt.split('Requested change: ')[1]?.split('\nIf requests conflict,')[0];
  if (pose === '') {
    assert.equal(receipt.prompt, studioPrompt('', isFitting), 'A keep-pose review needs the explicit outfit-only studio request');
  } else {
    assert(request?.split(/\r?\n/).some(line => line.trim() === pose.trim()), 'Receipt does not match the selected pose');
  }
  const [source, reference, png] = await Promise.all([
    ...receipt.references.map(name => fs.readFile(path.resolve(path.dirname(file), name))),
    fs.readFile(file.slice(0, -5)),
  ]);
  const identity = sources.get(sha256(source));
  assert(identity, 'Unrecognized source image. Only service-owned synthetic adults are accepted');
  assert.equal(sha256(png), receipt.sha256, 'Output does not match the studio receipt');
  assert.equal((await sharp(png).metadata()).format, 'png', 'Expected an actual PNG output');
  return {identity, source, reference, png, receipt};
}

async function readBase(file, costumeId, pose, settings) {
  validateSelection(costumeId, pose);
  const base = await readGeneration(file, pose, settings.sources, false);
  assert.equal(base.identity, 'base', 'Expected the approved base model, not a face test');
  assert(base.reference.equals(await readCostumeReference(costumeId)), 'Base must use the selected costume mannequin');
  const webp = await sharp(base.png).webp({lossless: true}).toBuffer();
  return {...base, webp, storedWebpSha256: sha256(webp)};
}

async function saveCandidate(file, costumeId, pose, settings = operator) {
  const base = await readBase(file, costumeId, pose, settings);
  const dir = path.join(settings.candidates, costumeId + '-' + sha256(pose.trim()).slice(0,16) + '-' + base.receipt.sha256);
  await fs.mkdir(settings.candidates, {recursive:true});
  const stage = await fs.mkdtemp(path.join(settings.candidates, '.candidate-'));
  try {
    await fs.writeFile(path.join(stage, 'output.png'), base.png);
    // Preserve the provider receipt verbatim, with a portable copy for subsequent checks.
    const sourceFile = 'source.' + (await sharp(base.source).metadata()).format;
    await fs.writeFile(path.join(stage, sourceFile), base.source);
    await fs.writeFile(path.join(stage, 'mannequin.webp'), base.reference);
    await fs.copyFile(file, path.join(stage, 'provider-receipt.json'));
    await fs.writeFile(path.join(stage, 'output.png.json'), json({
      ...base.receipt, output:'output.png', references:[sourceFile, 'mannequin.webp'],
    }));
    await fs.writeFile(path.join(stage, 'base.webp'), base.webp);
    await fs.writeFile(path.join(stage, 'selection.json'), json({costumeId, pose:pose.trim(), storedWebpSha256:base.storedWebpSha256}));
    try {
      await fs.rename(stage,dir);
    } catch (error) {
      if (error.code !== 'EEXIST' && error.code !== 'ENOTEMPTY') throw error;
      const saved = await readBase(path.join(dir,'output.png.json'), costumeId, pose, settings);
      assert.equal(saved.storedWebpSha256, base.storedWebpSha256, 'Existing candidate is inconsistent');
      assert.equal(sha256(await fs.readFile(path.join(dir,'base.webp'))), base.storedWebpSha256);
    }
  } finally {
    await fs.rm(stage, {recursive:true,force:true});
  }
  return dir;
}

async function prepareFace(dir, sourceFile, settings = operator) {
  const {costumeId, pose} = await readJson(path.join(dir, 'selection.json'));
  const base = await readBase(path.join(dir, 'output.png.json'), costumeId, pose, settings);
  const reference = path.resolve(dir, 'base.webp');
  assert.equal(sha256(await fs.readFile(reference)), base.storedWebpSha256, 'Candidate WebP has changed');
  assert(['jiwoo','moka'].includes(settings.sources.get(sha256(await fs.readFile(sourceFile)))), 'Expected an approved face-test source');
  const prompt = studioPrompt(pose, true);
  return {model, size:'1024x1280', prompt, references:[path.resolve(sourceFile),reference]};
}

async function approve(reviewFile, settings = operator) {
  const review = await readJson(reviewFile);
  const {costumeId, pose, faces} = review;
  assert(Array.isArray(faces) && faces.length === 2, 'Two visually approved fittings are required');
  for (const entry of [review.base, ...faces]) {
    assert(entry?.verdict === 'pass' && typeof entry.reason === 'string' && entry.reason.trim() &&
      /^[a-f0-9]{64}$/.test(entry.sha256) && typeof entry.receipt === 'string', 'Every reviewed image needs a pass, reason, receipt and digest');
  }
  const fileFor = entry => path.resolve(path.dirname(reviewFile),entry.receipt);
  const base = await readBase(fileFor(review.base), costumeId, pose, settings);
  assert.equal(base.receipt.sha256, review.base.sha256, 'Reviewed base image does not match its receipt');
  const identities = new Set();
  const outputs = new Set([base.receipt.sha256]);
  for (const entry of faces) {
    const face = await readGeneration(fileFor(entry), pose, settings.sources, true);
    assert.equal(face.receipt.sha256, entry.sha256, 'Reviewed face image does not match its receipt');
    assert(['jiwoo','moka'].includes(face.identity) && !identities.has(face.identity), 'Expected two distinct approved face-test sources');
    assert(face.reference.equals(base.webp), 'Both fittings must reference this exact costume base');
    assert(!outputs.has(face.receipt.sha256), 'Each fitting must have its own output');
    identities.add(face.identity);
    outputs.add(face.receipt.sha256);
  }

  const entry = {costumeId, pose:pose.trim(), storedWebpSha256:base.storedWebpSha256};
  const manifest = path.join(settings.catalog, 'approved.json');
  // A single writer prevents parallel operators from silently dropping one another's approvals.
  const lock = path.join(settings.catalog,'.approve-lock');
  await fs.mkdir(lock);
  try {
    const entries = await readJson(manifest);
    assert(Array.isArray(entries), 'Expected an existing approval manifest');
    const old = entries.findIndex(item => item.costumeId === costumeId && item.pose === entry.pose);
    if (old < 0) entries.push(entry); else entries[old] = entry;
    await fs.writeFile(path.join(lock,'base.webp'),base.webp);
    await fs.rename(path.join(lock,'base.webp'),path.join(settings.catalog,entry.storedWebpSha256+'.webp'));
    await fs.writeFile(path.join(lock,'approved.json'),json(entries));
    await fs.rename(path.join(lock,'approved.json'),manifest);
  } finally {
    await fs.rm(lock,{recursive:true,force:true});
  }
  return entry;
}

async function main([command,...args]) {
  if (command === '--candidate' && args.length === 3) return saveCandidate(...args);
  if (command === '--prepare-face' && args.length === 2) return prepareFace(...args);
  if (command === '--approve' && args.length === 1) return approve(...args);
  throw new Error('Use --candidate BASE.png.json COSTUME_ID "POSE", --prepare-face CANDIDATE_DIR FACE_FILE, or --approve REVIEW.json');
}
if (require.main === module) main(process.argv.slice(2)).then(result=>console.log(json(result))).catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports = {saveCandidate, prepareFace, approve};
