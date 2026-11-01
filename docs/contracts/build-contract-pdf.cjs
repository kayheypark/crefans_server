const fs=require('fs'),path=require('path'),{createRequire}=require('module');
const root=path.resolve(__dirname,'../..');
const requireFromFront=createRequire(path.resolve(root,'../crefans_front/package.json'));
const {chromium}=requireFromFront('playwright');
(async()=>{const browser=await chromium.launch();try{const page=await browser.newPage();await page.goto(require('url').pathToFileURL(path.join(root,'tmp/pdfs/contract-formal.html')).href);await page.evaluate(()=>document.fonts.ready);fs.mkdirSync(path.join(root,'output/pdf'),{recursive:true});await page.pdf({path:path.join(root,'output/pdf/crefans-creator-agreement-draft.pdf'),format:'A4',printBackground:true,displayHeaderFooter:true,headerTemplate:'<span></span>',footerTemplate:'<div style="font-size:9px;width:100%;text-align:center;color:#333">- <span class="pageNumber"></span> -</div>',preferCSSPageSize:true});}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
