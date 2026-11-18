require('reflect-metadata');
const {test}=require('node:test'),assert=require('node:assert/strict');
const {ConfigService}=require('@nestjs/config');
const {LegalDocumentsService,LEGAL_NOTICE_DATE,NEXT_TERMS_EFFECTIVE}=require('../dist/src/platform/legal-documents');
const {PlatformAuthService}=require('../dist/src/platform/auth.service');
const {PlatformService}=require('../dist/src/platform/service');
const {publishedCatalog,blockedCatalog}=require('./legal-fixture.cjs');
const error=code=>e=>e.getResponse().code===code;
test('the released documents are in force with no open items: terms/policy from 2026-11-06, collection/marketing from 2026-10-30',()=>{
 const source=new LegalDocumentsService();assert.deepEqual(source.catalog().blockers,[]);assert.equal(source.signup().signupReady,true);
 // 2026-11-06 user decision: the merged revision is now the single version in force, so terms/policy carry that day.
 for(const d of [source.catalog(new Date('2026-11-16T12:00:00+09:00')).documents.policy]){assert.equal(d.status,'published');assert.equal(d.publishedAt,'2026-11-06');assert.equal(d.effectiveAt,'2026-11-06');assert.doesNotMatch(d.version,/draft/);}
 // 2026-11-13: the partner revision of article 6 (only partners withdraw) is in force from its deploy day.
 {const d=source.catalog(new Date('2026-11-13T00:00:00+09:00')).documents.terms;assert.equal(d.status,'published');assert.equal(d.publishedAt,'2026-11-13');assert.equal(d.effectiveAt,'2026-11-13');assert.equal(d.version,'2026-11-13.partner.1');}
 for(const d of [source.catalog().collection,source.catalog().marketing]){assert.equal(d.status,'published');assert.equal(d.publishedAt,'2026-10-22');assert.equal(d.effectiveAt,'2026-10-30');assert.doesNotMatch(d.version,/draft/);}
 assert.equal(source.catalog().upcoming,undefined,'nothing pending');
 // The privacy policy was revised on the notice day of the merged revision (2026-11-02 user decision) and applies from that day.
 const p=source.catalog().documents.privacy;assert.equal(p.status,'published');assert.equal(p.publishedAt,'2026-11-18');assert.equal(p.effectiveAt,'2026-11-18');assert.equal(p.version,'2026-11-18.posthog.1');assert.match(JSON.stringify(p),/16\. 대표 기능: AI 사진 편집/);assert.match(JSON.stringify(p),/최대 30일/);assert.match(JSON.stringify(p),/의미 검색 기능\(임베딩\)/);assert.match(JSON.stringify(p),/무작위 익명 ID/);assert.match(JSON.stringify(p),/최근 50개/);assert.doesNotMatch(JSON.stringify(p),/새로고침·새 대화 시 삭제/);assert.match(JSON.stringify(p),/cf_post_visitor/);
 const privacy=JSON.stringify(source.catalog().documents.privacy);for(const pending of ['시행 전','개방 전','확정하지 않았','아직 자동 삭제'])assert.ok(!privacy.includes(pending),pending);
 for(const recipient of ['Amazon Web Services Korea LLC','Google Asia Pacific Pte. Ltd.','Telegram Messenger Inc.'])assert.ok(privacy.includes(recipient),recipient);
});
test('an open item still blocks signup while the documents stay readable, including E2E env',async()=>{
 const legal=new LegalDocumentsService();legal.catalog=blockedCatalog;assert.equal(legal.signup().published,false);assert.equal(legal.signup().documentsPublished,true);assert.equal(legal.signup().signupReady,false);
 assert.throws(()=>legal.consents({}),error('POLICY_NOT_PUBLISHED'));
 // An invited email still waits for published terms; a non-invited email gets the beta notice first.
 // No console invite exists for the stranger, so only the env allowlist can admit it.
 const auth=new PlatformAuthService({signupInvite:{findFirst:async()=>null}}, {},{sendCode(){throw Error('must not send');}}, new ConfigService({BETA_MODE:'true',SIGNUP_EMAIL_ALLOWLIST:'synthetic@example.invalid'}),legal);
 await assert.rejects(auth.requestCode('synthetic@example.invalid'),error('POLICY_NOT_PUBLISHED'));
 await assert.rejects(auth.requestCode('stranger@example.invalid'),e=>e.getResponse().code==='SIGNUP_INVITE_REQUIRED'&&e.getResponse().message==='현재 기간(~26년 11월)에는 사전 협의된 유저만 가입할 수 있습니다. 빠른 시일 내에 그랜드 오픈을 준비하겠습니다.');
 assert.ok(legal.catalog().documents.privacy.sections.some(s=>s.body.includes('좋아하는일해야지')));
});
test('public documents ignore database legal rows, while database notices still work',async()=>{
 const db={serviceDocument:{findMany:async()=>[{kind:'privacy',title:'INJECTED DATABASE POLICY',content:{sections:[{body:'wrong'}]}},{id:'notice',kind:'notice',title:'공지',category:'안내',updated_at:new Date(),content:{paragraphs:['공지 내용']}}]}};
 const common=await new PlatformService(db).common();assert.equal(common.legal.privacy.title,'개인정보처리방침');assert.equal(common.notices[0].title,'공지');assert.ok(!JSON.stringify(common).includes('INJECTED DATABASE POLICY'));
});
test('all accepted documents must match displayed content versions; optional marketing is independent',()=>{
 const legal=new LegalDocumentsService();legal.catalog=publishedCatalog;
 const agreement=legal.signup();assert.equal(agreement.published,true);
 for(const policyVersions of [undefined,{}, {...agreement.versions,terms:'stale'}, {...agreement.versions,privacy:'forged'}])assert.throws(()=>legal.consents({policyVersions}),error('POLICY_VERSION_CHANGED'));
 const records=legal.consents({policyVersions:agreement.versions,marketing:false});assert.equal(records.length,2);assert.deepEqual(records[1].document_snapshot.document,agreement.documents.privacy);assert.deepEqual(records[1].document_snapshot.collection,agreement.collection);
 assert.equal(records[1].document_snapshot.acknowledgement,'privacy-notice');
 const changedMarketing={...agreement.versions,marketing:'old'};assert.equal(legal.consents({policyVersions:changedMarketing,marketing:false}).length,2);assert.throws(()=>legal.consents({policyVersions:changedMarketing,marketing:true}),error('POLICY_VERSION_CHANGED'));assert.equal(legal.consents({policyVersions:agreement.versions,marketing:true}).length,3);
});
test('future documents remain inactive and a content edit invalidates its previous identifier',()=>{
 const legal=new LegalDocumentsService(),c=publishedCatalog();legal.catalog=()=>structuredClone(c);const before=legal.signup();
 c.collection.sections[0].body+=' changed';assert.notEqual(legal.signup().versions.privacy,before.versions.privacy);assert.throws(()=>legal.consents({policyVersions:before.versions}),error('POLICY_VERSION_CHANGED'));
 c.documents.terms.effectiveAt='2999-01-01';assert.equal(legal.signup().published,false);
});
test('document output is isolated from consumer mutation and has no executable HTML',()=>{
 const legal=new LegalDocumentsService(),c=legal.catalog();c.documents.terms.sections=[];assert.ok(legal.catalog().documents.terms.sections.length>0);
 for(const d of [...Object.values(legal.catalog().documents),legal.catalog().collection,legal.catalog().marketing])for(const section of d.sections){assert.ok(section.title&&section.body);assert.doesNotMatch(section.body,/<script|<iframe|javascript:/i);for(const l of section.links||[])assert.match(l.href,/^https:\/\//);}
});

test('admin cannot create or repurpose legal documents through the generic document endpoint',async()=>{
 const {PlatformAdminController}=require('../dist/src/platform/admin.controller');
 const controller=new PlatformAdminController({db:{$transaction:fn=>fn({serviceDocument:{findUnique:async()=>({kind:'privacy'}),update:()=>{throw Error('must not update');}}})}});
 const req={admin:{role:'SUPER_ADMIN',user_sub:'synthetic'}};
 for(const kind of ['terms','privacy','policy'])await assert.rejects(controller.document({kind,published:true,content:{}},req),error('INVALID_DOCUMENT'));
 await assert.rejects(controller.document({id:'legacy-policy',kind:'notice',title:'Changed',published:true,content:{}},req),error('CODE_MANAGED_DOCUMENT'));
});
test('privacy policy and signup notice name the CI value explicitly (KG Inicis Kakao certificate requirement)',()=>{
 const c=new LegalDocumentsService().catalog(),text=d=>d.sections.map(s=>s.body).join('\n');
 assert.match(text(c.documents.privacy),/암호화된 이용자 확인값\(CI\)/);
 assert.match(text(c.collection),/암호화된 이용자 확인값\(CI\)/);
});
test('creator terms let an individual agreement override the default fee and payout terms without retroactive effect',()=>{
 const body=new LegalDocumentsService().catalog().documents.terms.sections.find(s=>s.title.startsWith('6.')).body;
 assert.match(body,/개별로 합의한 경우 그 합의가 이 조의 기본 기준보다 우선합니다/);assert.match(body,/소급하지 않습니다/);assert.match(body,/총 공제율은20%/);
});
test('privacy policy describes the actual withdrawal purge: 30-day grace, erased fields, deleted posts, anonymized comments',()=>{
 const body=new LegalDocumentsService().catalog().documents.privacy.sections.find(s=>s.title.startsWith('7.')).body;
 assert.match(body,/탈퇴 후 30일 동안은/);assert.match(body,/작성한 게시물을 삭제합니다/);assert.match(body,/“탈퇴한 사용자”로 표시/);
 assert.doesNotMatch(body,/회원 정보 전체를 파기하지 않습니다/);
});
// 2026-11-06 user decision: no real users and no real charges, so this is published as the single version in force
// from the deploy day. There is no upcoming document and no scheduled-amendment window to honour.
test('2026-11-11 payout revision: article 6 states the company transfer from the announced start, article 4 keeps no real charges',()=>{
 const legal=new LegalDocumentsService(),{PAYOUT_TERMS_DATE}=require('../dist/src/platform/legal-documents');assert.equal(PAYOUT_TERMS_DATE,'2026-11-11');
 const before=legal.catalog(new Date('2026-11-10T23:59:00+09:00')).documents.terms,after=legal.catalog(new Date('2026-11-11T00:00:00+09:00')).documents.terms;
 assert.equal(before.version,'2026-11-06.4');assert.equal(after.version,'2026-11-11.payout.1');assert.equal(legal.catalog(new Date('2026-11-12T23:59:00+09:00')).documents.terms.version,'2026-11-11.payout.1');
 const body=title=>after.sections.find(s=>s.title===title).body;
 assert.match(body('6. 크리에이터 수수료·정산·출금'),/회사가 공지한 시작일부터 회사가 확인한 본인 명의 정산 계좌로 회사가 직접 이체/);assert.doesNotMatch(JSON.stringify(after),/실제 출금을 처리하지 않습니다|청구와 출금을 하지 않습니다/);
 assert.match(body('4. 결제와 자동 갱신'),/베타에서는 실제 청구를 하지 않습니다\. 크리에이터 출금은 제6조에 따릅니다/);
 assert.deepEqual(after.sections.map(s=>s.title),before.sections.map(s=>s.title),'no section added or dropped');
 for(const s of after.sections)if(!/^[46]\./.test(s.title))assert.equal(s.body,before.sections.find(x=>x.title===s.title).body,s.title);
 assert.match(after.notice,/2026년 11월 11일 개정/);assert.equal(legal.signup().published,true);
});

// 2026-11-12 user decision (ask-me): the verified badge marks a signed partnership contract and only partners withdraw.
// Applied from the deploy day (2026-11-13 KST); only article 6 changes.
test('2026-11-13 partner revision: article 6 limits withdrawals to partner creators and keeps the account/PIN and hold rules',()=>{
 const legal=new LegalDocumentsService(),{PARTNER_TERMS_DATE}=require('../dist/src/platform/legal-documents');assert.equal(PARTNER_TERMS_DATE,'2026-11-13');
 const before=legal.catalog(new Date('2026-11-12T23:59:00+09:00')).documents.terms,after=legal.catalog(new Date('2026-11-13T00:00:00+09:00')).documents.terms;
 assert.equal(before.version,'2026-11-11.payout.1');assert.equal(after.version,'2026-11-13.partner.1');assert.equal(legal.catalog(new Date('2026-11-14T12:00:00+09:00')).documents.terms.version,'2026-11-13.partner.1');assert.equal(legal.catalog(new Date('2026-12-06T12:00:00+09:00')).documents.terms.version,'2026-11-17.adult.1');
 const six=after.sections.find(s=>s.title==='6. 크리에이터 수수료·정산·출금').body;
 assert.match(six,/파트너십 계약을 맺은 크리에이터\(프로필에 인증 배지 표시\)만 신청할 수 있습니다/);assert.match(six,/정산 계좌와 출금 비밀번호는 계약 전에도 미리 등록할 수 있습니다/);
 assert.match(six,/인증 배지가 해제되면 아직 지급되지 않은 출금 신청은 보류되며, 잔액은 그대로 유지됩니다/);assert.match(six,/출금에는 본인 명의 정산 계좌의 확인과 별도 출금 인증이 필요합니다/);
 for(const s of after.sections)if(!s.title.startsWith('6.'))assert.equal(s.body,before.sections.find(x=>x.title===s.title).body,s.title);
 assert.match(after.notice,/2026년 11월 13일 개정/);assert.match(after.notice,/2026년 11월 11일 개정/);
});

// 2026-11-13: the signup gate used the UTC day while catalog() uses the KST day, so a revision effective at KST midnight
// kept signup closed until 09:00 KST. Both now use the KST day.
test('signup stays open right after KST midnight on a revision day',t=>{
 t.mock.timers.enable({apis:['Date'],now:new Date('2026-11-15T00:30:00+09:00')});
 try{const s=new LegalDocumentsService().signup();assert.equal(s.documents.terms.version,'2026-11-15.open.1');assert.equal(s.published,true);assert.equal(s.signupReady,true);}
 finally{t.mock.timers.reset();}
});

test('the revision is the single version in force from its KST effective day, with no upcoming document',()=>{
 const legal=new LegalDocumentsService(),after=legal.catalog(new Date('2026-11-06T00:00:00+09:00'));
 assert.equal(LEGAL_NOTICE_DATE,'2026-11-06');assert.equal(NEXT_TERMS_EFFECTIVE,LEGAL_NOTICE_DATE,'in force from the deploy day, not 30 days later');
 assert.equal(after.documents.terms.version,'2026-11-06.4');assert.equal(after.documents.policy.version,'2026-11-06.1');
 assert.equal(after.upcoming,undefined,'nothing is pending any more');
 assert.equal(after.documents.terms.effectiveAt,'2026-11-06');assert.equal(after.documents.terms.status,'published');
 // 시행일 전날은 이전 본이 보이고, 그 이후로는 계속 이 본이다.
 const before=legal.catalog(new Date('2026-11-05T23:59:00+09:00'));
 assert.equal(before.documents.terms.version,'2026-10-30.3');assert.equal(before.upcoming.effectiveAt,'2026-11-06');
 assert.equal(legal.catalog(new Date('2026-11-10T23:59:00+09:00')).documents.terms.version,'2026-11-06.4');
 const terms=JSON.stringify(after.documents.terms);
 for(const added of ['11. 콩','10%를 공제','미수금','신고한 회원에게 앱 알림','볼 수 없는 멤버십 전용 게시물에는 후원할 수 없습니다','오픈베타','회사가 부담하여 신고·납부','화요일 23:59','다음 영업일','친구 초대 보상 등으로 무상 지급한 프로모션콩','받은 회원이 환불하거나 출금할 수 없습니다','프로모션콩으로 후원해 크리에이터가 받은 콩은 일반 후원 콩과 같이 제6조 기준에 따라 출금할 수 있습니다','12. 친구 초대','남은 콩을 회수','https://crefans.com/핸들','끌 수 없습니다','지급일로부터 1년간 쓸 수 있으며','2026년 11월 6일부터 적용합니다','통신판매업 신고번호: 2026-서울관악-2144'])assert.ok(terms.includes(added),added);
 for(const removed of ['17개 계정','프로모션콩은 환불·출금 대상이 아닙니다','법정 원천징수는 별도','세금 처리 방식(원천징수 여부 포함)','공휴일·신청 마감 등 세부 일정','운영자가 지급한 프로모션콩','지급일로부터 5년간 쓸 수 있으며','30일 뒤에 시행','2026년 12월','통신판매업을 신고하고 신고번호를','통신판매업 신고번호는 확인 중'])assert.ok(!terms.includes(removed),removed);
 const privacy=JSON.stringify(before.documents.privacy);
 for(const added of ['메타데이터를 제거','운영자가 통장 사본 등으로 확인','처리를 마친 날부터 3년','회원 정보 파기 후 5년','재사용 금지 목록','ab***@n***.com','해시 값(앞 12자리)','edpo.com/telegram-gdpr-data-request'])assert.ok(privacy.includes(added),added);
 for(const removed of ['본인확인된 예금주명','문의·신고 기록은','요청·기록·회원·거래 식별자'])assert.ok(!privacy.includes(removed),removed);
});

test('upcoming terms separate the new30-day event from unchanged existing grants',()=>{const c=new LegalDocumentsService().catalog(new Date('2026-11-03T00:00:00Z')),text=JSON.stringify(c.upcoming.documents.terms);assert.match(text,/30일\(720시간\)/);assert.match(text,/기존 지급분의 사용기한이나 이미 후원한 크리에이터의 수익은 변경하지/);assert.equal(c.documents.terms.version,'2026-10-30.3');});

test('guide AI privacy notice distinguishes optional requests, provider retention and ordinary guide use',()=>{
 const c=new LegalDocumentsService().catalog().documents.privacy;
 const body=c.sections.find(s=>s.title.startsWith('15.')).body;
 for(const value of ['OpenAI OpCo, LLC','privacy@openai.com','HTTPS','기본 최대 30일','회원 탈퇴는 필요하지 않습니다','이전 대화','모델 학습','DB나 요청 로그에 저장하지'])assert.ok(body.includes(value),value);
 assert.match(c.sections.find(s=>s.title.startsWith('8.')).body,/OpenAI OpCo, LLC/);
 assert.match(c.sections.find(s=>s.title.startsWith('9.')).body,/이 기능을 이용하지 않아도/);
 assert.ok(c.sections.find(s=>s.title.startsWith('10.')).body.includes('cf_post_visitor'));
});
test('privacy article 8 discloses Modusign as the e-contract processor (2026-11-12 ask-me)',()=>{
 const p=new LegalDocumentsService().catalog().documents.privacy;
 assert.equal(p.version,'2026-11-18.posthog.1');assert.equal(p.effectiveAt,'2026-11-18');assert.equal(p.status,'published');
 const s8=p.sections.find(s=>s.title==='8. 처리 위탁과 제3자 제공');
 assert.match(s8.body,/전자계약 체결·보관을 주식회사 모두싸인에 위탁/);
 assert.ok(s8.links.some(l=>l.href==='https://support.modusign.co.kr/ko/articles/9ae892d6'),'links to Modusign privacy policy');
 // earlier additions stay in place
 for(const kept of ['OpenAI OpCo, LLC에 위탁합니다','Amazon Web Services'])assert.ok(JSON.stringify(p).includes(kept),kept);
 assert.ok(!p.sections.find(s=>s.title==='9. 국외 이전').body.includes('모두싸인'),'article 9 unchanged by user decision');
});
test('non-business creators: RRN processing basis and 5-year retention are disclosed (2026-11-12 ask-me)',()=>{
 const p=new LegalDocumentsService().catalog().documents.privacy,by=t=>p.sections.find(s=>s.title===t).body;
 assert.match(by('4. 구독·결제·정산 정보'),/주민등록번호를 처리합니다\(개인정보 보호법 제24조의2제1항제1호, 소득세법 제127조·제164조/);
 assert.match(by('7. 보유기간과 파기'),/국세기본법 제85조의3에 따라 해당 과세기간의 법정신고기한부터 5년간/);
 assert.match(by('8. 처리 위탁과 제3자 제공'),/사업자등록번호가 없는 크리에이터의 주민등록번호/);
 // signup still never asks for it
 assert.match(by('2. 회원가입·인증·계정 정보'),/주민등록번호 원문을 신규 가입 API의 필수 입력으로 받지 않습니다/);
});

test('AI failure diagnostics disclose encrypted 30-day prompt retention and operator access',()=>{const p=new LegalDocumentsService().catalog().documents.privacy;const text=p.sections.find(s=>s.title==='7. 보유기간과 파기').body;assert.match(text,/질문 내용과 선택 옵션은 성공·실패와 관계없이/);assert.match(text,/암호화하여 요청 시점부터/);assert.match(text,/요청 시점부터 30일 보관한 뒤 파기/);assert.match(text,/권한을 가진 운영자만 조회/);});

test('privacy discloses BytePlus generation and OpenAI moderation with overseas transfer details (2026-11-15 ask-me)',()=>{
 const p=new LegalDocumentsService().catalog(new Date('2026-11-15T09:00:00+09:00')).documents.privacy,s8=p.sections.find(s=>s.title==='8. 처리 위탁과 제3자 제공'),s16=p.sections.find(s=>s.title==='16. 선택 기능: 스튜디오 AI 사진 편집');
 assert.match(s8.body,/사진 생성을 Byteplus Pte\. Ltd\.\(BytePlus ModelArk\)에, 요청 문구·사진의 유해성 검사를 OpenAI OpCo, LLC에 위탁/);assert.doesNotMatch(s8.body,/사진 편집·유해성 검사를 OpenAI/);
 for(const needle of ['Byteplus Pte. Ltd.','privacy@byteplus.com','말레이시아, 인도네시아 및/또는 EU·EEA','180일','모델 학습에 쓰지 않습니다','OpenAI OpCo, LLC','회원 ID·이메일·이름·결제 정보·접속 IP는 AI 공급사에 보내지 않습니다','회원 탈퇴는 필요하지 않습니다'])assert.ok(s16.body.includes(needle),needle);
 assert.ok(s16.links.some(l=>l.href.includes('BytePlus_ModelArk_Data_Processing')));assert.doesNotMatch(s16.body,/익명 식별값/);
});

test('2026-11-15 sync revision: article 11 states bean charge limits and article 13 states AI photo usage rules',()=>{
 const legal=new LegalDocumentsService(),t=legal.catalog(new Date('2026-11-15T00:00:00+09:00')).documents.terms;
 assert.equal(t.version,'2026-11-15.open.1');assert.equal(t.effectiveAt,'2026-11-15');assert.equal(legal.catalog(new Date('2026-11-14T23:59:00+09:00')).documents.terms.version,'2026-11-13.partner.1');
 const bean=t.sections.find(s=>s.title==='11. 콩').body;assert.match(bean,/한 번에 최대 900콩\(99,000원\), 한국 시간 하루 200,000원/);
 const {beanPolicy}=require('../dist/src/platform/bean-policy');assert.equal(beanPolicy.maxChargeQuantity,900);assert.equal(beanPolicy.dailyChargeLimitKrw,200000);
 const ai=t.sections.find(s=>s.title==='13. 스튜디오 AI 사진 편집과 횟수권').body;
 const {AI_PHOTO_DAILY_LIMIT}=require('../dist/src/platform/ai-photo');const {AI_HEART_DAILY_CAP}=require('../dist/src/platform/ai-photo-hearts');
 assert.equal(AI_PHOTO_DAILY_LIMIT,10);assert.equal(AI_HEART_DAILY_CAP,100);
 for(const needle of ['무료 생성은 하루 10회','오전 9시','최대 30하트','하루 최대 100하트','10하트마다 생성 1회','무료 횟수, 하트로 받은 횟수, 구매한 횟수권 순서','안전 기준에 걸려 거절되면 무료 횟수는 사용한 것','구매 당시 1회 단가','16번 항목'])assert.ok(ai.includes(needle),needle);
 assert.doesNotMatch(ai,/소멸/);
 for(const needle of [])assert.ok(ai.includes(needle),needle);
 assert.deepEqual(t.sections.slice(0,12).map(s=>s.title),legal.catalog(new Date('2026-11-14T12:00:00+09:00')).documents.terms.sections.map(s=>s.title));
});

// 2026-11-15 user decision: signed-out AI photo trial is disclosed before it ships (section 17 + cookie note in section 10).
test('privacy 2026-11-15.guest.1 discloses the signed-out AI photo trial: cookie, IP hash, limits, 24h public, claim, retention, transfer',async()=>{
 const p=new LegalDocumentsService().catalog().documents.privacy;assert.equal(p.version,'2026-11-18.posthog.1');
 const guest=p.sections.find(s=>s.title==='17. 대표 기능: 비회원 AI 사진 체험');assert.ok(guest);
 for(const phrase of ['cf_guest','최대 30일','서버 보안키로 변환','감사 기록 기준(2년)','AI로 만든 사진만','브라우저당 10회','하루 10회','하루 200회','24시간','비공개','같은 브라우저','게시 후 30일','16항과 같습니다','동의'])assert.ok(guest.body.includes(phrase),phrase);
 assert.match(p.sections.find(s=>s.title==='10. 쿠키와 자동 수집').body,/cf_guest를 최대 30일/);
 const {GUEST_AI_LIMIT,GUEST_IP_DAILY,GUEST_DAILY_TOTAL,GUEST_POST_HOURS,GUEST_RETENTION_DAYS}=require('../dist/src/platform/guest');
 assert.deepEqual([GUEST_AI_LIMIT,GUEST_IP_DAILY,GUEST_DAILY_TOTAL,GUEST_POST_HOURS,GUEST_RETENTION_DAYS],[10,10,200,24,30],'policy numbers match the code');
});

// 2026-11-15 user decisions (/ask-me after night-work): article 2 states open signup, article 6 states selling before the
// partnership contract; privacy 13 drops "invite beta", section 17 describes the IP value truthfully.
test('2026-11-15 open revision: signup open to adults, selling before the contract, honest IP wording',()=>{
 const legal=new LegalDocumentsService(),c=legal.catalog(new Date('2026-11-15T12:00:00+09:00')),t=c.documents.terms,p=c.documents.privacy,by=(d,title)=>d.sections.find(s=>s.title===title).body;
 assert.equal(t.version,'2026-11-15.open.1');assert.equal(p.version,'2026-11-15.open.1');
 assert.match(by(t,'2. 가입과 계정 관리'),/만 19세 이상이면 누구나 이메일 인증으로 가입/);assert.doesNotMatch(by(t,'2. 가입과 계정 관리'),/사전 협의된 초대 이메일로 가입/);
 assert.match(by(t,'6. 크리에이터 수수료·정산·출금'),/파트너십 계약 전에도 멤버십 판매·후원 받기와 수익 적립/);
 assert.doesNotMatch(by(p,'13. 아동과 민감정보'),/초대 베타/);
 const guest=by(p,'17. 선택 기능: 비회원 AI 사진 체험');assert.doesNotMatch(guest,/되돌릴 수 없게/);assert.match(guest,/감사 기록/);
 const {GUEST_CONSENT_VERSION}=require('../dist/src/platform/guest');assert.equal(GUEST_CONSENT_VERSION,'2026-11-16.guest.5','consent text changed, so the consent version moved');
});

// 2026-11-16 user decision: new memberships need the partnership contract; terms article 6 says so from the same day.
test('2026-11-16 membership revision: article 6 limits opening a membership to partners and keeps existing ones',()=>{
 const legal=new LegalDocumentsService(),t=legal.catalog(new Date('2026-11-16T09:00:00+09:00')).documents.terms,s6=t.sections.find(s=>s.title==='6. 크리에이터 수수료·정산·출금').body;
 assert.equal(t.version,'2026-11-16.ai.1');assert.equal(legal.catalog(new Date('2026-11-15T12:00:00+09:00')).documents.terms.version,'2026-11-15.open.1');
 assert.match(s6,/새 멤버십을 열거나 중지한 멤버십을 다시 여는 것도 파트너십 계약을 맺은 크리에이터만/);assert.match(s6,/이미 연 멤버십은 계약 전이라도 계속 판매/);assert.doesNotMatch(s6,/계약 전에도 멤버십 판매/);
 const {MEMBERSHIP_PARTNER_MESSAGE}=require('../dist/src/platform/partner-policy');assert.match(MEMBERSHIP_PARTNER_MESSAGE,/인증 배지/);
});

// 2026-11-16 user decisions: guest trial title/body written by AI when the visitor presses 'AI로 내용 작성' (item names + request text
// only), and bank transfer (무통장입금) for beans, AI 이용권 and advertising with account refunds within 3 business days.
test('2026-11-16 bank.1: bank transfer terms and privacy, guest caption button wording, effective the same day',()=>{
 const legal=new LegalDocumentsService(),c=legal.catalog(new Date('2026-11-16T09:00:00+09:00')),t=c.documents.terms,p=c.documents.privacy,by=(d,start)=>d.sections.find(s=>s.title.startsWith(start)).body;
 assert.equal(t.version,'2026-11-16.ai.1');assert.equal(p.version,'2026-11-16.ai.1');assert.equal(t.effectiveAt,'2026-11-16');assert.equal(p.effectiveAt,'2026-11-16');
 const pay=by(t,'4. ');assert.match(pay,/베타에서 카드 결제로는 실제 청구를 하지 않습니다/);assert.doesNotMatch(pay,/베타에서는 실제 청구를 하지 않습니다/);assert.match(pay,/무통장입금/);assert.match(pay,/주문 후 24시간/);assert.match(pay,/자동으로 취소/);assert.match(pay,/현금영수증/);assert.match(pay,/광고상품은 사용을 시작하기 전이면 전액 환불/);
 assert.match(by(t,'5. '),/3영업일 이내에 이체/);
 assert.match(by(p,'4. '),/입금자명/);assert.match(by(p,'4. '),/계좌번호와 예금주는 암호화/);assert.match(by(p,'7. '),/무통장입금 주문·입금 확인·현금영수증·환불 이체 기록 포함/);assert.match(by(p,'8. '),/국세청에 제공/);
 const guest=by(p,'17. ');assert.match(guest,/'AI로 내용 작성'을 누를 때 제목·본문 작성\(OpenAI\)/);assert.match(guest,/고른 편집 항목 이름과 직접 입력한 요청 문장만/);assert.match(guest,/방문자가 고친 뒤 게시/);assert.doesNotMatch(guest,/비워 둔 제목/);
 assert.equal(legal.catalog(new Date('2026-11-15T23:59:00+09:00')).documents.privacy.version,'2026-11-15.open.1');
});

// 2026-11-16 user decision: successful AI photo prompts are kept like failures (encrypted, 30 days).
test('2026-11-16 prompt.1: privacy keeps AI photo request prompts for successes and failures for 30 days, guest section points to it',()=>{
 const p=new LegalDocumentsService().catalog(new Date('2026-11-16T12:00:00+09:00')).documents.privacy,by=start=>p.sections.find(s=>s.title.startsWith(start)).body;
 assert.equal(p.version,'2026-11-16.ai.1');assert.match(by('7. '),/성공·실패와 관계없이/);assert.match(by('7. '),/요청 시점부터 30일/);assert.doesNotMatch(by('7. '),/실패한 요청의 질문 내용/);
 assert.match(by('17. '),/요청 문구와 선택 옵션은 7항에 따라 암호화해 30일 보관/);assert.match(by('4. '),/무통장입금/,'keeps the bank.1 changes');
});

test('2026-11-16 sub.1: terms describe AI 이용권 구독형 billing rules and privacy names KG이니시스 billing without card numbers',()=>{
 const c=new LegalDocumentsService().catalog(new Date('2026-11-16T12:00:00+09:00')),t=c.documents.terms,p=c.documents.privacy;
 assert.equal(t.version,'2026-11-16.ai.1');assert.equal(p.version,'2026-11-16.ai.1');
 const s13=t.sections.find(sec=>sec.title==='13. AI 사진 편집과 AI 이용권').body;
 for(const re of [/매달 같은 날/,/이월되지 않습니다/,/24시간 간격으로 3번/,/해지를 예약/,/1회 단가\(월 금액 ÷ 월 횟수\)/,/계약이 확정된 뒤 시작/])assert.match(s13,re);
 const by=prefix=>p.sections.find(sec=>sec.title.startsWith(prefix)).body;
 assert.match(by('4. '),/빌링키\(암호화 보관\)/);assert.match(by('4. '),/회사는 받거나 저장하지 않습니다/);assert.match(by('8. '),/KG이니시스 빌링을 이용할 예정/);
 assert.match(by('7. '),/성공·실패와 관계없이/,'the prompt.1 revision is kept');
});

test('2026-11-16 phone.1: privacy explains the OCTOMO phone-number check (entrusted, keyed hash only, not identity proof)',()=>{
 const p=new LegalDocumentsService().catalog(new Date('2026-11-16T12:00:00+09:00')).documents.privacy,by=x=>p.sections.find(sec=>sec.title.startsWith(x)).body;
 assert.equal(p.version,'2026-11-16.ai.1');assert.match(by('4. '),/번호 자체를 저장하지 않고/);assert.match(by('4. '),/회원가입 때/);assert.match(by('8. '),/회원가입·프로모션콩 수령 전/);assert.match(by('4. '),/실명·나이 확인이 아닙니다/);assert.match(by('7. '),/탈퇴 30일 후/);assert.match(by('8. '),/주식회사 옥토버스\(OCTOMO\)에 위탁/);
 assert.match(by('4. '),/빌링키\(암호화 보관\)/,'the sub.1 revision is kept');
});

test('2026-11-16 ai.1: AI photo editing is the service; sales notice names direct sales; 13 open to every member; privacy 1 names AI photos',()=>{
 const c=new LegalDocumentsService().catalog(new Date('2026-11-16T23:59:00+09:00')),t=c.documents.terms,p=c.documents.privacy;
 assert.equal(t.version,'2026-11-16.ai.1');assert.equal(p.version,'2026-11-16.ai.1');
 const s1=t.sections.find(s=>s.title.startsWith('1. ')).body;assert.match(s1,/AI 사진 편집 서비스 크레팬스/);assert.match(s1,/AI 이용권·콩·광고상품은 크레팬스가 직접 판매합니다\./);assert.doesNotMatch(s1,/팬은 콘텐츠를 이용하는 회원/);
 const s13=t.sections.find(s=>s.title==='13. AI 사진 편집과 AI 이용권').body;assert.match(s13,/회원은 누구나/);assert.doesNotMatch(s13,/운영팀이 허용한 크리에이터/);
 assert.match(p.sections.find(s=>s.title.startsWith('1. ')).body,/AI 사진 편집\(사진 업로드와 생성 결과\)/);
 assert.ok(p.sections.some(s=>s.title==='16. 대표 기능: AI 사진 편집'));assert.ok(p.sections.some(s=>s.title==='17. 대표 기능: 비회원 AI 사진 체험'));
 const before=new LegalDocumentsService().catalog(new Date('2026-11-15T12:00:00+09:00'));assert.notEqual(before.documents.terms.version,'2026-11-16.ai.1','older dates keep their own text');
});

// 2026-11-17 user decision: checked phone numbers are kept encrypted, shown masked in the console (audited full reveal) and searchable.
test('2026-11-17 phone.3: privacy 4 says the number is kept encrypted and shown masked to operators; earlier revisions unchanged',()=>{
 const legal=new LegalDocumentsService(),p=legal.catalog(new Date('2026-11-17T12:00:00+09:00')).documents.privacy,by=x=>p.sections.find(sec=>sec.title.startsWith(x)).body;
 assert.equal(p.version,'2026-11-17.phone.3');assert.equal(p.effectiveAt,'2026-11-17');
 assert.match(by('4. '),/번호는 암호화해 보관/);assert.match(by('4. '),/가운데 자리를 가려/);assert.match(by('4. '),/열람은 기록/);assert.match(by('4. '),/회원 문의 처리와 부정 이용 확인/);
 assert.doesNotMatch(by('4. '),/번호 자체를 저장하지 않고/);assert.match(by('7. '),/암호화한 휴대폰 번호와 확인 값은 회원 탈퇴 후/);
 assert.match(by('16. '),/./,'the ai.1 titles are kept');assert.match(p.notice,/2026-11-17 개정/);
 assert.equal(legal.catalog(new Date('2026-11-16T12:00:00+09:00')).documents.privacy.version,'2026-11-16.ai.1','the previous day keeps ai.1');
});

// 2026-11-17 user decision: not a beta any more, and adult content is never allowed (not 'opened later'); sanctions without prior warning.
test('2026-11-17 adult.1: terms/policy carry no beta wording, forbid adult content incl. AI photos, and keep the review request',()=>{
 const legal=new LegalDocumentsService(),c=legal.catalog(new Date('2026-11-17T12:00:00+09:00')),t=c.documents.terms,p=c.documents.policy,by=x=>t.sections.find(sec=>sec.title.startsWith(x)).body;
 assert.equal(t.version,'2026-11-17.adult.1');assert.equal(p.version,'2026-11-17.adult.1');assert.equal(t.effectiveAt,'2026-11-17');assert.equal(p.effectiveAt,'2026-11-17');
 for(const d of [t,p])assert.doesNotMatch(JSON.stringify(d),/베타|별도 개방/,'no beta or later-opening wording');
 assert.match(by('7. '),/성인 콘텐츠를 만들거나 올릴 수 없으며, AI 사진 편집으로 만드는 경우도 같습니다/);assert.match(by('7. '),/사전 경고 없이/);
 assert.match(JSON.stringify(p),/사전 경고 없이/);assert.match(JSON.stringify(p),/검토 요청/,'the review request stays');
 assert.match(by('4. '),/첫 갱신 실패 후 24시간 간격으로 최대 3회/);assert.match(by('4. '),/멤버십 카드 결제로는 실제 청구를 하지 않습니다/,'test-card wording kept without beta');
 assert.equal(legal.catalog(new Date('2026-11-16T12:00:00+09:00')).documents.terms.version,'2026-11-16.ai.1','the previous day keeps ai.1');
});
// 2026-11-18 user approval: the PostHog revision is published and in force from its deploy day (notice-based overseas transfer).
test('2026-11-18 posthog.1: privacy 7-10 disclose PostHog analytics and replay; in force from 2026-11-18 and used for signup',()=>{
 const {POSTHOG_PRIVACY:d}=require('../dist/src/platform/legal-documents'),legal=new LegalDocumentsService(),c=legal.catalog(new Date('2026-11-18T00:00:00+09:00'));
 assert.equal(d.status,'published');assert.equal(d.publishedAt,'2026-11-18');assert.equal(d.effectiveAt,'2026-11-18');assert.equal(d.version,'2026-11-18.posthog.1');
 assert.deepEqual(c.documents.privacy,d,'KST midnight of 2026-11-18 serves posthog.1');assert.match(d.notice,/2026-11-18 개정: 7항·8항·9항·10항/);
 assert.equal(legal.catalog(new Date('2026-11-17T23:59:00+09:00')).documents.privacy.version,'2026-11-17.phone.3','the previous day keeps phone.3');
 for(const day of ['2026-11-18T12:00:00+09:00','2027-01-01T12:00:00+09:00'])assert.equal(legal.catalog(new Date(day)).documents.privacy.version,'2026-11-18.posthog.1');
 const signup=legal.signup();assert.equal(signup.signupReady,true);assert.match(signup.versions.privacy,/^2026-11-18\.posthog\.1:[0-9a-f]{64}$/);assert.match(JSON.stringify(signup.documents.privacy),/PostHog/);
 for(const kind of ['terms','policy'])assert.equal(c.documents[kind].version,'2026-11-17.adult.1','terms and policy unchanged');
 const body=title=>d.sections.find(s=>s.title.startsWith(title)).body;
 // PIPA 28-8(2) items: what, country, when/how, recipient + contact, purpose + retention, how to refuse.
 assert.match(body('9. '),/④ PostHog, Inc\.\(미국, privacy@posthog\.com\): 서비스 화면을 이용할 때마다 다음 정보가 HTTPS로/);
 for(const item of ['접속 기록','기기·브라우저 정보','무작위 방문자 식별자','화면 이용 기록','입력한 값은 가리고 사진·영상은 기록하지 않음','접속 IP','이탈 원인 파악','최대 1년','최대 30일','①~③ 처리는','거부해도 서비스 이용에 제한이 없습니다'])assert.ok(body('9. ').includes(item),item);
 assert.ok(body('9. ').indexOf('④ PostHog')<body('9. ').indexOf('국외 이전을 원하지 않으면'));
 assert.match(body('8. '),/PostHog, Inc\.에 위탁합니다/);assert.match(body('7. '),/9조 ④를 따릅니다/);
 assert.match(body('10. '),/ph_로 시작하는 이름.*최대 1년.*추적 안 함\(Do Not Track\)/s);
 // Everything else is the phone.3 text unchanged.
 const current=legal.catalog(new Date('2026-11-17T12:00:00+09:00')).documents.privacy;
 for(const s of current.sections.filter(s=>!/^(7|8|9|10)\. /.test(s.title)))assert.deepEqual(d.sections.find(x=>x.title===s.title),s);
});
