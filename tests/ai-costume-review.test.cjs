const assert = require('node:assert/strict');
const {test} = require('node:test');
const {costumeReviewTarget, queueCostumeFailure} = require('../dist/src/platform/ai-costume-review');
const costumeId = '6ee320';
const pose = '바닥에 편하게 앉아 쉬는 포즈로 바꿔줘.';

test('review keys persist only a catalog pose or an explicit keep-pose request', () => {
  assert.deepEqual(costumeReviewTarget(costumeId, '개인 요청\n' + pose, true), {costumeId,pose});
  assert.deepEqual(costumeReviewTarget(costumeId, '추가 요청', false), {costumeId,pose:''});
  assert.equal(costumeReviewTarget(costumeId, '자유 포즈 요청', true), undefined);
  assert.equal(costumeReviewTarget(costumeId, pose+'\n두 손을 편하게 모아줘.', true), undefined);
});

test('choice and failure class are the only values written to the review queue', async () => {
  const writes = [];
  const db = {$executeRaw: async (_,...values)=>writes.push(values)};
  const target = {costumeId,pose};
  await queueCostumeFailure(db, target, 'PROVIDER_OUTPUT_BLOCKED', 400);
  await queueCostumeFailure(db, target, 'PROVIDER_ERROR', 200);
  assert.deepEqual(writes, [[costumeId,pose,1,0,1,0],[costumeId,pose,0,1,0,1]]);
  for (const code of ['DAILY_LIMIT','PROVIDER_TIMEOUT','UNSAFE_INPUT','MODERATION_UNAVAILABLE','PROVIDER_ERROR']) {
    await queueCostumeFailure(db, target, code, 503);
  }
  await queueCostumeFailure(db, undefined, 'OUTPUT_BLOCKED_LIMIT', 400);
  assert.equal(writes.length, 2);
});
