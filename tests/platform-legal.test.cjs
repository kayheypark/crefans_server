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
 for(const d of [source.catalog().documents.terms,source.catalog().documents.policy]){assert.equal(d.status,'published');assert.equal(d.publishedAt,'2026-11-06');assert.equal(d.effectiveAt,'2026-11-06');assert.doesNotMatch(d.version,/draft/);}
 for(const d of [source.catalog().collection,source.catalog().marketing]){assert.equal(d.status,'published');assert.equal(d.publishedAt,'2026-10-22');assert.equal(d.effectiveAt,'2026-10-30');assert.doesNotMatch(d.version,/draft/);}
 assert.equal(source.catalog().upcoming,undefined,'nothing pending');
 // The privacy policy was revised on the notice day of the merged revision (2026-11-02 user decision) and applies from that day.
 const p=source.catalog().documents.privacy;assert.equal(p.status,'published');assert.equal(p.publishedAt,'2026-11-03');assert.equal(p.effectiveAt,'2026-11-03');assert.equal(p.version,'2026-11-03.views.1');assert.match(JSON.stringify(p),/cf_post_visitor/);
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
test('the revision is the single version in force from its KST effective day, with no upcoming document',()=>{
 const legal=new LegalDocumentsService(),after=legal.catalog(new Date('2026-11-06T00:00:00+09:00'));
 assert.equal(LEGAL_NOTICE_DATE,'2026-11-06');assert.equal(NEXT_TERMS_EFFECTIVE,LEGAL_NOTICE_DATE,'in force from the deploy day, not 30 days later');
 assert.equal(after.documents.terms.version,'2026-11-06.4');assert.equal(after.documents.policy.version,'2026-11-06.1');
 assert.equal(after.upcoming,undefined,'nothing is pending any more');
 assert.equal(after.documents.terms.effectiveAt,'2026-11-06');assert.equal(after.documents.terms.status,'published');
 // 시행일 전날은 이전 본이 보이고, 그 이후로는 계속 이 본이다.
 const before=legal.catalog(new Date('2026-11-05T23:59:00+09:00'));
 assert.equal(before.documents.terms.version,'2026-10-30.3');assert.equal(before.upcoming.effectiveAt,'2026-11-06');
 assert.equal(legal.catalog(new Date('2026-12-06T12:00:00+09:00')).documents.terms.version,'2026-11-06.4');
 const terms=JSON.stringify(after.documents.terms);
 for(const added of ['11. 콩','10%를 공제','미수금','신고한 회원에게 앱 알림','볼 수 없는 멤버십 전용 게시물에는 후원할 수 없습니다','오픈베타','회사가 부담하여 신고·납부','화요일 23:59','다음 영업일','친구 초대 보상 등으로 무상 지급한 프로모션콩','받은 회원이 환불하거나 출금할 수 없습니다','프로모션콩으로 후원해 크리에이터가 받은 콩은 일반 후원 콩과 같이 제6조 기준에 따라 출금할 수 있습니다','12. 친구 초대','남은 콩을 회수','https://crefans.com/핸들','끌 수 없습니다','지급일로부터 1년간 쓸 수 있으며','2026년 11월 6일부터 적용합니다','통신판매업 신고번호: 2026-서울관악-2144'])assert.ok(terms.includes(added),added);
 for(const removed of ['17개 계정','프로모션콩은 환불·출금 대상이 아닙니다','법정 원천징수는 별도','세금 처리 방식(원천징수 여부 포함)','공휴일·신청 마감 등 세부 일정','운영자가 지급한 프로모션콩','지급일로부터 5년간 쓸 수 있으며','30일 뒤에 시행','2026년 12월','통신판매업을 신고하고 신고번호를','통신판매업 신고번호는 확인 중'])assert.ok(!terms.includes(removed),removed);
 const privacy=JSON.stringify(before.documents.privacy);
 for(const added of ['메타데이터를 제거','운영자가 통장 사본 등으로 확인','처리를 마친 날부터 3년','회원 정보 파기 후 5년','재사용 금지 목록','ab***@n***.com','해시 값(앞 12자리)','edpo.com/telegram-gdpr-data-request'])assert.ok(privacy.includes(added),added);
 for(const removed of ['본인확인된 예금주명','문의·신고 기록은','요청·기록·회원·거래 식별자'])assert.ok(!privacy.includes(removed),removed);
});

test('upcoming terms separate the new30-day event from unchanged existing grants',()=>{const c=new LegalDocumentsService().catalog(new Date('2026-11-03T00:00:00Z')),text=JSON.stringify(c.upcoming.documents.terms);assert.match(text,/30일\(720시간\)/);assert.match(text,/기존 지급분의 사용기한이나 이미 후원한 크리에이터의 수익은 변경하지/);assert.equal(c.documents.terms.version,'2026-10-30.3');});
