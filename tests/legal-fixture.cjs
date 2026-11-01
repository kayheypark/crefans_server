const assert=require('node:assert/strict');
const {LegalDocumentsService}=require('../dist/src/platform/legal-documents');
const sourceCatalog=LegalDocumentsService.prototype.catalog;
function publishedCatalog(){
 const c=sourceCatalog.call(new LegalDocumentsService());c.blockers=[];
 for(const d of [...Object.values(c.documents),c.collection,c.marketing]){
  d.title='검증용 '+d.title;d.version='test-only-1';d.status='published';d.effectiveAt='2020-01-01';d.notice='격리 테스트에서 주입한 문서';
 }
 return c;
}
// The source catalog with an open item again: keeps the signup gate itself under test now that signup is open.
function blockedCatalog(){const c=sourceCatalog.call(new LegalDocumentsService());c.blockers=['검증용 미해결 항목'];return c;}
function installTestLegal(){
 assert.equal(process.env.CREFANS_E2E,'true');
 assert.match(process.env.DATABASE_URL||'',/@127\.0\.0\.1:3307\/crefans_platform_(dev|e2e)(\?|$)/);
 LegalDocumentsService.prototype.catalog=publishedCatalog;
 return new LegalDocumentsService();
}
module.exports={publishedCatalog,blockedCatalog,installTestLegal};
