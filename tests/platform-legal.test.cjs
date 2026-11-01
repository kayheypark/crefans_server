require('reflect-metadata');
const {test}=require('node:test'),assert=require('node:assert/strict');
const {ConfigService}=require('@nestjs/config');
const {LegalDocumentsService}=require('../dist/src/platform/legal-documents');
const {PlatformAuthService}=require('../dist/src/platform/auth.service');
const {PlatformService}=require('../dist/src/platform/service');
const {publishedCatalog,blockedCatalog}=require('./legal-fixture.cjs');
const error=code=>e=>e.getResponse().code===code;
test('the released documents take effect on 2026-10-30 with no open items (2026-10-30 /pilot-work)',()=>{
 const source=new LegalDocumentsService();assert.deepEqual(source.catalog().blockers,[]);assert.equal(source.signup().signupReady,true);
 for(const d of [...Object.values(source.catalog().documents),source.catalog().collection,source.catalog().marketing]){assert.equal(d.status,'published');assert.equal(d.publishedAt,'2026-10-22');assert.equal(d.effectiveAt,'2026-10-30');assert.doesNotMatch(d.version,/draft/);}
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
test('the 2026-11-30 revision is published as upcoming and replaces the terms and policy on that KST date only',()=>{
 const legal=new LegalDocumentsService(),before=legal.catalog(new Date('2026-11-29T23:59:00+09:00')),after=legal.catalog(new Date('2026-11-30T00:00:00+09:00'));
 assert.equal(before.documents.terms.version,'2026-10-30.3');assert.equal(before.upcoming.effectiveAt,'2026-11-30');assert.equal(before.upcoming.documents.terms.version,'2026-11-30.1');
 assert.equal(after.documents.terms.version,'2026-11-30.1');assert.equal(after.documents.policy.version,'2026-11-30.1');assert.equal(after.upcoming,undefined);
 assert.equal(after.documents.privacy.version,before.documents.privacy.version,'privacy policy is not part of this revision');
 const terms=JSON.stringify(after.documents.terms);for(const added of ['11. 콩','10%를 공제','미수금','세금 처리 방식(원천징수 여부 포함)','신고한 회원에게 앱 알림','볼 수 없는 멤버십 전용 게시물에는 후원할 수 없습니다','오픈베타'])assert.ok(terms.includes(added),added);
 for(const removed of ['17개 계정','법정 원천징수는 별도'])assert.ok(!terms.includes(removed),removed);
});
