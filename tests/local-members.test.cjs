require('ts-node/register/transpile-only');
require('reflect-metadata');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { ConfigService } = require('@nestjs/config');
const { PrismaClient } = require('@prisma/client');
const { LocalMemberService } = require('../src/auth/local/local-member.service');
const { CognitoService } = require('../src/auth/cognito.service');
const { AwsCognitoService } = require('../src/auth/aws-cognito.service');
const { importMembers, prepareMembers } = require('../src/auth/local/import-members');
const { hashPassword, verifyPassword } = require('../src/auth/local/credentials');
const { AuthGuard } = require('../src/common/guards/auth.guard');
const { OptionalAuthGuard } = require('../src/common/guards/optional-auth.guard');
const { AdminAuthGuard } = require('../src/admin/guards/admin-auth.guard');

const url = process.env.AUTH_TEST_DATABASE_URL;
if (!url || new URL(url).hostname !== '127.0.0.1' || !new URL(url).pathname.endsWith('_test'))
  throw new Error('Tests require explicit loopback *_test database');
const db = new PrismaClient({ datasources: { db: { url } } });
const messages = [];
const mail = { sendCode: async (email, code, purpose) => { messages.push({ email, code, purpose }); } };
const config = mode => new ConfigService({ AUTH_PROVIDER: mode, LOCAL_AUTH_SECRET: 'x'.repeat(64), MEMBER_MAIL_PROVIDER: 'smtp', SMTP_HOST: 'localhost', SMTP_FROM: 'test@localhost' });
const local = new LocalMemberService(db, config('local'), mail);
const migration = new LocalMemberService(db, config('migration'), mail);
const logger = new Proxy({}, { get: () => () => {} });
const facade = new CognitoService(config('local'), logger, local);
const dto = (email = 'local@example.test') => ({ email, password: 'Strong password 123!', name: '테스트', nickname: '테스트', phoneNumber: '+821012345678' });
const legacy = (sub = 'original-sub', email = 'legacy@example.test') => ({ Username: sub, Enabled: true, UserStatus: 'CONFIRMED', UserMFASettingList: [],
  UserAttributes: Object.entries({ sub, email, email_verified: 'true', name: '기존 회원', nickname: '기존', preferred_username: sub }).map(([Name, Value]) => ({ Name, Value })) });
const snapshot = users => ({ userPoolId: 'test-pool', complete: true, users });
async function clean() { await db.memberChallenge.deleteMany(); await db.memberSession.deleteMany(); await db.member.deleteMany(); await db.authRateBucket.deleteMany(); messages.length = 0; }
before(clean);
after(async () => { await clean(); await db.$disconnect(); });

