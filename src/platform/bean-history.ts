import {reject} from './http';
export function beanHistoryFilter(query:any={}){
 const invalid=()=>reject(400,'INVALID_HISTORY_FILTER','내역 조회 조건을 확인해주세요.');
 const value=(key:string,max:number)=>{const v=query[key];if(v===undefined||v==='')return '';if(typeof v!=='string'||v.length>max)invalid();return v.trim();};
 const day=(key:string)=>{const v=value(key,10);if(!v)return undefined;const d=new Date(v+'T00:00:00+09:00');if(!/^\d{4}-\d{2}-\d{2}$/.test(v)||!Number.isFinite(+d)||new Date(+d+9*3600000).toISOString().slice(0,10)!==v)invalid();return d;};
 const from=day('from'),to=day('to');if(from&&to&&from>to)invalid();
 const status=value('status',30),direction=value('direction',3),q=value('q',100);
 if(status&&!['pending','processing','paid','failed','cancelled','disputed'].includes(status))invalid();
 if(direction&&!['in','out'].includes(direction))invalid();
 return {created_at:from||to?{...(from?{gte:from}:{}),...(to?{lt:new Date(+to+86400000)}:{})}:undefined,status:status||undefined,direction,q};
}
