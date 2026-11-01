import {ConfigService} from '@nestjs/config';
import {normalizeEmail} from '../auth/local/credentials';
import {isBeta} from './beta-policy';
import {reject} from './http';
import {hasActiveInvite} from './signup-invites';

// Shown when a non-invited email asks for a signup code during the beta.
export const INVITE_REQUIRED_MESSAGE='현재 기간(~26년 11월)에는 사전 협의된 유저만 가입할 수 있습니다. 빠른 시일 내에 그랜드 오픈을 준비하겠습니다.';

// Only an explicit server setting can defer identity verification. It never grants adult access.
// Invited emails come from SIGNUP_EMAIL_ALLOWLIST or an active console invite (signup_invites); either one passes.
export function signupPolicy(config:ConfigService){
 const identityRequired=config.get('SIGNUP_IDENTITY_MODE')!=='email-only';
 const allowedEmails=String(config.get('SIGNUP_EMAIL_ALLOWLIST')||'').split(',').map(normalizeEmail).filter(Boolean);
 const inviteOnly=isBeta(config)||allowedEmails.length>0,listed=(email:string)=>allowedEmails.includes(normalizeEmail(email));
 return{identityRequired,inviteOnly,listed,assertEmail(email:string){
  if(inviteOnly&&!listed(email))reject(403,'SIGNUP_INVITE_REQUIRED',INVITE_REQUIRED_MESSAGE);
 },async assertInvited(email:string,db:any){
  if(inviteOnly&&!listed(email)&&!await hasActiveInvite(db,email))reject(403,'SIGNUP_INVITE_REQUIRED',INVITE_REQUIRED_MESSAGE);
 }};
}
