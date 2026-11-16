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

test('number format, OCTOMO request shape, only a keyed hash stored without an encryption key, one account per number',async()=>{
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
 const off=new PhoneVerificationService(service,new ConfigService({LOCAL_AUTH_SECRET:'x',OCTOMO_API_KEY:''}),limiter);assert.equal(off.enabled(),false);await assert.rejects(off.start(a,{phone:'01012345678'}),code('PHONE_VERIFICATION_UNAVAILABLE'));
 const plain=new BeansService(service,finance,provider,{},config,transfers,off);assert.equal((await plain.promotionEvent(b)).phoneRequired,undefined,'without the key the event looks exactly as before');
 phones.fetcher=async()=>({ok:false,json:async()=>({statusCode:401})});const s=await phones.start(b,{phone:'01077776666'});await assert.rejects(phones.confirm(b,{phone:'01077776666'}),code('PHONE_CHECK_UNAVAILABLE'),'provider failure is never a pass');assert.equal(await phones.verified(b),false);void s;
});

test('signup: needs the verified email proof, OCTOMO-confirmed SMS gives a one-time proof, the new account gets the number once',async()=>{
 const {digest}=require('../dist/src/auth/local/credentials');
 phones.fetcher=async(u,init)=>{const body=JSON.parse(init.body);return{ok:true,json:async()=>({exists:sms.has(body.mobileNum+':'+body.text)})};};
 const email=randomUUID()+'@signup-phone.test.invalid',emailProof='proof-'+randomUUID();
 await assert.rejects(phones.signupStart(email,{emailProof,phone:'01055554444'}),code('EMAIL_VERIFICATION_REQUIRED'),'no verified email yet');
 await db.signupChallenge.create({data:{email,code_hash:'x',attempts:0,sent_at:new Date(),expires_at:new Date(Date.now()+1800000),verified_at:new Date(),proof_hash:digest(emailProof)}});
 try{
  await assert.rejects(phones.signupStart(email,{emailProof:'wrong',phone:'01055554444'}),code('EMAIL_VERIFICATION_REQUIRED'));
  await assert.rejects(phones.signupStart(email,{emailProof,phone:'01012345678'}),code('PHONE_IN_USE'),'a number already bound to account A cannot sign up again');
  const s=await phones.signupStart(email,{emailProof,phone:'010-5555-4444'});
  await assert.rejects(phones.signupConfirm(email,{emailProof,phone:'01055554444'}),code('PHONE_SMS_NOT_FOUND'));
  sms.add('01055554444:'+s.code);const c=await phones.signupConfirm(email,{emailProof,phone:'01055554444'});assert.equal(c.verified,true);assert.match(c.proof,/^[A-Za-z0-9_-]{32}$/);
  const newMember=randomUUID();await db.member.create({data:{id:newMember,email,name:'',nickname:'가입',preferred_username:newMember.slice(0,20),email_verified:true}});ids.push(newMember);
  await assert.rejects(db.$transaction(tx=>phones.attachSignup(tx,email,{phone:'01055554444',phoneProof:'forged'},newMember)),code('PHONE_VERIFICATION_REQUIRED'),'forged proof');
  await db.$transaction(tx=>phones.attachSignup(tx,email,{phone:'01055554444',phoneProof:c.proof},newMember));
  assert.equal(await phones.verified(newMember),true);
  await assert.rejects(db.$transaction(tx=>phones.attachSignup(tx,email,{phone:'01055554444',phoneProof:c.proof},newMember)),code('PHONE_VERIFICATION_REQUIRED'),'the proof is single-use');
 }finally{await db.signupChallenge.deleteMany({where:{email}});}
});

test('PC asks for a QR: OCTOMO qr-code is called with the code and a bad QR response is dropped without blocking the check',async()=>{
 const seen=[];phones.fetcher=async(u,init)=>{seen.push(u);if(u.endsWith('/qr-code'))return{ok:true,json:async()=>({qrCode:'data:image/png;base64,AAAA'})};return{ok:true,json:async()=>({exists:false})};};
 const m=randomUUID();ids.push(m);await db.member.create({data:{id:m,email:m+'@phone.test.invalid',name:'Synthetic',nickname:'QR',preferred_username:m.slice(0,20),email_verified:true}});
 const withQr=await phones.start(m,{phone:'01033332222',qr:true});assert.equal(withQr.qrCode,'data:image/png;base64,AAAA');assert.ok(seen.some(u=>u.endsWith('/qr-code')));
 const bodies=[];phones.fetcher=async(u,init)=>{bodies.push(JSON.parse(init.body));return{ok:true,json:async()=>({qrCode:'javascript:alert(1)'})};};
 const bad=await phones.start(m,{phone:'01033332222',qr:true});assert.equal(bad.qrCode,undefined,'only PNG data URLs are passed on');assert.equal(bodies[0].text,bad.code);
 const mobile=await phones.start(m,{phone:'01033332222'});assert.equal(mobile.qrCode,undefined,'no QR call for mobile');
});

// 2026-11-17 user decision: the console shows the number masked and searches by it; the number is kept encrypted from this date.
test('with DATA_ENCRYPTION_KEY the number is kept encrypted (not plain), the member list masks it, a 010 search finds the member',async()=>{
 const {adminMembers}=require('../dist/src/platform/admin-console'),{PaymentProvider}=require('../dist/src/platform/payment-provider');
 const keyed=new ConfigService({OCTOMO_API_KEY:'test-octomo-key',LOCAL_AUTH_SECRET:'phone-test-secret',DATA_ENCRYPTION_KEY:'a'.repeat(64)}),p2=new PhoneVerificationService(new PlatformService(db,undefined,keyed),keyed,limiter);p2.fetcher=async(u,init)=>{const body=JSON.parse(init.body);return{ok:true,json:async()=>({exists:sms.has(body.mobileNum+':'+body.text)})};};
 const s=await p2.start(b,{phone:'010-2222-3434'});sms.add('01022223434:'+s.code);await p2.confirm(b,{phone:'01022223434'});
 const row=await db.memberPhone.findUniqueOrThrow({where:{member_id:b}});assert.equal(row.last_four,'3434');assert.ok(row.phone_encrypted&&!row.phone_encrypted.includes('01022223434'),'stored encrypted, never plain');
 assert.equal(new PaymentProvider(keyed).decrypt(row.phone_encrypted),'01022223434');
 const hash=x=>p2.hash(x),found=await adminMembers(db,{search:'010-2222-3434'},hash);assert.deepEqual(found.items.map(m=>m.id),[b]);assert.deepEqual(found.items[0].phone,{masked:'010-****-3434',kept:true});
 assert.equal(JSON.stringify(found).includes('01022223434'),false,'the list never carries the full number');
 assert.equal((await adminMembers(db,{search:'010-2222-0000'},hash)).items.some(m=>m.id===b),false,'another number does not match');
 await db.memberPhone.upsert({where:{member_id:a},create:{member_id:a,phone_hash:hash('01055556666')},update:{phone_encrypted:null,last_four:null}});
 const older=(await adminMembers(db,{search:a},hash)).items.find(m=>m.id===a);assert.deepEqual(older.phone,{masked:null,kept:false},'a number checked before 2026-11-17 shows as not kept');
});
