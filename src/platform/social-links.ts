import {reject} from './http';
// 크리에이터 SNS 링크(2026-11-08 사용자 결정): 화면은 아이디만 받고 전체 주소를 저장한다. 서버도 칸마다 같은 서비스 주소·아이디 글자만 허용한다.
// 프론트 lib/crefans/social-links.ts 와 같은 규칙. 이미 저장된 다른 형식의 주소(예: 유튜브 /channel/…)는 바꾸지 않고 다시 보낼 때만 그대로 둔다.
export const SOCIAL_KINDS=['youtube','instagram','facebook'] as const;
export type SocialKind=typeof SOCIAL_KINDS[number];
const PREFIX:Record<SocialKind,string>={youtube:'https://youtube.com/@',instagram:'https://instagram.com/',facebook:'https://facebook.com/'};
const PATTERN:Record<SocialKind,RegExp>={
 youtube:/^https?:\/\/(?:www\.|m\.)?youtube\.com\/@([A-Za-z0-9._-]{1,100})\/?$/i,
 instagram:/^https?:\/\/(?:www\.)?instagram\.com\/([A-Za-z0-9._-]{1,100})\/?$/i,
 facebook:/^https?:\/\/(?:www\.|m\.)?facebook\.com\/([A-Za-z0-9._-]{1,100})\/?$/i,
};
const LABEL:Record<SocialKind,string>={youtube:'유튜브',instagram:'인스타그램',facebook:'페이스북'};

/** 저장할 링크 묶음. 빈 칸은 빠지고, 형식이 맞으면 정규 주소로, 이전 값과 같으면 그대로, 그 밖은 400. */
export function normalizeSocialLinks(input:unknown,previous:unknown):Partial<Record<SocialKind,string>>{
 const source=(input&&typeof input==='object'?input:{}) as Record<string,unknown>,prior=(previous&&typeof previous==='object'?previous:{}) as Record<string,unknown>;
 const links:Partial<Record<SocialKind,string>>={};
 for(const kind of SOCIAL_KINDS){
  const raw=source[kind];if(raw===undefined||raw===null||raw==='')continue;
  if(typeof raw!=='string'||raw.length>500)reject(400,'INVALID_URL',`${LABEL[kind]} 주소를 확인해주세요.`);
  const value=raw.trim();if(!value)continue;
  const match=PATTERN[kind].exec(value);
  if(match){links[kind]=PREFIX[kind]+match[1];continue;}
  if(typeof prior[kind]==='string'&&prior[kind]===value){links[kind]=value;continue;}
  reject(400,'INVALID_URL',`${LABEL[kind]} 주소를 확인해주세요.`);
 }
 return links;
}