test('default mode invokes existing AWS methods without touching local tables', async () => {
  const noDb = new Proxy({}, { get: () => { throw Error('unexpected local DB access'); } });
  const service = new LocalMemberService(noDb, new ConfigService(), mail);
  assert.equal(service.mode, 'cognito');
  await service.onModuleInit();
  const legacyFacade = new CognitoService(new ConfigService(), logger, service);
  for (const [method, args] of [['signIn', [dto()]], ['signUp', [dto()]], ['getUserInfo', ['aws-token']], ['refreshToken', ['aws-refresh', 'name']], ['signOut', [{ accessToken: 'aws-token' }]], ['getUserBySub', ['sub']], ['confirmSignUp', [{ email:'a', confirmationCode:'123456' }]]]) {
    const original = AwsCognitoService.prototype[method];
    const sentinel = { legacy: method };
    AwsCognitoService.prototype[method] = async (...actual) => { assert.deepEqual(actual, args); return sentinel; };
    try { assert.equal(await legacyFacade[method](...args), sentinel); }
    finally { AwsCognitoService.prototype[method] = original; }
  }
});
test('invalid mode and missing signing configuration fail closed; mail configuration can be deferred', () => {
  assert.throws(() => new LocalMemberService(db, new ConfigService({ AUTH_PROVIDER: 'typo' }), mail));
  assert.throws(() => new LocalMemberService(db, new ConfigService({ AUTH_PROVIDER: 'local' }), mail));
  assert.doesNotThrow(() => new LocalMemberService(db, new ConfigService({ AUTH_PROVIDER:'local', LOCAL_AUTH_SECRET:'x'.repeat(64) }), mail));
});
test('password hashes are salted, verifiable, and reject malformed values', async () => {
  const a = await hashPassword(dto().password), b = await hashPassword(dto().password);
  assert.notEqual(a, b); assert.equal(await verifyPassword(dto().password, a), true);
  assert.equal(await verifyPassword('incorrect', a), false);
  assert.equal(await verifyPassword('password', 'scrypt-v1$bad$bad'), false);
});
test('signup, email confirmation, guards, token rotation, global logout', async () => {
  const signup = await facade.signUp(dto());
  assert.ok(signup.userSub);
  await assert.rejects(() => facade.signIn(dto()));
  const code = messages.at(-1).code;
  await facade.confirmSignUp({ email: dto().email, confirmationCode: code });
  await assert.rejects(() => facade.confirmSignUp({ email: dto().email, confirmationCode: code }));
  const tokens = await facade.signIn(dto());
  const info = await facade.getUserInfo(tokens.accessToken);
  assert.equal(info.attributes.sub, signup.userSub);
  assert.equal(JSON.parse(Buffer.from(tokens.idToken.split('.')[1], 'base64url')).sub, signup.userSub);
  await assert.rejects(() => local.validateToken(tokens.idToken));
  const request = { cookies: { access_token: tokens.accessToken }, headers: {} };
  const context = { switchToHttp: () => ({ getRequest: () => request }) };
  assert.equal(await new AuthGuard(config('local'), facade, logger).canActivate(context), true);
  assert.equal(request.user.sub, signup.userSub);
  assert.equal(await new OptionalAuthGuard(config('local'), facade, logger).canActivate(context), true);
  await assert.rejects(() => new AdminAuthGuard(config('local'), facade, logger, { getAdminByUserSub: async () => null }).canActivate(context));
  assert.equal(await new AdminAuthGuard(config('local'), facade, logger, { getAdminByUserSub: async () => ({ is_active: true }) }).canActivate(context), true);
  const results = await Promise.allSettled([local.refreshToken(tokens.refreshToken), local.refreshToken(tokens.refreshToken)]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  const renewed = results.find(r => r.status === 'fulfilled').value;
  await assert.rejects(() => local.validateToken(tokens.accessToken));
  await local.signOut(renewed.accessToken);
  await assert.rejects(() => local.refreshToken(renewed.refreshToken));
  await assert.rejects(() => local.validateToken(renewed.accessToken));
});
test('verification attempt limit, cooldown, SMTP failure recoverability', async () => {
  const sign = await local.signUp(dto('codes@example.test'));
  const code = messages.at(-1).code;
  const wrong = code === '000000' ? '000001' : '000000';
  for (let i=0; i<5; i++) await assert.rejects(() => local.confirmSignUp({ email: 'codes@example.test', confirmationCode: wrong }));
  await assert.rejects(() => local.confirmSignUp({ email: 'codes@example.test', confirmationCode: code }));
  await assert.rejects(() => local.resendConfirmationCode({ email:'codes@example.test' }));
  const failing = new LocalMemberService(db, config('local'), { sendCode: async () => { throw Error('SMTP fail'); } });
  await assert.rejects(() => failing.signUp(dto('smtp@example.test')));
  assert.ok(await local.byEmail('smtp@example.test'));
  assert.ok(await db.memberChallenge.findFirst({ where: { member_id: sign.userSub } }));
});
test('reset invalidates all existing sessions and cannot be replayed', async () => {
  const tokens = await facade.signIn(dto());
  await local.forgotPassword(dto().email);
  const code = messages.at(-1).code;
  await local.resetPassword(dto().email, code, 'Replacement password 456!');
  await assert.rejects(() => local.validateToken(tokens.accessToken));
  await assert.rejects(() => local.refreshToken(tokens.refreshToken));
  await assert.rejects(() => local.resetPassword(dto().email, code, dto().password));
  await assert.rejects(() => facade.signIn(dto()));
});
test('import dry-run, ID preservation, collision atomicity and idempotency', async () => {
  const data = snapshot([legacy()]);
  const dry = await importMembers(db, data, 'test-pool');
  assert.equal(dry.created, 1); assert.equal(await local.byIdentity('original-sub'), null);
  await db.userProfile.upsert({ where: { user_id:'original-sub' }, create:{ user_id:'original-sub', bio:'preserve me' }, update:{} });
  await importMembers(db, data, 'test-pool', true);
  assert.equal((await local.byIdentity('original-sub')).password_hash, null);
  assert.equal((await db.userProfile.findUnique({ where:{ user_id:'original-sub' } })).bio, 'preserve me');
  assert.equal((await importMembers(db, data, 'test-pool', true)).unchanged, 1);
  await assert.rejects(() => importMembers(db, snapshot([legacy('new-sub', 'new@example.test'), legacy('collision', 'legacy@example.test')]), 'test-pool', true));
  assert.equal(await local.byIdentity('new-sub'), null);
  assert.throws(() => prepareMembers(snapshot([legacy(), legacy()]), 'test-pool'));
  assert.throws(() => prepareMembers(snapshot([{ ...legacy(), UserMFASettingList:['SOFTWARE_TOKEN_MFA'] }]), 'test-pool'));
  await assert.rejects(() => local.onModuleInit());
});
test('migration proves original sub/password and rejects MFA or wrong identity', async () => {
  const member = await local.byIdentity('original-sub');
  const login = async () => ({ accessToken:'cognito-verified' });
  await assert.rejects(() => migration.signIn(member.email, dto().password, login, async () => ({ attributes: { sub:'wrong', email_verified:true } }), async () => ({ Enabled:true })));
  assert.equal((await local.byIdentity(member.id)).password_hash, null);
  await assert.rejects(() => migration.signIn(member.email, dto().password, login, async () => ({ attributes:{ sub:member.id, email_verified:true } }), async () => ({ Enabled:true, UserMFASettingList:['SOFTWARE_TOKEN_MFA'] })));
  assert.equal((await local.byIdentity(member.id)).password_hash, null);
  const tokens = await migration.signIn(member.email, dto().password, login, async () => ({ attributes:{ sub:member.id, email_verified:true } }), async () => ({ Enabled:true }));
  assert.equal((await local.info(tokens.accessToken)).attributes.sub, member.id);
  await local.onModuleInit();
  const oldInfo = AwsCognitoService.prototype.getUserInfo;
  AwsCognitoService.prototype.getUserInfo = async () => ({ attributes: { sub:member.id } });
  try { await assert.rejects(() => new CognitoService(config('migration'), logger, migration).getUserInfo('old-aws-session')); }
  finally { AwsCognitoService.prototype.getUserInfo = oldInfo; }
});
test('disabled accounts, expired access, and rate limits are enforced', async () => {
  const tokens = await facade.signIn({ email:'legacy@example.test', password:dto().password });
  await db.member.update({ where:{ id:'original-sub' }, data:{ enabled:false } });
  await assert.rejects(() => local.validateToken(tokens.accessToken));
  await assert.rejects(() => local.refreshToken(tokens.refreshToken));
  for (let round = 0; round < 5; round++) {
    const results = await Promise.allSettled(Array.from({length:12}, () => local.limit(`test-concurrency-${round}`, 5)));
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 5);
  }
});

