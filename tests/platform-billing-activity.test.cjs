require('reflect-metadata');require('ts-node/register/transpile-only');
const {test}=require('node:test'),assert=require('node:assert/strict');
const {PlatformFinanceService}=require('../src/platform/finance.service');
function fixture(pending,revoked,expired){const calls=[];const db={billingRegistration:{findMany:async()=>pending.map(id=>({id})),updateMany:async input=>{calls.push(['expire',input]);return{count:expired};}},billingMethod:{findMany:async()=>revoked.map(id=>({id}))}};const finance=new PlatformFinanceService({db},{},{},{});finance.finishRegistration=async id=>{calls.push(['registration',id]);};finance.revokeMethod=async id=>{calls.push(['revocation',id]);};return{finance,calls};}
test('billing activity is zero when all existing queues are empty',async()=>{const {finance}=fixture([],[],0);assert.equal(await finance.retryBilling(),0);});
test('billing activity includes each registration, revocation and expiry update',async()=>{const {finance,calls}=fixture(['pending-a','pending-b'],['revoke-a'],3);assert.equal(await finance.retryBilling(),6);assert.deepEqual(calls.slice(0,3),[['registration','pending-a'],['registration','pending-b'],['revocation','revoke-a']]);assert.equal(calls.at(-1)[0],'expire');});
test('billing retry failures still throw and do not skip subsequent work or expiry',async()=>{const {finance,calls}=fixture(['pending-a','pending-b'],['revoke-a'],2);finance.finishRegistration=async id=>{calls.push(['registration',id]);if(id==='pending-a')throw Error('synthetic failure');};await assert.rejects(finance.retryBilling(),e=>e.getResponse().code==='BILLING_RETRY_FAILED');assert.deepEqual(calls.map(row=>row[0]),['registration','registration','revocation','expire']);});

test('already expired rows are excluded from repeated expiry activity',async()=>{const {finance,calls}=fixture([],[],0);await finance.retryBilling();assert.deepEqual(calls.at(-1)[1].where.status,{notIn:['completed','expired']});});

test('deferred renewal is no work and never invokes a provider or emits minute-by-minute completion',async()=>{
 const tx={$queryRaw:async()=>[],subscription:{findUniqueOrThrow:async()=>({id:'sub',subscriber_id:'fan',membership_item_id:'plan',auto_renew:true,status:'ONGOING',next_billing_date:new Date(0)})},checkoutOrder:{findUnique:async()=>({id:'order',status:'failed',attempts:0,retry_at:new Date(Date.now()+3600000)})},membershipItem:{findUnique:async()=>({id:'plan',creator_id:'creator',is_active:true,is_deleted:false})},member:{findUnique:async()=>({enabled:true})},creator:{findFirst:async()=>({is_active:true})}};
 const db={subscription:{findUniqueOrThrow:async()=>({subscriber_id:'fan'})},$transaction:async fn=>fn(tx)};
 const finance=new PlatformFinanceService({db},{},{get:key=>key==='RENEWAL_MAX_RETRIES'?'2':'1'},{});finance.pay=async()=>assert.fail('provider should not run before retry_at');assert.equal(await finance.renew('sub'),0);
});
