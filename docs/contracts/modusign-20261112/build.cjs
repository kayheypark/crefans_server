// Modusign attachments (2026-11-12 user decision): ① 영업 가입 우대 조건 확인서 (contract article 8 separate writing)
// ② 계약일 시행 이용약관·운영정책 사본 (signature page: "적용 약관 사본을 제공받았음"). Usage:
//   LEGAL_DIST=<crefans_server dist dir built from the deployed commit> node build.cjs
// The terms copy is rendered from LegalDocumentsService.catalog() of that build for today (KST), so rebuild it whenever the
// terms or policy change and attach the copy whose date matches the contract date.
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||path.resolve(__dirname,'../../../../crefans_front/node_modules/playwright'));
const dir=__dirname,out=path.join(dir,'output');fs.mkdirSync(out,{recursive:true});
const css=fs.readFileSync(path.join(dir,'../design-two-column-20261103/design.css'),'utf8')+'\n'+fs.readFileSync(path.join(dir,'extra.css'),'utf8');
const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const kst=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());

function termsHtml(){
 require(path.join(process.env.LEGAL_DIST,'../node_modules/reflect-metadata'));
 const {LegalDocumentsService}=require(path.join(process.env.LEGAL_DIST,'src/platform/legal-documents'));
 const docs=new LegalDocumentsService().catalog().documents,picked=[docs.terms,docs.policy];
 const style=fs.readFileSync(path.join(dir,'preferential-terms.html'),'utf8').match(/<style>[\s\S]*?<\/style>/)[0];
 const body=picked.map(d=>`<div class="doc"><h1>${esc(d.title)}</h1><p class="meta">버전 ${esc(d.version)} · 시행일 ${esc(d.effectiveAt)} · 사본 생성일 ${kst}</p>`+
  d.sections.map(s=>`<h2>${esc(s.title)}</h2><p class="body">${esc(s.body)}</p>`+(s.links||[]).map(l=>`<p class="body">${esc(l.label)}: ${esc(l.href)}</p>`).join('')).join('')+'</div>').join('');
 const meta=picked.map(d=>({title:d.title,version:d.version,effectiveAt:d.effectiveAt,sha256:crypto.createHash('sha256').update(JSON.stringify(d)).digest('hex')}));
 return{html:`<!doctype html><html lang="ko"><meta charset="utf-8"><title>크레팬스 이용약관·운영정책 사본 ${kst}</title>${style}<body class="legal"><h1>크레팬스 이용약관·운영정책 사본</h1><p class="intro">크리에이터 파트너십 체결 계약서 제2조①에 따라 계약 시 제공하는 이용약관과 운영정책의 사본입니다. ${kst} 기준 시행본이며, 원문은 https://crefans.com/service/legal/terms 와 https://crefans.com/service/legal/policy 에서 확인할 수 있습니다.</p>${body}</body></html>`,meta};
}

(async()=>{
 const jobs=[{name:'crefans-preferential-terms',html:fs.readFileSync(path.join(dir,'preferential-terms.html'),'utf8')}];
 let terms=null;if(process.env.LEGAL_DIST){terms=termsHtml();jobs.push({name:`crefans-terms-policy-copy-${kst}`,html:terms.html});}
 const browser=await chromium.launch(),report=[];
 try{
  const logoPage=await browser.newPage({deviceScaleFactor:3});
  await logoPage.setContent(fs.readFileSync(path.join(dir,'logo.svg'),'utf8'));
  await logoPage.addStyleTag({content:'svg{width:190px!important;height:48px!important}'});
  const logo='data:image/png;base64,'+(await logoPage.locator('svg').screenshot({omitBackground:true})).toString('base64');
  for(const job of jobs){
   const html=job.html.replace('</style>','\n'+css+'\n</style>'),htmlPath=path.join(out,job.name+'.html');fs.writeFileSync(htmlPath,html);
   const page=await browser.newPage();await page.goto(require('url').pathToFileURL(htmlPath).href);await page.evaluate(()=>document.fonts.ready);
   const fonts=await page.evaluate(()=>Array.from(document.fonts).map(f=>({family:f.family,status:f.status})));
   if(!fonts.length||fonts.some(f=>f.status!=='loaded'))throw Error('Required contract fonts unavailable');
   const pdf=path.join(out,job.name+'.pdf');
   await page.pdf({path:pdf,format:'A4',printBackground:true,preferCSSPageSize:true,displayHeaderFooter:true,
    headerTemplate:`<div style="width:100%;padding:3mm 20mm 0;display:flex;align-items:center;justify-content:space-between"><img src="${logo}" style="width:95px;height:24px;object-fit:contain"><div style="display:flex;gap:5px"><span style="width:7px;height:7px;background:#a2a2a2;border-radius:50%"></span><span style="width:7px;height:7px;background:#c4c4c4;border-radius:50%"></span></div></div>`,
    footerTemplate:'<div style="width:100%;margin:0 20mm;padding-top:8px;border-top:1px solid #e2e2e2;display:flex;justify-content:flex-end;font-family:Apple SD Gothic Neo,sans-serif;font-size:9px;color:#737373"><span class="pageNumber" style="font-weight:bold;color:#505050"></span><span style="margin:0 6px">/</span><span class="totalPages"></span></div>'});
   report.push({pdf:path.basename(pdf),sha256:crypto.createHash('sha256').update(fs.readFileSync(pdf)).digest('hex'),bytes:fs.statSync(pdf).size,fonts});
   await page.close();
  }
  if(terms)report.push({legalDocuments:terms.meta,builtFrom:process.env.LEGAL_DIST});
  fs.writeFileSync(path.join(out,'build-report.json'),JSON.stringify(report,null,1));console.log(JSON.stringify(report,null,1));
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
