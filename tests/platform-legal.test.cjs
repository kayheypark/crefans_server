require('reflect-metadata');
const {test}=require('node:test'),assert=require('node:assert/strict');
const {ConfigService}=require('@nestjs/config');
const {LegalDocumentsService}=require('../dist/src/platform/legal-documents');
const {PlatformAuthService}=require('../dist/src/platform/auth.service');
const {PlatformService}=require('../dist/src/platform/service');
const {publishedCatalog}=require('./legal-fixture.cjs');
const error=code=>e=>e.getResponse().code===code;
test('public legal documents remain readable while unresolved processing prevents signup, including E2E env',async()=>{
 const legal=new LegalDocumentsService();assert.equal(legal.signup().published,false);assert.equal(legal.signup().documentsPublished,true);assert.equal(legal.signup().signupReady,false);for(const d of Object.values(legal.catalog().documents)){assert.equal(d.status,'published');assert.equal(d.publishedAt,'2026-10-22');assert.equal(d.effectiveAt,null);assert.doesNotMatch(d.version,/draft/);}
 assert.throws(()=>legal.consents({}),error('POLICY_NOT_PUBLISHED'));
 // An invited email still waits for published terms; a non-invited email gets the beta notice first.
 // No console invite exists for the stranger, so only the env allowlist can admit it.
 const auth=new PlatformAuthService({signupInvite:{findFirst:async()=>null}}, {},{sendCode(){throw Error('must not send');}}, new ConfigService({BETA_MODE:'true',SIGNUP_EMAIL_ALLOWLIST:'synthetic@example.invalid'}),legal);
 await assert.rejects(auth.requestCode('synthetic@example.invalid'),error('POLICY_NOT_PUBLISHED'));
 await assert.rejects(auth.requestCode('stranger@example.invalid'),e=>e.getResponse().code==='SIGNUP_INVITE_REQUIRED'&&e.getResponse().message==='베타기간(~26년 11월)에는 사전 협의된 유저만 가입할 수 있습니다. 빠른 시일 내에 그랜드 오픈을 준비하겠습니다.');
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
