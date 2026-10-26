const {test}=require('node:test'),assert=require('node:assert/strict');
const {targets,tick}=require('../scripts/platform-external-monitor.cjs');
const env={MONITOR_SERVICE_ORIGIN:'https://service.test',MONITOR_ADMIN_ORIGIN:'https://console.test',TELEGRAM_OPERATIONS_BOT_TOKEN:'synthetic',TELEGRAM_OPERATIONS_CHAT_ID:'synthetic'};
test('external monitor reports three failures once, then recovery; transient failures stay quiet',async()=>{
 let broken=true,sends=[];const fetch=async(url,options)=>{if(url.startsWith('https://api.telegram.org/')){if(url.endsWith('sendMessage'))sends.push(JSON.parse(options.body).text);return{ok:true,json:async()=>({ok:true,result:{type:'channel',title:'[crefans] operations'}})};}return{ok:!broken,json:async()=>({success:true,data:{status:'ready'}})};};
 let state={};for(let i=0;i<2;i++)state=await tick(env,state,fetch);assert.equal(sends.length,0);state=await tick(env,state,fetch);assert.equal(sends.length,3);state=await tick(env,state,fetch);assert.equal(sends.length,3);broken=false;state=await tick(env,state,fetch);assert.equal(sends.length,6);assert.equal(state.api.failures,0);assert.equal(state.api.alerted,false);assert.match(sends.at(-1),/복구/);
});
test('external monitor refuses embedded credentials/query and wrong Telegram channel',async()=>{
 for(const origin of['http://unsafe.test','https://user:secret@unsafe.test','https://unsafe.test?token=secret'])assert.throws(()=>targets({...env,MONITOR_SERVICE_ORIGIN:origin}),/Invalid/);
 let sent=false;const fake=async(url)=>{if(url.endsWith('sendMessage'))sent=true;return{ok:url.includes('telegram'),json:async()=>({ok:true,result:{type:'channel',title:'other'}})};};
 await assert.rejects(tick(env,{api:{failures:2,alerted:false}},fake),/destination mismatch/);assert.equal(sent,false);
});
