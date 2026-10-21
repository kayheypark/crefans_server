import { Injectable, BadRequestException, UnauthorizedException, HttpException, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Member } from "@prisma/client";
import { randomUUID, randomBytes, randomInt, createHmac } from "crypto";
import { JwtService } from "@nestjs/jwt";
import { PrismaService } from "../../prisma/prisma.service";
import { MemberMailService } from "./member-mail.service";
import { digest, normalizeEmail, hashPassword, verifyPassword } from "./credentials";
import { SignUpDto } from "../dto/auth.dto";
import { CognitoException } from "../exceptions/cognito.exception";

@Injectable()
export class LocalMemberService implements OnModuleInit {
  readonly mode: "cognito" | "migration" | "local";
  private secret: string;
  constructor(private prisma: PrismaService, private config: ConfigService, private mail: MemberMailService) {
    const mode = config.get<string>("AUTH_PROVIDER") || "cognito";
    if (!["cognito", "migration", "local"].includes(mode)) throw new Error("Invalid AUTH_PROVIDER");
    this.mode = mode as typeof this.mode;
    this.secret = config.get<string>("LOCAL_AUTH_SECRET");
    if (this.mode !== "cognito" && (!this.secret || this.secret.length < 64))
      throw new Error("LOCAL_AUTH_SECRET must contain at least 64 random characters");

  }
  async onModuleInit() {
    if (this.mode === "local" && await this.prisma.member.count({ where: { enabled: true, cognito_username: { not: null }, password_hash: null } }))
      throw new Error("Unmigrated Cognito members remain. Complete migration before local-only mode.");
  }
  get enabled() { return this.mode !== "cognito"; }
  usesLocalToken(token: string) {
    if (this.mode === "local") return true;
    return this.mode === "migration" && /^(la|lr)\./.test(token || "");
  }
  async limit(key: string, maximum = 10, seconds = 600) {
    const window = Math.floor(Date.now() / (seconds * 1000));
    const id = digest(`${key}:${window}`);
    const expires = new Date((window + 1) * seconds * 1000);
    // MySQL-native upsert + row lock avoids Prisma's concurrent create race.
    const bucket = await this.prisma.$transaction(async tx => {
      await tx.$executeRaw`INSERT INTO auth_rate_buckets (id, count, expires_at)
        VALUES (${id}, 1, ${expires}) ON DUPLICATE KEY UPDATE count = count + 1`;
      return tx.authRateBucket.findUniqueOrThrow({ where: { id } });
    });
    if (bucket.count > maximum) throw new HttpException("잠시 후 다시 시도해주세요.", 429);
  }
  async byEmail(email: string) {
    if (typeof email !== "string" || email.length > 191) throw new BadRequestException("이메일을 확인해주세요.");
    return this.prisma.member.findUnique({ where: { email: normalizeEmail(email) } });
  }
  async byIdentity(identity: string) {
    return this.prisma.member.findFirst({ where: { OR: [{ id: identity }, { cognito_username: identity }] } });
  }
  async signUp(dto: SignUpDto) {
    await this.limit(`signup:${normalizeEmail(dto.email)}`, 3);
    if (await this.byEmail(dto.email)) throw new CognitoException("이미 존재하는 사용자입니다.", "UsernameExistsException");
    let member: Member;
    try {
      member = await this.prisma.member.create({ data: {
        id: randomUUID(), email: normalizeEmail(dto.email), password_hash: await hashPassword(dto.password),
        name: dto.name, nickname: dto.nickname, phone_number: dto.phoneNumber,
        preferred_username: randomBytes(7).toString("hex"),
      } });
    } catch (error) {
      if (error.code === "P2002") throw new CognitoException("이미 존재하는 사용자입니다.", "UsernameExistsException");
      throw error;
    }
    // Account remains recoverable via resend if SMTP fails; never roll back a delivered code.
    await this.issueCode(member, "verify");
    return { userSub: member.id, username: member.email, message: "회원가입이 완료되었습니다. 이메일 인증을 진행해주세요." };
  }
  async signIn(email: string, password: string, legacyLogin: () => Promise<any>, legacyInfo: (token: string) => Promise<any>, legacyUser: (sub: string) => Promise<any>) {
    await this.limit(`signin:${normalizeEmail(email)}`);
    const member = await this.byEmail(email);
    if (!member || !member.enabled) throw new UnauthorizedException("이메일 또는 비밀번호를 확인해주세요.");
    if (!member.password_hash) {
      if (this.mode !== "migration" || !member.cognito_username) throw new UnauthorizedException("비밀번호 재설정이 필요합니다.");
      const result = await legacyLogin();
      if (!result?.accessToken) throw new UnauthorizedException("추가 인증이 필요한 회원입니다.");
      const info = await legacyInfo(result.accessToken);
      const source = await legacyUser(member.id);
      if (info.attributes.sub !== member.id || !info.attributes.email_verified || !source?.Enabled || source.UserMFASettingList?.length || source.MFAOptions?.length)
        throw new UnauthorizedException("회원 전환 조건을 확인해주세요.");
      // Compare-and-set: concurrent login/reset must not overwrite a newer credential.
      await this.prisma.member.updateMany({ where: { id: member.id, password_hash: null, enabled: true }, data: {
        password_hash: await hashPassword(password), migrated_at: new Date(), email_verified: true, status: "CONFIRMED",
      } });
    }
    const current = await this.byIdentity(member.id);
    if (!current?.enabled || !await verifyPassword(password, current.password_hash)) throw new UnauthorizedException("이메일 또는 비밀번호를 확인해주세요.");
    if (!current.email_verified) throw new CognitoException("이메일 인증이 필요합니다.", "UserNotConfirmedException");
    return this.createSession(current);
  }
  private tokens() {
    return { accessToken: `la.${randomBytes(32).toString("base64url")}`, refreshToken: `lr.${randomBytes(32).toString("base64url")}` };
  }
  private idToken(member: Member) {
    return new JwtService().sign({ sub: member.id, email: member.email, email_verified: member.email_verified,
      name: member.name, nickname: member.nickname, preferred_username: member.preferred_username,
      "cognito:username": member.cognito_username || member.id, token_use: "id",
    }, { secret: this.secret, algorithm: "HS256", issuer: "crefans-local", audience: "crefans-web", expiresIn: "1h" });
  }
  private async createSession(member: Member) {
    const tokens = this.tokens();
    await this.prisma.memberSession.create({ data: {
      member_id: member.id, access_hash: digest(tokens.accessToken), refresh_hash: digest(tokens.refreshToken),
      access_until: new Date(Date.now() + 3600000), expires_at: new Date(Date.now() + 30 * 86400000),
    } });
    return { ...tokens, idToken: this.idToken(member), message: "로그인이 완료되었습니다." };
  }
  async validateToken(token: string) {
    if (!/^la\.[A-Za-z0-9_-]{43}$/.test(token || "")) throw new UnauthorizedException();
    const session = await this.prisma.memberSession.findUnique({ where: { access_hash: digest(token) }, include: { member: true } });
    if (!session || session.access_until <= new Date() || session.expires_at <= new Date() || !session.member.enabled || !session.member.email_verified)
      throw new UnauthorizedException();
    return { sub: session.member.id, userSub: session.member.id, email: session.member.email,
      name: session.member.name, username: session.member.cognito_username || session.member.id, accessToken: token };
  }
  async signOut(token: string) {
    // Expired access tokens still identify sessions for explicit revocation.
    const session = await this.prisma.memberSession.findUnique({ where: { access_hash: digest(token) } });
    if (session) await this.prisma.memberSession.deleteMany({ where: { member_id: session.member_id } });
    return { message: "로그아웃이 완료되었습니다." };
  }
  async refreshToken(token: string) {
    if (!/^lr\.[A-Za-z0-9_-]{43}$/.test(token || "")) throw new UnauthorizedException();
    const session = await this.prisma.memberSession.findUnique({ where: { refresh_hash: digest(token) }, include: { member: true } });
    if (!session || session.expires_at <= new Date() || !session.member.enabled || !session.member.email_verified) throw new UnauthorizedException();
    const tokens = this.tokens();
    const updated = await this.prisma.memberSession.updateMany({ where: { id: session.id, refresh_hash: digest(token), expires_at: { gt: new Date() } }, data: {
      access_hash: digest(tokens.accessToken), refresh_hash: digest(tokens.refreshToken), access_until: new Date(Date.now() + 3600000),
    } });
    if (updated.count !== 1) throw new UnauthorizedException();
    return { ...tokens, idToken: this.idToken(session.member), message: "토큰이 갱신되었습니다." };
  }
  async info(token: string) {
    const identity = await this.validateToken(token);
    const member = await this.byIdentity(identity.sub);
    return { username: member.preferred_username, attributes: {
      sub: member.id, email: member.email, email_verified: member.email_verified, name: member.name,
      nickname: member.nickname, preferred_username: member.preferred_username, picture: member.picture || "", phone_number: member.phone_number,
    }, points: 0, isCreator: false, profile: null };
  }
  async awsShape(member: Member) {
    if (!member) return null;
    const attributes = { sub: member.id, email: member.email, email_verified: String(member.email_verified), name: member.name,
      nickname: member.nickname, preferred_username: member.preferred_username, picture: member.picture || "", phone_number: member.phone_number,
      "custom:is_creator": await this.prisma.creator.findUnique({ where: { user_id: member.id } }) ? "1" : "0" };
    const values = Object.entries(attributes).map(([Name, Value]) => ({ Name, Value }));
    return { Username: member.cognito_username || member.id, Attributes: values, UserAttributes: values,
      Enabled: member.enabled, UserStatus: member.status as any, UserCreateDate: member.created_at, UserLastModifiedDate: member.updated_at,
      $metadata: {},
    };
  }
  async getUserBySub(sub: string) { return this.awsShape(await this.byIdentity(sub)); }
  async getUserByHandle(handle: string) {
    return this.awsShape(await this.prisma.member.findUnique({ where: { preferred_username: handle.replace("@", "") } }));
  }
  async updateUserAttribute(identity: string, attribute: string, value: string) {
    const member = await this.byIdentity(identity);
    if (!member) throw new BadRequestException("회원이 없습니다.");
    if (!["nickname", "preferred_username", "name", "picture", "phone_number"].includes(attribute))
      throw new BadRequestException("지원하지 않는 회원 속성입니다.");
    await this.prisma.member.update({ where: { id: member.id }, data: { [attribute]: value } });
    return { message: `${attribute} 정보가 성공적으로 업데이트되었습니다.` };
  }
  async checkEmailExists(email: string) {
    const exists = !!await this.byEmail(email);
    return { exists, message: exists ? "이미 사용 중인 이메일입니다." : "사용 가능한 이메일입니다." };
  }
  async checkNicknameAvailability(nickname: string) { return !await this.prisma.member.findFirst({ where: { nickname } }); }
  async listUsers(limit: number, cursor?: string, query?: string) {
    const rows = await this.prisma.member.findMany({
      take: Math.max(1, Math.min(Number(limit) || 20, 60)) + 1, orderBy: { id: "asc" },
      where: { ...(cursor ? { id: { gt: cursor } } : {}), ...(query ? { OR: [{ email: { startsWith: query } }, { nickname: { startsWith: query } }] } : {}) },
    });
    const more = rows.length > Math.max(1, Math.min(Number(limit) || 20, 60));
    if (more) rows.pop();
    return { Users: await Promise.all(rows.map(row => this.awsShape(row))), PaginationToken: more ? rows[rows.length - 1].id : undefined };
  }
  private codeDigest(member: string, purpose: string, code: string) {
    return createHmac("sha256", this.secret).update(`${member}:${purpose}:${code}`).digest("hex");
  }
  private async issueCode(member: Member, purpose: "verify" | "reset") {
    // Resend cooldown: one code per member/purpose every 3 minutes (product decision 2026-09-13); the code itself stays valid 10 minutes.
    const code = String(randomInt(0, 1000000)).padStart(6, "0");
    const data = { digest: this.codeDigest(member.id, purpose, code), attempts: 0, expires_at: new Date(Date.now() + 600000), sent_at: new Date() };
    await this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM members WHERE id=${member.id} FOR UPDATE`;
      const prior = await tx.memberChallenge.findUnique({ where: { member_id_purpose: { member_id: member.id, purpose } } });
      if (prior && Date.now() - prior.sent_at.getTime() < 180000)
        throw new HttpException("3분 후 인증 코드를 다시 요청해주세요.", 429);
      await tx.memberChallenge.upsert({ where: { member_id_purpose: { member_id: member.id, purpose } },
        create: { member_id: member.id, purpose, ...data }, update: data });
    });
    try { await this.mail.sendCode(member.email, code, purpose); }
    catch { throw new HttpException("이메일 발송에 실패했습니다. 잠시 후 인증 코드를 다시 요청해주세요.", 503); }
  }
  async resendConfirmationCode({ email }: { email: string }) {
    const member = await this.byEmail(email);
    if (member?.enabled && !member.email_verified) await this.issueCode(member, "verify");
    return { message: "인증이 필요한 회원이면 인증 코드가 전송됩니다." };
  }
  private async consumeCode(member: Member, purpose: string, code: string, passwordHash?: string) {
    if (typeof code !== "string" || !/^\d{6}$/.test(code)) throw new BadRequestException("인증 코드를 확인해주세요.");
    // Increment outside the transaction: failed attempts must not roll back.
    const attempted = await this.prisma.memberChallenge.updateMany({ where: { member_id: member.id, purpose, attempts: { lt: 5 }, expires_at: { gt: new Date() } }, data: { attempts: { increment: 1 } } });
    if (!attempted.count) throw new BadRequestException("인증 코드가 만료되었거나 시도 횟수를 초과했습니다.");
    await this.prisma.$transaction(async tx => {
      const consumed = await tx.memberChallenge.deleteMany({ where: { member_id: member.id, purpose, digest: this.codeDigest(member.id, purpose, code), expires_at: { gt: new Date() }, attempts: { lte: 5 } } });
      if (!consumed.count) throw new BadRequestException("인증 코드를 확인해주세요.");
      await tx.member.update({ where: { id: member.id }, data: { email_verified: true, status: "CONFIRMED",
        ...(passwordHash ? { password_hash: passwordHash, migrated_at: member.migrated_at || new Date() } : {}) } });
      if (passwordHash) await tx.memberSession.deleteMany({ where: { member_id: member.id } });
    });
  }
  async confirmSignUp({ email, confirmationCode }: { email: string; confirmationCode: string }) {
    const member = await this.byEmail(email);
    if (!member?.enabled || member.cognito_username) throw new BadRequestException("인증 요청을 확인해주세요.");
    await this.consumeCode(member, "verify", confirmationCode);
    return { message: "이메일 인증이 완료되었습니다." };
  }
  async forgotPassword(email: string) {
    await this.limit(`reset:${normalizeEmail(email)}`, 3);
    const member = await this.byEmail(email);
    // Imported passwords must first be proved against Cognito; never bypass MFA/status with email.
    if (member?.enabled && member.email_verified && member.password_hash) await this.issueCode(member, "reset");
    return { message: "재설정 가능한 회원이면 인증 코드가 전송됩니다." };
  }
  async resetPassword(email: string, code: string, password: string) {
    await this.limit(`reset-confirm:${normalizeEmail(email)}`, 5);
    const member = await this.byEmail(email);
    if (!member?.enabled || !member.password_hash) throw new BadRequestException("재설정 요청을 확인해주세요.");
    await this.consumeCode(member, "reset", code, await hashPassword(password));
    return { message: "비밀번호가 변경되었습니다. 다시 로그인해주세요." };
  }
}
