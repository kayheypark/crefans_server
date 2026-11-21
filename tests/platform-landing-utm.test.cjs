require('reflect-metadata');require('dotenv').config({path:'.local/platform.env',override:true});
// 2026-11-21 user request (유입 분석·랜딩 링크): landing visits are counted per KST day and UTM combination (aggregate only), the
// console report groups them, and operators keep tagged landing links. Uses the isolated e2e DB; test rows live on 2026-01-01..10
// (before the feature existed) or carry a random campaign, and are removed afterwards.
const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
assert.equal(process.env.CREFANS_E2E,'true');const source=process.env.DATABASE_URL;assert.match(source||'',/@127\.0\.0\.1:3307\/crefans_platform_dev$/);const url=new URL(source);url.pathname='/crefans_platform_e2e';process.env.DATABASE_URL=url.toString();
Object.assign(process.env,{LOCAL_AUTH_SECRET:'r'.repeat(64),DATA_ENCRYPTION_KEY:'a'.repeat(64),TELEGRAM_OPERATIONS_BOT_TOKEN:'',TELEGRAM_OPERATIONS_CHAT_ID:'',SMTP_HOST:'',BEAN_LEDGER_ENABLED:'false',AUTH_PROVIDER:'local',MEDIA_STORAGE:'local'});
const {PrismaClient}=require('@prisma/client'),db=new PrismaClient();
const utm=require('../dist/src/platform/landing-utm'),funnel=require('../dist/src/platform/funnel-stats'),{kstDay}=require('../dist/src/platform/ai-preset-usage');
const {ADMIN_PERMISSION,can}=require('../dist/src/platform/admin-permissions'),{PlatformAdminController}=require('../dist/src/platform/admin.controller');
const FROM=new Date('2026-01-01T00:00:00Z'),TO=new Date('2026-01-10T00:00:00Z'),at=d=>new Date(`2026-01-${d}T03:00:00Z`);// 12:00 KST
const tag='t'+crypto.randomBytes(5).toString('hex'),admin={id:'test-admin-'+crypto.randomUUID()},links=[];
const clean=async()=>{await db.$executeRaw`DELETE FROM landing_utm_daily WHERE (day>=${FROM} AND day<=${TO}) OR campaign LIKE ${tag+'%'}`;await db.$executeRaw`DELETE FROM funnel_step_daily WHERE day>=${FROM} AND day<=${TO}`;};
const status=code=>e=>(e.getStatus?.()??e.status)===code;
before(async()=>{
 globalThis.__release=await require('./e2e-db-lock.cjs').lockE2EDatabase(source);
 const result=require('node:child_process').spawnSync(process.execPath,[require.resolve('prisma/build/index.js'),'migrate','deploy'],{env:process.env,encoding:'utf8'});assert.equal(result.status,0,result.stdout+result.stderr);
 await clean();
});
after(async()=>{try{await clean();await db.$executeRaw`DELETE FROM landing_links WHERE created_by=${admin.id}`;if(links.length)await db.platformAuditLog.deleteMany({where:{entity_id:{in:links}}});}finally{await db.$disconnect();await globalThis.__release?.();}});

