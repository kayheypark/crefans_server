const {test}=require('node:test');const assert=require('node:assert/strict');const {createHash}=require('node:crypto');
const x=require('../dist/src/platform/x-conversions');
const h=v=>createHash('sha256').update(v).digest('hex');

test('hashing: email trimmed and lowercased, phone as E.164, SHA-256 hex',()=>{
 assert.equal(x.hashEmail('  Kay@Example.COM '),h('kay@example.com'));
 assert.equal(x.hashPhone('010-1234-5678'),h('+821012345678'));
 assert.equal(x.hashPhone('+1 (555) 123-4567'),h('+15551234567'));
 assert.match(x.hashEmail('a@b.c'),/^[0-9a-f]{64}$/);
});

test('request: endpoint, token header, body shape; raw email never sent',async()=>{
 let seen;const status=await x.sendXConversion({eventId:'tw-rjls2-abcde',conversionId:'order-1',eventSourceUrl:'https://crefans.com/checkout',time:new Date('2026-11-21T00:00:00Z'),email:'Kay@Example.com',ipAddress:'192.0.2.1',userAgent:'UA'},'tok',async(url,init)=>{seen={url,init};return {ok:true,status:200};});
 assert.equal(status,200);
 assert.equal(seen.url,'https://ads-api.x.com/12/measurement/conversions/rjls2');
 assert.equal(seen.init.method,'POST');assert.equal(seen.init.headers['X-Pixel-Token'],'tok');assert.equal(seen.init.headers['Content-Type'],'application/json');
 assert.deepEqual(JSON.parse(seen.init.body),{conversions:[{conversion_time:'2026-11-21T00:00:00.000Z',event_id:'tw-rjls2-abcde',event_source_url:'https://crefans.com/checkout',conversion_id:'order-1',identifiers:[{hashed_email:h('kay@example.com'),ip_address:'192.0.2.1',user_agent:'UA'}]}]});
 assert.ok(!seen.init.body.toLowerCase().includes('kay@example.com'));
});

test('skips without token or identifier (ip alone is not enough); a failure never throws',async()=>{
 let calls=0;const f=async()=>{calls++;return {ok:true,status:200};};
 assert.equal(await x.sendXConversion({eventId:'e',email:'a@b.c'},'',f),null);
 assert.equal(await x.sendXConversion({eventId:'e',ipAddress:'192.0.2.1'},'tok',f),null);
 assert.equal(calls,0);
 assert.equal(await x.sendXConversion({eventId:'e',twclid:'c'},'tok',async()=>{throw new Error('down');}),null);
 assert.equal(await x.sendXConversion({eventId:'e',twclid:'c'},'tok',async()=>({ok:false,status:400})),400);
});
