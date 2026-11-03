import {mailLogo} from './logo';

export type CodePurpose = 'verify' | 'reset' | 'email-change';
const codeCopy = {
  verify: ['이메일 인증 코드입니다', '이메일을 인증해주세요', '크레팬스 회원가입 화면에 아래 인증 코드를 입력해주세요.'],
  reset: ['비밀번호 재설정 코드입니다', '비밀번호를 재설정해주세요', '비밀번호 재설정 화면에 아래 인증 코드를 입력해주세요.'],
  'email-change': ['새 이메일 주소를 인증해주세요', '새 이메일을 인증해주세요', '계정 이메일 주소를 변경하려면 아래 인증 코드를 입력해주세요.'],
} as const;
export const noticeCopy = {
  'moderation': ['크레팬스 운영 조치 안내', '운영 조치를 안내드립니다', '운영 정책에 따라 아래 조치를 했습니다. 이의가 있으면 고객센터로 설명과 자료를 보내 주세요.', '자세히 보기'],
  'bean-expiry': ['콩 유효기간이 곧 끝납니다', '콩 유효기간 만료 예정', '아래 안내된 만료일이 지나면 해당 콩의 미사용 잔액이 소멸합니다. 기간 안에 후원에 사용하거나, 충전한 콩은 지갑에서 환불을 신청할 수 있습니다.', '콩 지갑 보기'],
  'renewal-stopped': ['멤버십 자동 갱신이 종료되었습니다', '자동 갱신이 종료되었습니다', '결제가 완료되지 않아 멤버십 자동 갱신이 종료되었습니다. 결제수단을 확인한 후 다시 가입할 수 있습니다.', '구독 내역 보기'],
  'account-changed': ['계정 정보가 변경되었습니다', '계정 정보가 변경되었습니다', '계정 정보 변경 내역을 확인해주세요.', '계정 설정 확인'],
  'payment-completed': ['멤버십 결제가 완료되었습니다', '멤버십 결제가 완료되었습니다', '멤버십 결제 내역을 확인해주세요.', '결제 내역 보기'],
  'renewal-upcoming': ['멤버십 정기결제가 예정되어 있습니다', '다음 결제를 안내드립니다', '다음 정기결제가 예정되어 있습니다. 결제수단과 구독 상태를 확인해주세요.', '구독 관리'],
  'payment-failed': ['멤버십 결제를 완료하지 못했습니다', '결제수단을 확인해주세요', '멤버십 결제를 완료하지 못했습니다. 등록된 결제수단의 상태를 확인해주세요.', '결제수단 관리'],
  'subscription-cancelled': ['멤버십 구독 해지가 예약되었습니다', '구독 해지가 예약되었습니다', '이용 종료 시점까지 멤버십을 이용할 수 있으며 다음 정기결제는 진행되지 않습니다.', '구독 내역 보기'],
  'subscription-ended': ['멤버십 구독이 종료되었습니다', '멤버십 구독이 종료되었습니다', '멤버십 이용기간이 종료되었습니다. 그동안 이용해주셔서 감사합니다.', '구독 내역 보기'],
  'refund-completed': ['환불이 처리되었습니다', '환불 처리가 완료되었습니다', '멤버십 결제의 환불 처리가 완료되었습니다.', '환불 내역 보기'],
  'withdrawal-received': ['출금 신청이 접수되었습니다', '출금 신청이 접수되었습니다', '신청하신 출금 내용을 확인해주세요. 처리 상태는 출금 내역에서 확인할 수 있습니다.', '출금 내역 보기'],
  'withdrawal-completed': ['출금이 완료되었습니다', '출금이 완료되었습니다', '수령 계좌의 입금 내역을 확인해주세요.', '출금 상세 보기'],
  'withdrawal-failed': ['출금을 완료하지 못했습니다', '출금 계좌를 확인해주세요', '아래 사유와 수령 계좌 정보를 확인해주세요.', '출금 상세 보기'],
} as const;
const clean = (value: string) => String(value).replace(/\u2014/g, ', ');
const escape = (value: string) => clean(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const security = '본인이 요청하지 않았다면 이 메일을 무시하셔도 됩니다. 인증 코드는 다른 사람에게 알려주지 마세요.';
const linkStyle = 'display:inline-block;background:transparent;border:0;border-radius:0;padding:0;color:#1746C7;font-size:14px;line-height:1.8;font-weight:bold;text-decoration:underline;text-underline-offset:5px';
function render(subject: string, title: string, intro: string, body: string, plain: string, note: string) {
  const text = clean(`${title}\n\n${intro}\n\n${plain}\n\n${note}\n\n© CREFANS\n이 메일은 계정 및 서비스 이용에 관한 자동 안내 메일입니다.`);
  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#fff;color:#262832;font-family:Arial,'Apple SD Gothic Neo',sans-serif"><div style="display:none;max-height:0;overflow:hidden">${escape(intro)}</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:0"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;max-width:540px;background:white;border:0;border-radius:0;border-spacing:0"><tr><td style="padding:24px 16px 0"><img src="cid:crefans-logo@crefans.com" width="112" alt="crefans" style="display:block;border:0;max-width:100%;height:auto"><h1 style="font-size:22px;line-height:1.45;letter-spacing:-.6px;margin:30px 0 12px;color:#262832">${escape(title)}</h1><p style="font-size:14px;line-height:1.8;color:#616875;margin:0;word-break:keep-all;overflow-wrap:anywhere">${escape(intro)}</p>${body}<p style="font-size:12px;line-height:1.8;color:#7a818d;border:0;padding:0;margin:30px 0 0;word-break:keep-all;overflow-wrap:anywhere">${escape(note)}</p></td></tr><tr><td style="padding:22px 16px 24px;background:white;border:0;font-size:11px;line-height:1.8;color:#8b929c">© CREFANS<br>이 메일은 계정 및 서비스 이용에 관한 자동 안내 메일입니다.</td></tr></table></td></tr></table></body></html>`;
  return {subject: `[크레팬스] ${clean(subject)}`, text, html, attachments: [{filename:'crefans-logo.png',content:mailLogo,cid:'crefans-logo@crefans.com',contentType:'image/png',contentDisposition:'inline' as const}]};
}
export function codeMail(code: string, purpose: CodePurpose) {
  if (!/^\d{6}$/.test(code) || !Object.prototype.hasOwnProperty.call(codeCopy, purpose)) throw new Error('Invalid verification mail');
  const [subject,title,intro] = codeCopy[purpose];
  return render(subject,title,intro,`<p style="background:transparent;color:#1746C7;border:0;border-radius:0;text-align:left;padding:0;margin:28px 0 8px;font-size:36px;font-weight:bold;letter-spacing:7px">${code}</p><p style="font-size:12px;line-height:1.8;margin:0;color:#7a818d;text-align:left">발송 시점부터 10분간 유효합니다.</p>`,`인증 코드: ${code}\n발송 시점부터 10분간 유효합니다.`,security);
}
export function marketingMail(subject:string,body:string,unsubscribeUrl:string,advertisement:boolean){
 const url=new URL(unsubscribeUrl);
 if(url.protocol!=='https:'||!['crefans.com','beta.crefans.com'].includes(url.hostname)||url.username||url.password||url.port||url.pathname!=='/api/v1/marketing/unsubscribe')throw Error('Invalid unsubscribe URL');
 const contact='좋아하는일해야지(크레팬스) · 고객지원 khpark@crefans.com · 010-3211-3164';
 const result=render(subject,subject,advertisement?'수신에 동의한 크레팬스 이벤트·프로모션 안내입니다.':'광고 메일 수신 설정에 관한 안내입니다.',`<p style="white-space:pre-line;font-size:14px;line-height:1.8">${escape(body)}</p><p><a href="${escape(url.href)}" style="${linkStyle}">광고 메일 무료 수신거부</a></p>`,`${body}\n광고 메일 무료 수신거부: ${url.href}`,contact);
 result.subject=(advertisement?'(광고) ':'')+result.subject;
 result.html=result.html.replace('이 메일은 계정 및 서비스 이용에 관한 자동 안내 메일입니다.',advertisement?'이 메일은 광고성 정보입니다.':'이 메일은 수신 설정 처리에 관한 안내입니다.');
 result.text=result.text.replace('이 메일은 계정 및 서비스 이용에 관한 자동 안내 메일입니다.',advertisement?'이 메일은 광고성 정보입니다.':'이 메일은 수신 설정 처리에 관한 안내입니다.');
 return{...result,replyTo:'khpark@crefans.com',headers:{'List-Unsubscribe':`<${url.href}>`,'List-Unsubscribe-Post':'List-Unsubscribe=One-Click'}};
}
// Billing notices deliver payment-failed/renewal-stopped; member notices deliver moderation/bean-expiry.
// Other notice templates remain prepared only, without event delivery.
export function noticeMail(kind: keyof typeof noticeCopy, rows: Array<[string,string]>, actionUrl: string, note: string) {
  if (!Object.prototype.hasOwnProperty.call(noticeCopy,kind)) throw new Error('Unknown notice');
  const url = new URL(actionUrl);
  if (url.protocol !== 'https:' || !['crefans.com','beta.crefans.com'].includes(url.hostname) || url.username || url.password || url.port) throw new Error('Invalid mail action URL');
  const [subject,title,intro,action] = noticeCopy[kind];
  const table = rows.map(([label,value])=>`<tr><td style="padding:8px 0;color:#626b7c;vertical-align:top;font-size:13px">${escape(label)}</td><td align="right" style="padding:8px 0;vertical-align:top;font-size:13px">${escape(value)}</td></tr>`).join('');
  return render(subject,title,intro,`<table role="presentation" width="100%" style="font-size:13px;margin:24px 0">${table}</table><a href="${escape(url.href)}" style="${linkStyle}">${escape(action)}</a>`,rows.map(([k,v])=>`${k}: ${v}`).join('\n')+`\n${action}: ${url.href}`,note);
}
