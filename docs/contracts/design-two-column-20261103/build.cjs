const fs=require('fs'),path=require('path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||path.resolve(__dirname,'../../../../crefans_front/node_modules/playwright'));
(async()=>{
 const dir=__dirname,src=fs.readFileSync(path.join(dir,'source.html'),'utf8');
 let html=src.replace('</style>','\n'+fs.readFileSync(path.join(dir,'design.css'),'utf8')+'\n</style>');
 html=html.replace('<section class="article">','<div class="contract-columns"><section class="article">').replace('<div class="annex">','</div><div class="annex">');
 fs.writeFileSync(path.join(dir,'designed.html'),html);
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage();
  await page.goto(require('url').pathToFileURL(path.join(dir,'designed.html')).href);
  await page.evaluate(()=>document.fonts.ready);
  const fonts=await page.evaluate(()=>Array.from(document.fonts).map(f=>({family:f.family,status:f.status})));
  if(fonts.length!==2||fonts.some(f=>f.status!=='loaded'))throw Error('Required contract fonts unavailable');
  const logoPage=await browser.newPage({deviceScaleFactor:3});
  await logoPage.setContent(fs.readFileSync(path.join(dir,'logo.svg'),'utf8'));
  await logoPage.addStyleTag({content:'svg{width:190px!important;height:48px!important}'});
  const logo='data:image/png;base64,'+(await logoPage.locator('svg').screenshot({omitBackground:true})).toString('base64');
  await logoPage.close();
  const sourcePage=await browser.newPage();
  await sourcePage.goto(require('url').pathToFileURL(path.join(dir,'source.html')).href);
  const a=await sourcePage.locator('body').textContent(),b=await page.locator('body').textContent();
  if(a!==b)throw Error('Contract HTML body text changed');
  await page.pdf({path:path.join(dir,'crefans-creator-agreement-two-column.pdf'),format:'A4',printBackground:true,preferCSSPageSize:true,displayHeaderFooter:true,
   headerTemplate:`<div style="width:100%;padding:3mm 20mm 0;display:flex;align-items:center;justify-content:space-between"><img src="${logo}" style="width:95px;height:24px;object-fit:contain"><div style="display:flex;gap:5px"><span style="width:7px;height:7px;background:#a2a2a2;border-radius:50%"></span><span style="width:7px;height:7px;background:#c4c4c4;border-radius:50%"></span></div></div>`,
   footerTemplate:'<div style="width:100%;margin:0 20mm;padding-top:8px;border-top:1px solid #e2e2e2;display:flex;justify-content:flex-end;font-family:Apple SD Gothic Neo,sans-serif;font-size:9px;color:#737373"><span class="pageNumber" style="font-weight:bold;color:#505050"></span><span style="margin:0 6px">/</span><span class="totalPages"></span></div>'});
  console.log(JSON.stringify({htmlBodyEqual:a===b,fonts}));
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
