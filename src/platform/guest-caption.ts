import {Injectable} from '@nestjs/common';
import {ConfigService} from '@nestjs/config';
import {LocalMemberService} from '../auth/local/local-member.service';
import {reject} from './http';

// Guest trial post caption (2026-11-16 user decision): the trial starts with the AI photo; at publish time an empty title/body
// is written by AI from the chosen preset names and the visitor's own request text only (no photo, no IP, no identifier is sent).
// The visitor sees the result and confirms before the post is published. Provider trouble falls back to a fixed sentence.
const RESPONSES_URL='https://api.openai.com/v1/responses',MODERATION_URL='https://api.openai.com/v1/moderations',MODERATION_MODEL='omni-moderation-latest';
export const CAPTION_LIMITS={items:12,itemLength:40,promptLength:300,title:40,body:300,perDay:30};
const INSTRUCTIONS=`너는 사진 공유 서비스의 게시글 작성 도우미야. 사용자가 AI로 사진을 편집할 때 고른 항목과 요청 문장을 보고,
그 사진을 올리는 게시글의 제목과 본문을 한국어로 써.
- 제목: 20자 안팎, 최대 ${CAPTION_LIMITS.title}자. 본문: 1~2문장, 최대 ${CAPTION_LIMITS.body}자. 밝고 자연스러운 말투, 이모지는 많아야 1개.
- 실존 인물·작품·브랜드 이름, 선정적·폭력적 표현, 개인정보, 해시태그, 링크는 쓰지 마.
- 사진에 무엇이 보이는지 단정하지 말고 고른 항목 위주로 써.
- 반드시 {"title":"...","body":"..."} JSON 하나만 출력해.`;

export type CaptionInput={items:string[];prompt:string};
export function captionInput(input:any):CaptionInput{
 if(input?.items!==undefined&&!Array.isArray(input.items))reject(400,'INVALID_CAPTION_INPUT','게시글을 만들 항목을 다시 확인해 주세요.');
 const clean=(value:unknown,max:number)=>typeof value==='string'?value.replace(/[\r\n\t\x00-\x1f]+/g,' ').trim().slice(0,max):'';
 const items=Array.from(new Set(((input?.items||[]) as unknown[]).map(item=>clean(item,CAPTION_LIMITS.itemLength)).filter(Boolean))).slice(0,CAPTION_LIMITS.items);
 return{items,prompt:clean(input?.prompt,CAPTION_LIMITS.promptLength)};
}
export function fallbackCaption(items:string[]){
 const picked=items.slice(0,3).join(' · ');
 return{title:'AI로 바꾼 오늘의 사진',body:picked?`${picked} 조합으로 AI 사진을 만들어 봤어요.`:'AI 사진 편집으로 새로운 분위기를 만들어 봤어요.'};
}
export function parseCaption(text:string){
 try{const match=text.match(/\{[\s\S]*\}/);const value=JSON.parse(match?match[0]:text);
  const title=typeof value?.title==='string'?value.title.replace(/\s+/g,' ').trim().slice(0,CAPTION_LIMITS.title):'';
  const body=typeof value?.body==='string'?value.body.replace(/[ \t]+/g,' ').trim().slice(0,CAPTION_LIMITS.body):'';
  return title&&body?{title,body}:null;}catch{return null;}
}
function outputText(body:any){return(body?.output||[]).filter((item:any)=>item?.type==='message').flatMap((item:any)=>item.content||[]).filter((part:any)=>part?.type==='output_text').map((part:any)=>part.text).join('').trim();}

@Injectable()
export class GuestCaptionService{
 fetcher:typeof fetch=fetch;
 constructor(private config:ConfigService,private limiter:LocalMemberService){}
 private settings(){return{apiKey:(this.config.get('AI_PHOTO_OPENAI_API_KEY')||this.config.get('GUIDE_ADVISOR_OPENAI_API_KEY')||'').trim(),model:(this.config.get('GUEST_CAPTION_MODEL')||this.config.get('GUIDE_ADVISOR_MODEL')||'').trim()||'gpt-6-luna'};}
 private async flagged(apiKey:string,text:string){
  const res=await this.fetcher(MODERATION_URL,{method:'POST',signal:AbortSignal.timeout(5000),headers:{'Content-Type':'application/json',Authorization:'Bearer '+apiKey},body:JSON.stringify({model:MODERATION_MODEL,input:text})});
  const body=await res.json().catch(()=>null),verdict=body?.results?.[0]?.flagged;
  if(!res.ok||typeof verdict!=='boolean')throw new Error('moderation');return verdict;
 }
 async caption(guestId:string,raw:any){
  const input=captionInput(raw);
  try{await this.limiter.limit('guest-caption:'+guestId,CAPTION_LIMITS.perDay,86400);}catch(error:any){if(error?.getStatus?.()!==429)throw error;return{...fallbackCaption(input.items),source:'template'};}
  const {apiKey,model}=this.settings();
  if(!apiKey||!input.items.length&&!input.prompt)return{...fallbackCaption(input.items),source:'template'};
  try{
   const request=[input.items.length?`고른 항목: ${input.items.join(', ')}`:'',input.prompt?`요청 문장: ${input.prompt}`:''].filter(Boolean).join('\n');
   // A flagged request keeps only the preset names, which come from the service catalog.
   const usePrompt=!!input.prompt&&!await this.flagged(apiKey,request);
   const source=usePrompt?request:`고른 항목: ${input.items.join(', ')}`;
   if(!input.items.length&&!usePrompt)return{...fallbackCaption([]),source:'template'};
   const res=await this.fetcher(RESPONSES_URL,{method:'POST',signal:AbortSignal.timeout(15000),headers:{'Content-Type':'application/json',Authorization:'Bearer '+apiKey},
    body:JSON.stringify({model,instructions:INSTRUCTIONS,input:source,store:false,max_output_tokens:400})});
   const caption=res.ok?parseCaption(outputText(await res.json().catch(()=>null))):null;
   if(!caption||await this.flagged(apiKey,`${caption.title}\n${caption.body}`))return{...fallbackCaption(input.items),source:'template'};
   return{...caption,source:'ai'};
  }catch{return{...fallbackCaption(input.items),source:'template'};}
 }
}
