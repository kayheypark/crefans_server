require('ts-node/register/transpile-only');
const {test}=require('node:test'),assert=require('node:assert/strict');
const {codeMail,noticeMail,noticeCopy,marketingMail,intermediaryNotice,welcomeMail}=require('../src/auth/local/mail/templates');
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
 assert.match(m.subject,/프로모션 콩 사용기한/);// 2026-11-18: the same kind also covers the advertising-consent reward lot

 for(const body of [m.html,m.text]){assert.match(body,/이벤트 프로모션콩/);assert.match(body,/2026\. 12\. 3\./);assert.doesNotMatch(body,/환불을 신청/);assert.doesNotMatch(body,/5년/);}
});
// 2026-11-07 user decision: the membership payment mail is a written contract notice (전자상거래법 시행규칙 제11조의2),
// so it names the seller (creator) and the intermediary notice in a type size at least as large as the seller line.
const NOTICE='AI 이용권·콩·광고상품은 크레팬스가 직접 판매합니다. 크리에이터 멤버십 거래에서 크레팬스는 통신판매중개자로 거래 당사자가 아니며, 멤버십의 판매자는 각 크리에이터입니다.';
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

// 2026-11-18 informational welcome mail (no advertising markers, escaped nickname, allow-listed links and images).
const cta='https://crefans.com/service/landing-ai-image-generation';
test('welcome mail: approved copy, informational footer, mail-only images on the same origin',()=>{
 const m=welcomeMail({nickname:'하늘',email:'fan@example.invalid',joinedAt:'2026년 11월 18일'},cta);
 assert.equal(m.subject,'[크레팬스] 가입을 축하해요, 사진 한 장으로 시작해 보세요');
 for(const part of [m.html,m.text]){assert.match(part,/가입을 축하해요, 하늘님/);assert.match(part,/예시는 AI로 만든 가상 인물입니다\./);assert.match(part,/AI 사진 편집 시작하기/);assert.match(part,/가입 이메일 fan@example\.invalid · 가입일 2026년 11월 18일/);assert.match(part,/고객센터\(khpark@crefans\.com\)로 알려 주세요\./);assert.match(part,/이 메일은 계정 및 서비스 이용에 관한 자동 안내 메일입니다\./);assert.match(part,/landing-ai-image-generation/);}
 assert.doesNotMatch(m.subject+m.html+m.text,/\(광고\)|수신거부|광고성 정보|콩|이벤트|할인|이용권/);assert.equal(m.headers,undefined);
 const images=[...m.html.matchAll(/<img src="([^"]+)"/g)].map(x=>x[1]);
 assert.deepEqual(images,['cid:crefans-logo@crefans.com','https://crefans.com/brand/mail/welcome-popper-v1.png','https://crefans.com/brand/mail/welcome-base-v1.jpg','https://crefans.com/brand/mail/welcome-maid-v1.jpg','https://crefans.com/brand/mail/welcome-gothic-v1.jpg','https://crefans.com/brand/mail/welcome-idol-v1.jpg']);
 assert.doesNotMatch(m.html,/\.webp|시안/);for(const label of ['원본','메이드','고딕','아이돌'])assert.match(m.html,new RegExp('>'+label+'</p>'));
});
test('welcome mail escapes the nickname and email and falls back when the nickname is blank',()=>{
 const m=welcomeMail({nickname:'<script>alert(1)</script><img src=x onerror=alert(1)>',email:'a"<b>@example.invalid',joinedAt:'2026년 11월 18일'},cta);
 assert.doesNotMatch(m.html,/<script>|<img src=x|<b>/);assert.match(m.html,/&lt;script&gt;alert\(1\)&lt;\/script&gt;/);assert.match(m.html,/a&quot;&lt;b&gt;@example\.invalid/);
 assert.match(welcomeMail({nickname:'  ',email:'a@example.invalid',joinedAt:'x'},cta).html,/가입을 축하해요, 회원님/);
});
test('welcome mail rejects button URLs outside the allow-list (images follow the same origin)',()=>{
 for(const u of ['javascript:alert(1)','https://evil.example/service/landing-ai-image-generation','https://crefans.com.evil.example/service/landing-ai-image-generation','http://crefans.com/service/landing-ai-image-generation','https://user:pass@crefans.com/service/landing-ai-image-generation','https://crefans.com:444/service/landing-ai-image-generation','https://crefans.com/service/feed'])assert.throws(()=>welcomeMail({nickname:'a',email:'a@example.invalid',joinedAt:'x'},u),/Invalid mail action URL/);
 assert.match(welcomeMail({nickname:'a',email:'a@example.invalid',joinedAt:'x'},'https://beta.crefans.com/service/landing-ai-image-generation').html,/https:\/\/beta\.crefans\.com\/brand\/mail\/welcome-base-v1\.jpg/);
});