test('SMTP adapter sends verification codes to a loopback SMTP server', async () => {
  const net = require('node:net');
  const { MemberMailService } = require('../src/auth/local/member-mail.service');
  let received = '';
  const server = net.createServer(socket => {
    socket.write('220 localhost SMTP test\r\n');
    let buffer = '', data = false;
    socket.on('data', bytes => {
      buffer += bytes.toString();
      let end;
      while ((end = buffer.indexOf('\r\n')) >= 0) {
        const line = buffer.slice(0, end); buffer = buffer.slice(end + 2);
        if (data && line !== '.') { received += line + '\r\n'; continue; }
        if (data) { data = false; socket.write('250 accepted\r\n'); }
        else if (line.startsWith('EHLO')) socket.write('250 localhost\r\n');
        else if (line === 'DATA') { data = true; socket.write('354 send data\r\n'); }
        else if (line === 'QUIT') socket.end('221 bye\r\n');
        else socket.write('250 ok\r\n');
      }
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const sender = new MemberMailService(new ConfigService({ MEMBER_MAIL_PROVIDER:'smtp', SMTP_HOST:'127.0.0.1', SMTP_PORT:server.address().port, SMTP_FROM:'test@example.test' }));
    await sender.sendCode('recipient@example.test', '123456', 'verify');
    assert.match(received, /To: recipient@example.test/);
    assert.match(received, /Content-Type: text\/html/);
    assert.match(received, /Content-ID: <crefans-logo@crefans.com>/);
    const textPart = received.match(/Content-Type: text\/plain[^]*?Content-Transfer-Encoding: base64\r\n\r\n([A-Za-z0-9+/=\r\n]+)/);
    assert.ok(textPart, 'plain text alternative is present');
    assert.match(Buffer.from(textPart[1].replace(/\s/g, ''), 'base64').toString('utf8'), /123456/);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('expired challenges/sessions and concurrent code consumption fail safely', async () => {
  const signup = await local.signUp(dto('expiry@example.test'));
  const code = messages.at(-1).code;
  const confirmations = await Promise.allSettled([local.confirmSignUp({ email:'expiry@example.test', confirmationCode:code }), local.confirmSignUp({ email:'expiry@example.test', confirmationCode:code })]);
  assert.equal(confirmations.filter(r => r.status === 'fulfilled').length, 1);
  const tokens = await facade.signIn(dto('expiry@example.test'));
  await db.memberSession.updateMany({ where:{ member_id:signup.userSub }, data:{ access_until:new Date(0) } });
  await assert.rejects(() => local.validateToken(tokens.accessToken));
  await db.memberSession.updateMany({ where:{ member_id:signup.userSub }, data:{ expires_at:new Date(0) } });
  await assert.rejects(() => local.refreshToken(tokens.refreshToken));
  await local.signUp(dto('expired-code@example.test'));
  const expiredCode = messages.at(-1).code;
  await db.memberChallenge.updateMany({ where:{ member_id:(await local.byEmail('expired-code@example.test')).id }, data:{ expires_at:new Date(0) } });
  await assert.rejects(() => local.confirmSignUp({ email:'expired-code@example.test', confirmationCode:expiredCode }));
});

test('local signup creates its wallet once after confirmation, including the email confirmation alias', async () => {
  const { AuthService } = require('../src/auth/auth.service');
  const auth = new AuthService(facade, {}, db, logger);
  const wallets = [];
  auth.createWallet = async sub => { wallets.push(sub); };
  const signup = await auth.signUp(dto('wallet@example.test'));
  assert.equal(wallets.length, 0);
  await auth.confirmEmailVerification({ email:'wallet@example.test', code:messages.at(-1).code });
  assert.deepEqual(wallets, [signup.userSub]);
  await assert.rejects(() => auth.confirmEmailVerification({ email:'wallet@example.test', code:messages.at(-1).code }));
  assert.equal(wallets.length, 1);
});
