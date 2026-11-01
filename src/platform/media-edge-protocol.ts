import {createHmac,timingSafeEqual} from 'node:crypto';
import {isIP} from 'node:net';

export const edgeHeader='x-crefans-edge-';
type Headers=Record<string,string|string[]|undefined>;
export type EdgeEnvelope={purpose:'origin'|'media';ip:string;at:string;id:string;method:string;uri:string;mediaMethod:string;range:string;cookie:string};
export function authCookie(raw:string){
 const values=new Map<string,string>();
 for(const part of raw.split(';')){const i=part.indexOf('=');if(i<0)continue;const name=part.slice(0,i).trim(),value=part.slice(i+1).trim();if(!['access_token','refresh_token'].includes(name))continue;if(values.has(name)||value.length>4096||/[\r\n]/.test(value))throw new Error('Invalid session cookie');values.set(name,value);}
 return [...values].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k}=${v}`).join('; ');
}
export function edgeSignature(secret:string,envelope:EdgeEnvelope){return createHmac('sha256',secret).update(JSON.stringify(envelope)).digest('hex');}
export function signedEdgeHeaders(secret:string,envelope:EdgeEnvelope){return Object.fromEntries(['purpose','ip','at','id','mediaMethod'].map(key=>[edgeHeader+(key==='mediaMethod'?'method':key),envelope[key]]).concat([[edgeHeader+'signature',edgeSignature(secret,envelope)]]));}
export function verifyEdgeRequest(req:{headers:Headers;method:string;originalUrl?:string;url?:string},secret:string,now=Date.now()):EdgeEnvelope|undefined {
 if(!/^[a-f0-9]{64}$/.test(secret))return;
 const h=(name:string)=>typeof req.headers[name]==='string'?req.headers[name] as string:'';
 const purpose=h(edgeHeader+'purpose'),ip=h(edgeHeader+'ip'),at=h(edgeHeader+'at'),id=h(edgeHeader+'id'),mediaMethod=h(edgeHeader+'method'),signature=h(edgeHeader+'signature');
 if(!['origin','media'].includes(purpose)||!isIP(ip)||ip.includes('%')||!/^\d{13}$/.test(at)||Math.abs(now-Number(at))>15000||!id||id.length>160||!/^[-A-Za-z0-9_=]+$/.test(id)||!/^\w{64}$/.test(signature))return;
 try{
  const envelope:EdgeEnvelope={purpose:purpose as 'origin'|'media',ip,at,id,method:purpose==='media'?req.method:'',uri:purpose==='media'?(req.originalUrl||req.url||''):'',mediaMethod:purpose==='media'?mediaMethod:'',range:purpose==='media'?h('range'):'',cookie:purpose==='media'?authCookie(h('cookie')):''};
  const expected=edgeSignature(secret,envelope);if(!/^[a-f0-9]{64}$/.test(signature)||!timingSafeEqual(Buffer.from(signature,'hex'),Buffer.from(expected,'hex')))return;
  return envelope;
 }catch{return;}
}
