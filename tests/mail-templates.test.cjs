require('ts-node/register/transpile-only');
const {test}=require('node:test'),assert=require('node:assert/strict');
const {codeMail,noticeMail,noticeCopy,marketingMail}=require('../src/auth/local/mail/templates');
for(const purpose of ['verify','reset','email-change'])test('code template '+purpose,()=>{const m=codeMail('012345',purpose);assert.match(m.html,/012345/);assert.match(m.text,/012345/);assert.match(m.html,/cid:crefans-logo@crefans.com/);assert.equal(m.attachments[0].content.subarray(1,4).toString(),'PNG');assert.doesNotMatch(m.subject+m.text+m.html,/\u2014/);assert.doesNotMatch(m.html,/<script|<a /);assert.match(m.text,/10분/);});
test('invalid codes and unknown purposes rejected',()=>{for(const c of ['12345','1234567','<script>','１２３４５６'])assert.throws(()=>codeMail(c,'verify'));assert.throws(()=>codeMail('123456','unknown'));});
for(const kind of Object.keys(noticeCopy))test('notice template '+kind,()=>{const m=noticeMail(kind,[['크리에이터','<script>alert(1)</script>\u2014하늘']], 'https://crefans.com/service/me','검증 안내');assert.doesNotMatch(m.subject+m.text+m.html,/\u2014/);assert.doesNotMatch(m.html,/<script>/);assert.match(m.html,/&lt;script&gt;/);assert.match(m.html,/https:\/\/crefans.com/);});
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
