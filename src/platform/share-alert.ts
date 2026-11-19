// 2026-11-19 user request ("공유하기 버튼을 누른 것도 텔레그램으로 추적, 콘텐츠 안 만들고 공유하기로 카톡 보낼 수도 있으니까"):
// every share button press (AI 사진 결과 화면의 공유, 게시물 공유 창의 카카오톡·링크 복사·기기 공유) is sent to the operations Telegram at once.
// Only allow-listed labels are accepted; nothing about the visitor is stored except what every alert keeps (client IP, like 랜딩 방문).
import {kstDay} from './ai-preset-usage';
import {funnelRateLimit,isBotAgent} from './funnel-stats';
import {reject} from './http';
import {requestContext} from './request-context';

export const SHARE_WHERE={ai_result:'AI 사진 결과(게시 전)',post:'게시물 공유 창'} as const;
export const SHARE_METHOD={native:'기기 공유(카톡 등 앱 고르기)',download:'사진 저장(파일 공유 안 되는 기기)',kakao:'카카오톡',copy:'링크 복사',more:'기기 공유(더보기)'} as const;
// kakao 'done' means the Kakao share picker opened; the app cannot know whether a message was actually sent.
export const SHARE_OUTCOME={done:'완료',cancelled:'취소',failed:'실패'} as const;
const METHODS:Record<string,string[]>={ai_result:['native','download','copy'],post:['kakao','copy','more']};
const POST_ID=/^[A-Za-z0-9-]{1,64}$/,FIELDS=new Set(['where','method','outcome','postId']),DAILY_CAP=200;
const device=(ua:string)=>/Mobi|Android|iPhone|iPad|iPod/i.test(ua)?'모바일':'데스크톱';
const kstTime=(d:Date)=>new Date(+d+9*3600000).toISOString().slice(0,16).replace('T',' ');

export function shareInput(input:any){
 const {where,method,outcome,postId}=input||{};
 if(!input||typeof input!=='object'||Object.keys(input).some(k=>!FIELDS.has(k))||!(where in SHARE_WHERE)||!METHODS[where].includes(method)||!(outcome in SHARE_OUTCOME)
  ||(postId!==undefined&&(where!=='post'||typeof postId!=='string'||!POST_ID.test(postId))))reject(400,'INVALID_SHARE','알 수 없는 공유 기록이에요.');
 return{where:where as keyof typeof SHARE_WHERE,method:method as keyof typeof SHARE_METHOD,outcome:outcome as keyof typeof SHARE_OUTCOME,postId:postId as string|undefined};
}

/** Validates, rate-limits and queues the 공유 Telegram alert. The response never waits for Telegram. */
export async function reportShare(db:any,operations:{record:Function},input:any,userAgent:unknown,now=new Date()){
 const share=shareInput(input);
 if(!funnelRateLimit(requestContext.getStore()?.ip))reject(429,'RATE_LIMITED','잠시 후 다시 시도해주세요.');
 if(isBotAgent(userAgent))return{recorded:false};
 try{
  const day=kstDay(now),start=new Date(+day-9*3600000),sent=await db.platformOperationalEvent.count({where:{type:'share.clicked',created_at:{gte:start}}});
  if(sent>=DAILY_CAP){await operations.record('share.cap',{limit:DAILY_CAP},`share.cap:${day.toISOString().slice(0,10)}`,{omitIp:true});return{recorded:false};}
  await operations.record('share.clicked',{'시각(KST)':kstTime(now),'위치':SHARE_WHERE[share.where],'방식':SHARE_METHOD[share.method],'결과':SHARE_OUTCOME[share.outcome]+(share.method==='kakao'&&share.outcome==='done'?'(카카오톡 공유 창 열림)':''),...(share.postId?{'게시물':share.postId}:{}),'기기':device(String(userAgent)),'오늘 공유':sent+1});
  return{recorded:true};
 }catch{console.error(JSON.stringify({event:'share.alert_failed'}));return{recorded:false};}
}
