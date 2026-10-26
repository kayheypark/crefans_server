require('reflect-metadata');
const {test}=require('node:test'),assert=require('node:assert/strict');
const {LegalDocumentsService}=require('../dist/src/platform/legal-documents');
const {PlatformAuthService}=require('../dist/src/platform/auth.service');
const {PlatformService}=require('../dist/src/platform/service');
const {publishedCatalog}=require('./legal-fixture.cjs');
const error=code=>e=>e.getResponse().code===code;
test('public legal documents remain readable while unresolved processing prevents signup, including E2E env',async()=>{
 const legal=new LegalDocumentsService();assert.equal(legal.signup().published,false);assert.equal(legal.signup().documentsPublished,true);assert.equal(legal.signup().signupReady,false);for(const d of Object.values(legal.catalog().documents)){assert.equal(d.status,'published');assert.equal(d.publishedAt,'2026-10-22');assert.equal(d.effectiveAt,null);assert.doesNotMatch(d.version,/draft/);}
 assert.throws(()=>legal.consents({}),error('POLICY_NOT_PUBLISHED'));
 const auth=new PlatformAuthService({}, {},{sendCode(){throw Error('must not send');}}, {},legal);
 await assert.rejects(auth.requestCode('synthetic@example.invalid'),error('POLICY_NOT_PUBLISHED'));
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
