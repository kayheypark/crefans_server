const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {test} = require('node:test');

const builtModule = require.resolve('../dist/src/platform/ai-photo-composite-bases');
const pose = '바닥에 편하게 앉아 쉬는 포즈로 바꿔줘.';
const id = 'd63f76';
const pixels = Buffer.from('approved test fixture');
const digest = createHash('sha256').update(pixels).digest('hex');
const entry = {costumeId:id, pose, storedWebpSha256:digest};

async function fixture(t, approved) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'crefans-approved-test-'));
  t.after(() => fs.rm(dir, {recursive:true, force:true}));
  const assets = path.join(dir, 'ai-photo-composite-bases');
  await fs.mkdir(assets);
  const modulePath = path.join(dir, 'lookup.cjs');
  await fs.copyFile(builtModule, modulePath);
  await fs.writeFile(path.join(assets, 'approved.json'), JSON.stringify(approved));
  return {assets, lookup:require(modulePath).readCostumeCompositeBase};
}

test('Nest packages the approved catalog and content-addressed images', async () => {
  const source = path.resolve(__dirname, '../src/platform/ai-photo-composite-bases');
  const built = path.join(path.dirname(builtModule), 'ai-photo-composite-bases');
  const manifest = await fs.readFile(path.join(source, 'approved.json'));
  assert.deepEqual(await fs.readFile(path.join(built, 'approved.json')), manifest);
  for (const {storedWebpSha256} of JSON.parse(manifest)) {
    assert.match(storedWebpSha256, /^[0-9a-f]{64}$/);
    const image = await fs.readFile(path.join(built, storedWebpSha256 + '.webp'));
    assert.equal(createHash('sha256').update(image).digest('hex'), storedWebpSha256);
  }
});

test('returns only the intact approved image for a matching costume and entire pose line', async t => {
  const {assets, lookup} = await fixture(t, [entry]);
  const image = path.join(assets, digest + '.webp');
  assert.equal(await lookup(id, pose), null);
  await fs.writeFile(image, pixels);
  assert.deepEqual(await lookup(id, '의상을 변경해줘.\r\n ' + pose + ' '), pixels);
  assert.equal(await lookup('abcdef', pose), null);
  assert.equal(await lookup(id, pose + ' 추가 요청'), null);
  assert.equal(await lookup(id, pose, false), null);
  await fs.writeFile(image, 'modified');
  assert.equal(await lookup(id, pose), null);
});

test('a costume-only choice selects only the original-pose entry', async t => {
  const standing = Buffer.from('outfit-only example');
  const originalDigest = createHash('sha256').update(standing).digest('hex');
  const {assets, lookup} = await fixture(t, [entry, {...entry, pose:'', storedWebpSha256:originalDigest}]);
  await fs.writeFile(path.join(assets, digest + '.webp'), pixels);
  await fs.writeFile(path.join(assets, originalDigest + '.webp'), standing);
  assert.deepEqual(await lookup(id, '의상만 변경해줘.', false), standing);
  assert.deepEqual(await lookup(id, pose, false), standing);
  assert.deepEqual(await lookup(id, pose, true), pixels);
  assert.equal(await lookup(id, '다른 포즈', true), null);
  assert.equal(await lookup(id, '', true), null);
});

test('files outside the approval list and ambiguous pose matches are ignored', async t => {
  const unapproved = await fixture(t, []);
  await fs.writeFile(path.join(unapproved.assets, digest + '.webp'), pixels);
  const legacy = path.join(unapproved.assets, id + '-85db1f3d0a66442d-' + digest);
  await fs.mkdir(legacy);
  await fs.writeFile(path.join(legacy, 'base.webp'), pixels);
  assert.equal(await unapproved.lookup(id, pose), null);

  const otherPose = '벽에 기대어 서 있는 포즈로 바꿔줘.';
  const ambiguous = await fixture(t, [entry, {...entry, pose:otherPose}]);
  await fs.writeFile(path.join(ambiguous.assets, digest + '.webp'), pixels);
  assert.equal(await ambiguous.lookup(id, [pose,otherPose].join('\n')), null);
});
