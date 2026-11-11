import {randomUUID} from 'node:crypto';
import {digest,verifyPassword} from '../auth/local/credentials';
import {notifyMember} from './member-notices';
import {appendAudit} from './audit';

// Withdrawal PIN rules shared by membership and bean withdrawals (2026-11-11 user decision "PIN 잠금 강화").
// - 5 wrong PINs in a row lock entry for 30 seconds (unchanged).
// - 10 wrong PINs within 24 hours disable the PIN: it is removed, open confirmations are voided and the creator must set a
//   new PIN through PASS identity verification (the reset page). NIST SP 800-63B-4 3.2.2 caps consecutive failures at 100
//   and asks to disable the authenticator; OWASP lists lockout after repeated back-off. A correct PIN clears both counters.
// - Common PINs (one digit repeated, straight runs, a short list of the most used numbers) are refused at setup
//   (NIST SP 800-63B-4 3.1.1.2 blocklist).
export const PIN_SHORT_LOCK={failures:5,ms:30000};
export const PIN_DAILY_LIMIT={failures:10,ms:86400000};
const COMMON=new Set(['123123','121212','112233','102030','147258','159753','111222','123321','654321','987654','000123','696969','131313','520520','010101']);
export function weakPin(pin:string){
 if(/^(\d)\1{5}$/.test(pin)||COMMON.has(pin))return true;
 const steps=new Set([...pin].slice(1).map((d,i)=>(Number(d)-Number(pin[i])+10)%10));
 return steps.size===1&&(steps.has(1)||steps.has(9));
}
export const WEAK_PIN_MESSAGE='같은 숫자 반복·연속 숫자처럼 추측하기 쉬운 번호는 쓸 수 없어요. 다른 번호를 입력해 주세요.';

export type PinCheck='PIN_LOCKED'|'PIN_NOT_CONFIGURED'|'INVALID_PIN'|'PIN_RESET_REQUIRED'|null;
/** Call inside a transaction that already holds the creator row lock. Failures are written, so the caller must commit. */
export async function checkWithdrawalPin(tx:any,member:string,pin:unknown,now=new Date()):Promise<PinCheck>{
 const shortId=digest(`withdrawal-pin:${member}`),dayId=digest(`withdrawal-pin-day:${member}`);
 const short=await tx.authRateBucket.findUnique({where:{id:shortId}});
 if(short?.count>=PIN_SHORT_LOCK.failures&&short.expires_at>now)return 'PIN_LOCKED';
 const credential=await tx.withdrawalCredential.findUnique({where:{creator_id:member}});if(!credential)return 'PIN_NOT_CONFIGURED';
 if(typeof pin==='string'&&/^\d{6}$/.test(pin)&&await verifyPassword(`withdrawal-pin:${pin}`,credential.pin_hash)){
  await tx.authRateBucket.deleteMany({where:{id:{in:[shortId,dayId]}}});return null;
 }
 const count=short&&short.expires_at>now?short.count+1:1,shortUntil=new Date(now.getTime()+PIN_SHORT_LOCK.ms);
 await tx.authRateBucket.upsert({where:{id:shortId},create:{id:shortId,count,expires_at:shortUntil},update:{count,expires_at:shortUntil}});
 const day=await tx.authRateBucket.findUnique({where:{id:dayId}}),active=day&&day.expires_at>now,dayCount=active?day.count+1:1;
 // The 24-hour window starts at the first failure and is not extended by later ones.
 await tx.authRateBucket.upsert({where:{id:dayId},create:{id:dayId,count:dayCount,expires_at:new Date(now.getTime()+PIN_DAILY_LIMIT.ms)},update:active?{count:dayCount}:{count:1,expires_at:new Date(now.getTime()+PIN_DAILY_LIMIT.ms)}});
 if(dayCount<PIN_DAILY_LIMIT.failures)return count>=PIN_SHORT_LOCK.failures?'PIN_LOCKED':'INVALID_PIN';
 await tx.withdrawalCredential.deleteMany({where:{creator_id:member}});
 await tx.withdrawalAuthorization.deleteMany({where:{creator_id:member}});await tx.beanWithdrawalAuthorization.deleteMany({where:{creator_id:member}});
 await tx.authRateBucket.deleteMany({where:{id:{in:[shortId,dayId]}}});
 await appendAudit(tx,{category:'security',action:'withdrawal_pin.disabled',level:'warning',entityId:member,data:{failures:dayCount}});
 await notifyMember(tx,{dedupeKey:`withdrawal-pin-locked:${randomUUID()}`,memberId:member,kind:'withdrawal-pin-locked',path:'/studio/security/reset',
  text:`출금 PIN을 24시간 안에 ${PIN_DAILY_LIMIT.failures}번 잘못 입력해 PIN을 사용할 수 없게 했어요. PASS 본인인증으로 새 PIN을 설정해 주세요.`,
  rows:[['내용',`24시간 안에 ${PIN_DAILY_LIMIT.failures}번 잘못 입력`],['조치','출금 PIN 사용 중지, 진행 중이던 출금 확인 취소']],
  note:'출금은 PASS 본인인증으로 새 PIN을 설정한 뒤 다시 신청할 수 있습니다.'});
 return 'PIN_RESET_REQUIRED';
}
export async function noticePinChanged(tx:any,member:string,replaced:boolean){
 await appendAudit(tx,{category:'security',action:replaced?'withdrawal_pin.reset':'withdrawal_pin.set',entityId:member});
 if(!replaced)return;
 await notifyMember(tx,{dedupeKey:`withdrawal-pin-changed:${randomUUID()}`,memberId:member,kind:'withdrawal-pin-changed',path:'/studio/security',
  text:'출금 PIN이 PASS 본인인증으로 새 번호로 바뀌었어요. 본인이 바꾸지 않았다면 바로 고객센터에 알려 주세요.',
  rows:[['내용','출금 PIN 재설정'],['인증','PASS 본인인증']],note:'바꾸기 전에 확인한 출금은 새 PIN으로 다시 확인해야 합니다.'});
}
export const pinCheckMessage:Record<Exclude<PinCheck,null>,string>={
 PIN_LOCKED:`${PIN_SHORT_LOCK.ms/1000}초 후 다시 인증해주세요.`,PIN_NOT_CONFIGURED:'간편비밀번호를 설정해주세요.',INVALID_PIN:'간편비밀번호를 확인해주세요.',
 PIN_RESET_REQUIRED:`24시간 안에 ${PIN_DAILY_LIMIT.failures}번 잘못 입력해 출금 PIN을 사용할 수 없게 했어요. PASS 본인인증으로 새 PIN을 설정해 주세요.`};
export const pinCheckStatus=(error:Exclude<PinCheck,null>)=>error==='PIN_LOCKED'?429:error==='PIN_RESET_REQUIRED'?423:403;
