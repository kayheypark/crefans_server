require('ts-node/register/transpile-only');
const {test}=require('node:test'),assert=require('node:assert/strict');
const {codeMail,noticeMail,noticeCopy,marketingMail,intermediaryNotice}=require('../src/auth/local/mail/templates');
for(const purpose of ['verify','reset','email-change'])test('code template '+purpose,()=>{const m=codeMail('012345',purpose);assert.match(m.html,/012345/);assert.match(m.text,/012345/);assert.match(m.html,/cid:crefans-logo@crefans.com/);assert.equal(m.attachments[0].content.subarray(1,4).toString(),'PNG');assert.doesNotMatch(m.subject+m.text+m.html,/\u2014/);assert.doesNotMatch(m.html,/<script|<a /);assert.match(m.text,/10분/);});
test('invalid codes and unknown purposes rejected',()=>{for(const c of ['12345','1234567','<script>','１２３４５６'])assert.throws(()=>codeMail(c,'verify'));assert.throws(()=>codeMail('123456','unknown'));});
for(const kind of Object.keys(noticeCopy))test('notice template '+kind,()=>{const m=noticeMail(kind,[['판매자','<script>alert(1)</script>\u2014하늘']], 'https://crefans.com/service/me','검증 안내');assert.doesNotMatch(m.subject+m.text+m.html,/\u2014/);assert.doesNotMatch(m.html,/<script>/);assert.match(m.html,/&lt;script&gt;/);assert.match(m.html,/https:\/\/crefans.com/);});
test('mail action URL rejects untrusted origins and schemes',()=>{for(const u of ['javascript:alert(1)','https://evil.example','https://crefans.com.evil.example','http://crefans.com','https://user:pass@crefans.com','https://crefans.com:444'])assert.throws(()=>noticeMail('payment-completed',[],u,''));});
for(const advertisement of [true,false])test('marketing metadata and escaping '+advertisement,()=>{
 const url='https://crefans.com/api/v1/marketing/unsubscribe?token=fixture-only';
 const m=marketingMail('제목','<script>내용</script>',url,advertisement);
 assert.equal(m.subject,(advertisement?'(광고) ':'')+'[크레팬스] 제목');
 assert.doesNotMatch(m.html,/<script>/);assert.match(m.html,/&lt;script&gt;/);
 assert.match(m.html,/광고 메일 무료 수신거부/);assert.ok(m.text.includes(url));
 assert.equal(m.replyTo,'khpark@crefans.com');
 assert.deepEqual(m.headers,{'List-Unsubscribe':`<${url}>`,'List-Unsubscribe-Post':'List-Unsubscribe=One-Click'});
 assert.equal(m.attachments[0].cid,'crefans-logo@crefans.com');
 assert.ok(m.html.includes(advertisement?'이 메일은 광고성 정보입니다.':'이 메일은 수신 설정 처리에 관한 안내입니다.'));
});
test('unsubscribe URL rejects untrusted origins and wrong endpoints',()=>{
 for(const u of ['javascript:alert(1)','https://evil.example/api/v1/marketing/unsubscribe','http://crefans.com/api/v1/marketing/unsubscribe','https://user:pass@crefans.com/api/v1/marketing/unsubscribe','https://crefans.com:444/api/v1/marketing/unsubscribe','https://crefans.com/service/me'])assert.throws(()=>marketingMail('제목','본문',u,true));
});
test('expiry notice uses the supplied deadline instead of a fixed lifetime',()=>{
 const m=noticeMail('bean-expiry',[['만료일','2026. 12. 3.']], 'https://crefans.com/service/beans','');
 for(const body of [m.html,m.text]){assert.match(body,/2026\. 12\. 3\./);assert.match(body,/미사용 잔액/);assert.doesNotMatch(body,/5년/);}
});
test('event bean expiry notice names event beans and does not offer a refund',()=>{
 const m=noticeMail('event-bean-expiry',[['콩','100개 (이벤트 프로모션콩)'],['사용기한','2026. 12. 3. 오후 2:15']],'https://crefans.com/service/beans','사용기한이 지나면 남은 이벤트 콩은 소멸합니다.');
 assert.match(m.subject,/이벤트 콩 사용기한/);
 for(const body of [m.html,m.text]){assert.match(body,/이벤트 프로모션콩/);assert.match(body,/2026\. 12\. 3\./);assert.doesNotMatch(body,/환불을 신청/);assert.doesNotMatch(body,/5년/);}
});
// 2026-11-07 user decision: the membership payment mail is a written contract notice (전자상거래법 시행규칙 제11조의2),
// so it names the seller (creator) and the intermediary notice in a type size at least as large as the seller line.
const NOTICE='크레팬스는 크리에이터 멤버십 거래의 통신판매중개자로 거래 당사자가 아니며, 멤버십의 판매자는 각 크리에이터입니다. 콩은 크레팬스가 직접 판매합니다.';
const px=(html,marker)=>{const i=html.indexOf(marker);assert.ok(i>0,marker);const open=html.lastIndexOf('<',i);const tag=html.slice(open,html.indexOf('>',open));const m=/font-size:(\d+)px/.exec(tag);assert.ok(m,'font-size on '+marker);return Number(m[1]);};
test('membership payment mail names the seller and the intermediary notice, notice at least as large as the seller',()=>{
 assert.equal(intermediaryNotice,NOTICE);
 const m=noticeMail('payment-completed',[['판매자','하루작가'],['멤버십','월 구독'],['결제 금액','9,900원']],'https://crefans.com/service/subscriptions','');
 assert.ok(m.html.includes(NOTICE));assert.ok(m.text.includes(NOTICE));assert.match(m.text,/판매자: 하루작가/);
 const seller=px(m.html,'하루작가'),notice=px(m.html,NOTICE),label=px(m.html,'>판매자<');
 assert.ok(notice>=seller&&notice>=label,`notice ${notice}px >= seller ${seller}px`);
 assert.ok(m.html.indexOf(NOTICE)<m.html.indexOf('결제 내역 보기'),'notice sits with the contract rows before the action link');
 assert.throws(()=>noticeMail('payment-completed',[['멤버십','월 구독']],'https://crefans.com/service/subscriptions',''),/Seller required/);
 assert.throws(()=>noticeMail('payment-completed',[['판매자','  ']],'https://crefans.com/service/subscriptions',''),/Seller required/);
});
test('non-membership notices carry no intermediary notice',()=>{
 for(const kind of ['bean-expiry','withdrawal-completed','account-changed']){const m=noticeMail(kind,[],'https://crefans.com/service/me','');assert.ok(!m.html.includes(NOTICE)&&!m.text.includes(NOTICE),kind);}
});
