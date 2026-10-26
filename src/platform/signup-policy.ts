import {ConfigService} from '@nestjs/config';
import {normalizeEmail} from '../auth/local/credentials';
import {isBeta} from './beta-policy';
import {reject} from './http';

// Only an explicit server setting can defer identity verification. It never grants adult access.
export function signupPolicy(config:ConfigService){
 const identityRequired=config.get('SIGNUP_IDENTITY_MODE')!=='email-only';
 const allowedEmails=String(config.get('SIGNUP_EMAIL_ALLOWLIST')||'').split(',').map(normalizeEmail).filter(Boolean);
 return{identityRequired,inviteOnly:isBeta(config)||allowedEmails.length>0,assertEmail(email:string){
  if((isBeta(config)||allowedEmails.length>0)&&!allowedEmails.includes(normalizeEmail(email)))reject(403,'SIGNUP_INVITE_REQUIRED','초대된 이메일로 가입해주세요.');
 }};
}
