// 2026-11-16 user decision: OCTOMO phone-number ownership check (MO SMS) before the promotion 100콩, one account per number.
require('reflect-metadata');require('dotenv').config({path:'.local/platform.env',override:true});
const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('crypto'),{ConfigService}=require('@nestjs/config');
assert.equal(process.env.CREFANS_E2E,'true');const source=process.env.DATABASE_URL;assert.match(source||'',/@127\.0\.0\.1:3307\/crefans_platform_dev$/);const url=new URL(source);url.pathname='/crefans_platform_e2e';process.env.DATABASE_URL=url.toString();
const {PrismaClient}=require('@prisma/client'),db=new PrismaClient();
const {PhoneVerificationService,OCTOMO_URL,normalizePhone}=require('../dist/src/platform/phone-verification');
const {BeansService}=require('../dist/src/platform/beans.service'),{PlatformService}=require('../dist/src/platform/service'),{PlatformFinanceService}=require('../dist/src/platform/finance.service'),{BankTransferService}=require('../dist/src/platform/bank-transfer');
const ids=Array.from({length:2},()=>randomUUID()),[a,b]=ids,code=c=>e=>e.getResponse?.().code===c;
const config=new ConfigService({BEAN_LEDGER_ENABLED:'true',BETA_MODE:'true',OCTOMO_API_KEY:'test-octomo-key',LOCAL_AUTH_SECRET:'phone-test-secret'});
const provider={configForClient:()=>({clientKey:'test_ck_x'}),encrypt:x=>x,decrypt:x=>x};
const limiter={limit:async()=>{}};
const service=new PlatformService(db,undefined,config),phones=new PhoneVerificationService(service,config,limiter);
const transfers=new BankTransferService(service,provider,config),finance=new PlatformFinanceService(service,provider,config,{}),beans=new BeansService(service,finance,provider,{},config,transfers,phones);
let calls=[],sms=new Set();
phones.fetcher=async(u,init)=>{calls.push({u,init});const body=JSON.parse(init.body);return{ok:true,json:async()=>({exists:sms.has(body.mobileNum+':'+body.text)})};};
before(async()=>{globalThis.__release=await require('./e2e-db-lock.cjs').lockE2EDatabase(source);const r=require('child_process').spawnSync(process.execPath,[require.resolve('prisma/build/index.js'),'migrate','deploy'],{env:process.env,encoding:'utf8'});assert.equal(r.status,0,r.stdout+r.stderr);
 for(const id of ids)await db.member.create({data:{id,email:id+'@phone.test.invalid',name:'Synthetic',nickname:'번호검증',preferred_username:id.slice(0,20),email_verified:true}});});
after(async()=>{try{await db.phoneVerification.deleteMany({where:{member_id:{in:ids}}});await db.memberPhone.deleteMany({where:{member_id:{in:ids}}});await db.member.deleteMany({where:{id:{in:ids}}});}finally{await db.$disconnect();await globalThis.__release?.();}});

test('number format, OCTOMO request shape, only a keyed hash stored, one account per number',async()=>{
 assert.equal(normalizePhone('010-1234-5678'),'01012345678');assert.throws(()=>normalizePhone('+821012345678'),code('INVALID_PHONE'));
 const s=await phones.start(a,{phone:'010-1234-5678'});assert.match(s.code,/^[0-9]{6}$/);assert.equal(s.receiver,'1666-3538');assert.match(s.smsUri,new RegExp(`^sms:16663538\\?&body=${s.code}$`));
 await assert.rejects(phones.confirm(a,{phone:'01012345678'}),code('PHONE_SMS_NOT_FOUND'),'no SMS yet');
 const req=calls.at(-1);assert.equal(req.u,OCTOMO_URL);assert.equal(req.init.headers.Authorization,'Octomo test-octomo-key');assert.deepEqual(JSON.parse(req.init.body),{mobileNum:'01012345678',text:s.code,withinMinutes:10});
 sms.add('01012345678:'+s.code);assert.deepEqual(await phones.confirm(a,{phone:'01012345678'}),{verified:true});
 const row=await db.memberPhone.findUniqueOrThrow({where:{member_id:a}});assert.match(row.phone_hash,/^[0-9a-f]{64}$/);assert.ok(!JSON.stringify(row).includes('01012345678'),'the number itself is not stored');
 await assert.rejects(phones.start(b,{phone:'01012345678'}),code('PHONE_IN_USE'),'another account cannot reuse the number');
 await assert.rejects(phones.confirm(b,{phone:'01099998888'}),code('PHONE_CODE_EXPIRED'),'confirm needs a started code for that number');
});

test('promotion 100콩 claim requires a verified number while OCTOMO is configured; off without the key',async()=>{
 const status=await beans.promotionEvent(b);assert.equal(status.phoneRequired,true);assert.equal(status.phoneVerified,false);
 await assert.rejects(beans.claimPromotionEvent(b,{}),code('PHONE_VERIFICATION_REQUIRED'));
 const off=new PhoneVerificationService(service,new ConfigService({LOCAL_AUTH_SECRET:'x'}),limiter);assert.equal(off.enabled(),false);await assert.rejects(off.start(a,{phone:'01012345678'}),code('PHONE_VERIFICATION_UNAVAILABLE'));
 const plain=new BeansService(service,finance,provider,{},config,transfers,off);assert.equal((await plain.promotionEvent(b)).phoneRequired,undefined,'without the key the event looks exactly as before');
 phones.fetcher=async()=>({ok:false,json:async()=>({statusCode:401})});const s=await phones.start(b,{phone:'01077776666'});await assert.rejects(phones.confirm(b,{phone:'01077776666'}),code('PHONE_CHECK_UNAVAILABLE'),'provider failure is never a pass');assert.equal(await phones.verified(b),false);void s;
});
