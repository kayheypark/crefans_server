const {test}=require('node:test'),assert=require('node:assert/strict');
const {settlementHoldReasons,settlementPending}=require('../dist/src/platform/settlement-receipts');
// Creator agreement 7⑥: each pending settlement says why it is held — the hold period, the PG deposit reconciliation, or both.
test('hold reasons name the period and the PG reconciliation separately; none once both are met',()=>{
 const now=new Date('2026-10-31T00:00:00Z'),later=new Date('2026-11-05T00:00:00Z'),past=new Date('2026-10-20T00:00:00Z');
 assert.deepEqual(settlementHoldReasons({available_at:later,receipt_confirmed_at:null,received_amount:null,net:8000},now),['period','receipt']);
 assert.deepEqual(settlementHoldReasons({available_at:past,receipt_confirmed_at:null,received_amount:null,net:8000},now),['receipt']);
 assert.deepEqual(settlementHoldReasons({available_at:later,receipt_confirmed_at:past,received_amount:8000,net:8000},now),['period']);
 assert.deepEqual(settlementHoldReasons({available_at:past,receipt_confirmed_at:past,received_amount:7999,net:8000},now),['receipt'],'a short deposit keeps the hold');
 assert.deepEqual(settlementHoldReasons({available_at:past,receipt_confirmed_at:past,received_amount:8000,net:8000},now),[]);
 assert.equal(settlementPending({available_at:past,receipt_confirmed_at:past,received_amount:8000,net:8000},now),false);
 assert.equal(settlementPending({available_at:past,receipt_confirmed_at:null,received_amount:null,net:0},now),true,'pending rule unchanged: no receipt record keeps it pending');
});