test('the table stores only day, utm values, referrer host, count and updated_at — no member, guest, IP, cookie or user-agent column',async()=>{
 const rows=await db.$queryRaw`SELECT COLUMN_NAME AS name FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='landing_utm_daily' ORDER BY ORDINAL_POSITION`;
 assert.deepEqual(rows.map(r=>r.name),['day','source','medium','campaign','content','referrer_host','count','updated_at']);
});
test('counting: one row per KST day and combination, incremented; source/medium lowercased; campaign case kept; never throws',async()=>{
 for(let i=0;i<3;i++)assert.equal(await utm.recordLandingUtm(db,{utmSource:'X',utmMedium:'Paid',utmCampaign:'cosplayer_wanted',utmContent:'cat'},at('05')),true);
 await utm.recordLandingUtm(db,{utmSource:'x',utmMedium:'paid',utmCampaign:'Cosplayer_wanted',utmContent:'cat'},at('05'));
 await utm.recordLandingUtm(db,{utmSource:'x',utmMedium:'paid',utmCampaign:'cosplayer_wanted',utmContent:'cat'},new Date('2026-01-05T15:30:00Z'));// 00:30 KST on the 6th
 const rows=await db.$queryRaw`SELECT day,source,medium,campaign,content,referrer_host,count FROM landing_utm_daily WHERE day>=${FROM} AND day<=${TO} ORDER BY day,campaign`;
 assert.deepEqual(rows.map(r=>[r.day.toISOString().slice(0,10),r.source,r.medium,r.campaign,r.content,r.referrer_host,r.count]),[
  ['2026-01-05','x','paid','Cosplayer_wanted','cat','',1],['2026-01-05','x','paid','cosplayer_wanted','cat','',3],['2026-01-06','x','paid','cosplayer_wanted','cat','',1]]);
 assert.equal(await utm.recordLandingUtm({$executeRaw:async()=>{throw Error('db down');}},{utmSource:'x'}),false);
});
test('a real landing_view report counts the UTM row; invalid UTM is dropped to empty; deploy_test is not counted',async()=>{
 const today=kstDay(),row=async(c)=>(await db.$queryRaw`SELECT source,medium,content,referrer_host,count FROM landing_utm_daily WHERE day=${today} AND campaign=${c}`)[0];
 const ip='192.0.2.'+crypto.randomInt(1,250),run=fn=>require('../dist/src/platform/request-context').requestContext.run({ip,peerIp:'',requestId:'t'},fn);
 assert.deepEqual(await run(()=>funnel.reportFunnelStep(db,{step:'landing_view',utmSource:'Daangn',utmMedium:'paid',utmCampaign:tag+'a',utmContent:'bad value!',referrerHost:'t.co'})),{recorded:true});
 const a=await row(tag+'a');assert.deepEqual({...a},{source:'daangn',medium:'paid',content:'',referrer_host:'t.co',count:1});
 assert.deepEqual(await run(()=>funnel.reportFunnelStep(db,{step:'landing_view',utmSource:'deploy_test_ip',utmCampaign:tag+'b'})),{recorded:false});
 assert.equal(await row(tag+'b'),undefined,'deploy test visit not counted');
 assert.deepEqual(await run(()=>funnel.reportFunnelStep(db,{step:'guest_consent_view'})),{recorded:true});
});
test('report: groups by source/medium/campaign/content, no-UTM bucket by referrer host, zero-filled daily series, share against landing_view',async()=>{
 await clean();const now=new Date('2026-01-10T05:00:00Z'),rec=(s,d)=>utm.recordLandingUtm(db,s,at(d));
 for(let i=0;i<4;i++)await rec({utmSource:'x',utmMedium:'paid',utmCampaign:'cosplayer_wanted',utmContent:'cat'},'03');
 for(let i=0;i<2;i++)await rec({utmSource:'x',utmMedium:'paid',utmCampaign:'cosplayer_wanted',utmContent:'pink'},'04');
 await rec({utmSource:'x',utmMedium:'paid',utmCampaign:'cosplayer_wanted',utmContent:'cat',referrerHost:'t.co'},'04');
 await rec({utmSource:'daangn',utmMedium:'paid',utmCampaign:'d1'},'04');
 await rec({referrerHost:'m.search.naver.com'},'04');await rec({},'04');await rec({},'05');
 // landing_view: the 2nd is before UTM counting started (03) and is left out of the share denominator.
 for(const [d,n] of [['02',50],['03',5],['04',8],['05',2]])await db.$executeRaw`INSERT INTO funnel_step_daily (day,step,count) VALUES (${new Date(`2026-01-${d}T00:00:00Z`)},'landing_view',${n})`;
 const r=await utm.landingUtmStats(db,{from:'2026-01-01',to:'2026-01-10'},now);
 assert.equal(r.days,10);assert.equal(r.dates.length,10);assert.equal(r.dates[0],'2026-01-01');assert.equal(r.trackingSince,'2026-01-03');
 assert.deepEqual(r.totals,{landingViews:15,recorded:11,withUtm:8,withoutUtm:3});
 assert.deepEqual(r.topSource,{source:'x',count:7});
 assert.deepEqual(r.groups,[{source:'x',medium:'paid',campaign:'cosplayer_wanted',content:'cat',count:5},{source:'x',medium:'paid',campaign:'cosplayer_wanted',content:'pink',count:2},{source:'daangn',medium:'paid',campaign:'d1',content:'',count:1}]);
 assert.deepEqual(r.noUtm,[{referrerHost:'',count:2},{referrerHost:'m.search.naver.com',count:1}]);
 assert.deepEqual(r.daily.slice(1,5),[{date:'2026-01-02',landingViews:50,withUtm:0,withoutUtm:0},{date:'2026-01-03',landingViews:5,withUtm:4,withoutUtm:0},{date:'2026-01-04',landingViews:8,withUtm:4,withoutUtm:2},{date:'2026-01-05',landingViews:2,withUtm:0,withoutUtm:1}]);
 assert.deepEqual(r.daily[9],{date:'2026-01-10',landingViews:0,withUtm:0,withoutUtm:0});
 assert.match(r.notice,/배포 이후/);
});
test('date range: default last 14 KST days, max 92, no future, from <= to, strict format',()=>{
 const now=new Date('2026-03-31T16:00:00Z');// 2026-04-01 01:00 KST
 const d=utm.utmRange({},now);assert.equal(d.to.toISOString().slice(0,10),'2026-04-01');assert.equal(d.from.toISOString().slice(0,10),'2026-03-19');assert.equal(d.days,14);
 assert.equal(utm.utmRange({from:'2026-01-01',to:'2026-04-01'},now).days,91);assert.equal(utm.utmRange({from:'2025-12-31',to:'2026-04-01'},now).days,92);
 for(const q of [{from:'2025-12-30',to:'2026-04-01'},{to:'2026-04-02'},{from:'2026-03-02',to:'2026-03-01'},{from:'2026-02-30'},{from:'26-01-01'},{to:['2026-01-01']},{from:'2026-1-1'}])
  assert.throws(()=>utm.utmRange(q,now),status(400),JSON.stringify(q));
});
test('links: create builds the URL, lowercases source/medium, rejects bad UTM, path, name and duplicates; update and archive are audited',async()=>{
 const base={name:'X 고양이 광고',landingPath:'/service/landing-ai-image-generation',utmSource:'X',utmMedium:'Paid',utmCampaign:tag,utmContent:'cat',memo:'11월 광고'};
 const bad=[{utmSource:'x y'},{utmSource:''},{utmMedium:undefined},{utmCampaign:'a'.repeat(41)},{utmContent:'고양이'},{utmCampaign:'a&b=c'},{landingPath:'/evil'},{landingPath:'https://evil.example/'},{landingPath:'/service/landing-ai-image-generation?x=1'},{name:' '},{name:'a'.repeat(81)},{memo:'m'.repeat(501)}];
 for(const b of bad)await assert.rejects(utm.createLandingLink(db,admin,{...base,...b}),status(400),JSON.stringify(b));
 const {link}=await utm.createLandingLink(db,admin,base);links.push(link.id);
 assert.equal(link.url,`https://crefans.com/service/landing-ai-image-generation?utm_source=x&utm_medium=paid&utm_campaign=${tag}&utm_content=cat`);
 assert.equal(link.utmSource,'x');assert.equal(link.utmMedium,'paid');assert.equal(link.archivedAt,null);
 assert.ok(await db.platformAuditLog.findFirst({where:{action:'admin.landing_link_created',entity_id:link.id}}));
 await assert.rejects(utm.createLandingLink(db,admin,{...base,name:'중복',landingPath:'/'}),status(409),'same active UTM combination');
 const home=(await utm.createLandingLink(db,admin,{...base,utmContent:undefined,landingPath:'/',memo:undefined})).link;links.push(home.id);
 assert.equal(home.url,`https://crefans.com/?utm_source=x&utm_medium=paid&utm_campaign=${tag}`);assert.equal(home.utmContent,'');
 // Visits for the exact combination over the last 14/30 days come from the UTM counts.
 const now=new Date();for(let i=0;i<3;i++)await utm.recordLandingUtm(db,{utmSource:'x',utmMedium:'paid',utmCampaign:tag,utmContent:'cat'},now);
 await utm.recordLandingUtm(db,{utmSource:'x',utmMedium:'paid',utmCampaign:tag,utmContent:'cat'},new Date(Date.now()-20*86400000));
 await utm.recordLandingUtm(db,{utmSource:'x',utmMedium:'paid',utmCampaign:tag,utmContent:'pink'},now);
 let list=await utm.listLandingLinks(db);const listed=list.links.find(l=>l.id===link.id);
 assert.deepEqual(listed.visits,{last14:3,last30:4});assert.equal(list.links.find(l=>l.id===home.id).visits,null,'home links are not counted');
 await assert.rejects(utm.updateLandingLink(db,admin,link.id,{name:''}),status(400));await assert.rejects(utm.updateLandingLink(db,admin,link.id,{}),status(400));
 await assert.rejects(utm.updateLandingLink(db,admin,'missing',{name:'x'}),status(404));
 const upd=await utm.updateLandingLink(db,admin,link.id,{name:'X 고양이 광고 2',utmSource:'ignored'});assert.equal(upd.link.name,'X 고양이 광고 2');assert.equal(upd.link.memo,'11월 광고');assert.equal(upd.link.utmSource,'x','UTM stays fixed');
 const ua=await db.platformAuditLog.findFirst({where:{action:'admin.landing_link_updated',entity_id:link.id}});assert.deepEqual(ua.metadata.changedFields,["name"]);
 await utm.archiveLandingLink(db,admin,link.id);await assert.rejects(utm.archiveLandingLink(db,admin,link.id),status(409));await assert.rejects(utm.updateLandingLink(db,admin,link.id,{name:'x'}),status(409));
 assert.ok(await db.platformAuditLog.findFirst({where:{action:'admin.landing_link_archived',entity_id:link.id}}));
 const again=(await utm.createLandingLink(db,admin,{...base,name:'다시'})).link;links.push(again.id);assert.notEqual(again.id,link.id,'archived combination can be reused');
 list=await utm.listLandingLinks(db);const ids=list.links.map(l=>l.id);assert.ok(ids.indexOf(again.id)<ids.indexOf(link.id),'active links first');assert.ok(list.links.find(l=>l.id===link.id).archivedAt);
});
test('permissions: stats and list need overview.view; create, update and archive need settings.update',()=>{
 const rule=m=>Reflect.getMetadata(ADMIN_PERMISSION,PlatformAdminController.prototype[m]);
 assert.deepEqual(rule('landingUtm'),['overview','view']);assert.deepEqual(rule('landingLinks'),['overview','view']);
 for(const m of ['createLandingLink','updateLandingLink','archiveLandingLink'])assert.deepEqual(rule(m),['settings','update'],m);
 const viewer={is_active:true,role:'ADMIN',permissions:{overview:{view:true}}},editor={is_active:true,role:'ADMIN',permissions:{overview:{view:true},settings:{view:true,update:true}}};
 assert.equal(can(viewer,'overview','view'),true);assert.equal(can(viewer,'settings','update'),false);assert.equal(can(editor,'settings','update'),true);
});
