// 2026-10-31 user decision: requests received by Tuesday 23:59 KST are paid that Wednesday; Wednesday requests wait a week.
const {test}=require('node:test'),assert=require('node:assert/strict');
const {payoutCutoff,inPayoutBatch,payoutQueue,isPayoutDay}=require('../dist/src/platform/beta-policy');
const kst=s=>new Date(s+'+09:00');
test('Tuesday 23:59 KST joins that Wednesday; Wednesday 00:00 KST waits for the next week',()=>{
 const wed=kst('2026-11-04T10:00:00');assert.equal(isPayoutDay(wed),true);
 assert.equal(payoutCutoff(wed).toISOString(),kst('2026-11-04T00:00:00').toISOString());
 assert.equal(inPayoutBatch(kst('2026-11-03T23:59:59'),wed),true);
 assert.equal(inPayoutBatch(kst('2026-11-04T00:00:00'),wed),false);
 assert.equal(inPayoutBatch(kst('2026-11-04T09:00:00'),wed),false);
 assert.equal(inPayoutBatch(kst('2026-10-28T12:00:00'),wed),true,'an older request still in the queue is paid');
 assert.equal(inPayoutBatch(kst('2026-11-03T12:00:00'),kst('2026-11-03T23:00:00')),false,'nothing is claimed on a Tuesday');
 assert.equal(inPayoutBatch(kst('2026-11-03T12:00:00'),kst('2026-11-05T09:00:00')),false,'nor on Thursday');
});
test('the worker queue takes processing rows always and requested rows only up to the cutoff on Wednesday',()=>{
 const wed=kst('2026-11-04T00:30:00');
 assert.deepEqual(payoutQueue(wed),{OR:[{status:'processing'},{status:'requested',created_at:{lt:kst('2026-11-04T00:00:00')}}]});
 assert.deepEqual(payoutQueue(kst('2026-11-05T00:30:00')),{status:'processing'});
});
