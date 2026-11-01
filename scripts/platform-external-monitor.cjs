// Run on an independent host, once per minute (Node >=20). No application DB access.
const fs=require('node:fs/promises'),path=require('node:path');
function targets(env){return [['api',env.MONITOR_SERVICE_ORIGIN,'/api/v1/health'],['service',env.MONITOR_SERVICE_ORIGIN,'/service/feed'],['console',env.MONITOR_ADMIN_ORIGIN,'/login']].map(([name,value,route])=>{const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||u.pathname!=='/')throw Error('Invalid monitor origin');return{name,url:u.origin+route};});}
async function check(target,fetchImpl=fetch){try{const r=await fetchImpl(target.url,{redirect:'error',signal:AbortSignal.timeout(8000),headers:{Accept:target.name==='api'?'application/json':'text/html'}});if(!r.ok)return false;if(target.name==='api'){const b=await r.json();return b.success===true&&b.data?.status==='ready';}await r.body?.cancel();return true;}catch{return false;}}
async function send(env,text,fetchImpl=fetch){
 if(!env.TELEGRAM_OPERATIONS_BOT_TOKEN||!env.TELEGRAM_OPERATIONS_CHAT_ID)throw Error('Monitor destination missing');
 const call=async(method,body)=>{const r=await fetchImpl(`https://api.telegram.org/bot${env.TELEGRAM_OPERATIONS_BOT_TOKEN}/${method}`,{method:'POST',redirect:'error',signal:AbortSignal.timeout(8000),headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});if(!r.ok)throw Error('Monitor delivery failed');const b=await r.json();if(b.ok!==true)throw Error('Monitor delivery failed');return b.result;};
 const chat=await call('getChat',{chat_id:env.TELEGRAM_OPERATIONS_CHAT_ID});if(chat.type!=='channel'||chat.title!=='[crefans] operations')throw Error('Monitor destination mismatch');await call('sendMessage',{chat_id:env.TELEGRAM_OPERATIONS_CHAT_ID,text});
}
async function tick(env,previous={},fetchImpl=fetch,now=new Date()){
 const next={...previous};
 for(const target of targets(env)){
  const healthy=await check(target,fetchImpl),old=previous[target.name]||{failures:0,alerted:false},failures=healthy?0:Math.min(old.failures+1,3);let alerted=old.alerted;
  if(!healthy&&failures===3&&!alerted){await send(env,`[crefans] 외부 상태 점검 실패\n대상: ${target.name}\n연속 실패: 3회\n시각: ${now.toISOString()}`,fetchImpl);alerted=true;}
  if(healthy&&alerted){await send(env,`[crefans] 외부 상태 점검 복구\n대상: ${target.name}\n시각: ${now.toISOString()}`,fetchImpl);alerted=false;}
  next[target.name]={failures,alerted};
 }
 return next;
}
async function main(){
 const file=process.env.MONITOR_STATE_FILE;if(!file||!path.isAbsolute(file))throw Error('Absolute monitor state file required');await fs.mkdir(path.dirname(file),{recursive:true,mode:0o700});
 let previous={};try{previous=JSON.parse(await fs.readFile(file,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}const next=await tick(process.env,previous);await fs.writeFile(file+'.tmp',JSON.stringify(next),{mode:0o600});await fs.rename(file+'.tmp',file);console.log(JSON.stringify({event:'external_monitor_checked',at:new Date().toISOString(),states:next}));
}
module.exports={targets,check,send,tick};if(require.main===module)main().catch(()=>{console.error('external_monitor_failed');process.exitCode=1;});
