import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { LoggerService } from "../common/logger/logger.service";
import { AwsCognitoService } from "./aws-cognito.service";
import { LocalMemberService } from "./local/local-member.service";
import { SignUpDto, SignInDto, SignOutDto, ConfirmSignUpDto, ResendConfirmationCodeDto, ConfirmEmailVerificationDto } from "./dto/auth.dto";

// Compatibility facade: existing consumers and AWS implementation remain intact.
@Injectable()
export class CognitoService extends AwsCognitoService {
  constructor(config: ConfigService, logger: LoggerService, readonly local: LocalMemberService) { super(config, logger); }
  async signUp(dto: SignUpDto) {
    if (!this.local.enabled) return super.signUp(dto);
    if (this.local.mode === "migration" && (await super.checkEmailExists(dto.email)).exists)
      throw new UnauthorizedException("기존 회원입니다. 로그인해주세요.");
    return this.local.signUp(dto);
  }
  async signIn(dto: SignInDto) {
    if (!this.local.enabled) return super.signIn(dto);
    return this.local.signIn(dto.email, dto.password, () => super.signIn(dto), token => super.getUserInfo(token), sub => super.getUserBySub(sub));
  }
  async signOut(dto: SignOutDto) {
    return this.local.usesLocalToken(dto.accessToken) ? this.local.signOut(dto.accessToken) : super.signOut(dto);
  }
  async getUserInfo(token: string) {
    if (this.local.usesLocalToken(token)) return this.local.info(token);
    const info = await super.getUserInfo(token);
    if (this.local.mode === "migration") {
      const member = await this.local.byIdentity(info.attributes.sub);
      if (!member?.enabled || member.password_hash) throw new UnauthorizedException("다시 로그인해주세요.");
    }
    return info;
  }
  async refreshToken(token: string, username?: string) {
    if (this.local.usesLocalToken(token)) return this.local.refreshToken(token);
    const result = await super.refreshToken(token, username);
    if (this.local.enabled) await this.getUserInfo(result.accessToken);
    return result;
  }
  async confirmSignUp(dto: ConfirmSignUpDto) {
    if (!this.local.enabled) return super.confirmSignUp(dto);
    const member = await this.local.byEmail(dto.email);
    if (this.local.mode === "migration" && member?.cognito_username) return super.confirmSignUp(dto);
    return this.local.confirmSignUp(dto);
  }
  async confirmEmailVerification(dto: ConfirmEmailVerificationDto) {
    if (!this.local.enabled) return super.confirmEmailVerification(dto);
    return this.confirmSignUp({ email: dto.email, confirmationCode: dto.code });
  }
  async resendConfirmationCode(dto: ResendConfirmationCodeDto) {
    if (!this.local.enabled) return super.resendConfirmationCode(dto);
    const member = await this.local.byEmail(dto.email);
    if (this.local.mode === "migration" && member?.cognito_username && !member.password_hash) return super.resendConfirmationCode(dto);
    return this.local.resendConfirmationCode(dto);
  }
  async checkEmailExists(email: string) {
    if (!this.local.enabled) return super.checkEmailExists(email);
    const result = await this.local.checkEmailExists(email);
    return !result.exists && this.local.mode === "migration" ? super.checkEmailExists(email) : result;
  }
  async getUserBySub(sub: string): Promise<any> {
    return this.local.enabled ? this.local.getUserBySub(sub) : super.getUserBySub(sub);
  }
  async getUserByHandle(handle: string): Promise<any> {
    return this.local.enabled ? this.local.getUserByHandle(handle) : super.getUserByHandle(handle);
  }
  async checkNicknameAvailability(nickname: string) {
    return this.local.enabled ? this.local.checkNicknameAvailability(nickname) : super.checkNicknameAvailability(nickname);
  }
  async updateUserAttribute(sub: string, attribute: string, value: string) {
    if (!this.local.enabled) return super.updateUserAttribute(sub, attribute, value);
    return this.local.updateUserAttribute(sub, attribute, value);
  }
}
