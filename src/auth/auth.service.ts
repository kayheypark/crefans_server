import { Injectable } from "@nestjs/common";
import {
  SignUpDto,
  SignInDto,
  SignOutDto,
  ConfirmSignUpDto,
  ResendConfirmationCodeDto,
  ConfirmEmailVerificationDto,
} from "./dto/auth.dto";
import { CognitoException } from "./exceptions/cognito.exception";
import { TokenService } from "../token/token.service";
import { PrismaService } from "../prisma/prisma.service";
import { CognitoService } from "./cognito.service";
import { LoggerService } from "../common/logger/logger.service";
import { Decimal } from "@prisma/client/runtime/library";

@Injectable()
export class AuthService {
  constructor(
    private cognitoService: CognitoService,
    private tokenService: TokenService,
    private prisma: PrismaService,
    private logger: LoggerService
  ) {}

  async signUp(signUpDto: SignUpDto) {
    try {
      this.logger.logAuthEvent("SignUp started", undefined, {
        email: signUpDto.email,
      });

      // Cognito 회원가입
      console.info("signUpDto!!!!!!!!!111", signUpDto);
      const cognitoResult = await this.cognitoService.signUp(signUpDto);

      // 직접 지갑 생성
      await this.createWallet(cognitoResult.userSub);

      this.logger.logAuthEvent("SignUp completed", cognitoResult.userSub, {
        email: signUpDto.email,
        userSub: cognitoResult.userSub,
      });

      return cognitoResult;
    } catch (error) {
      this.logger.error("SignUp failed in AuthService", error.stack, {
        service: "AuthService",
        method: "signUp",
        email: signUpDto.email,
      });

      if (error.code) {
        throw new CognitoException(error.message, error.code);
      }
      throw error;
    }
  }

  async signIn(signInDto: SignInDto) {
    try {
      this.logger.logAuthEvent("SignIn started", undefined, {
        email: signInDto.email,
      });

      const result = await this.cognitoService.signIn(signInDto);

      this.logger.logAuthEvent("SignIn completed", undefined, {
        email: signInDto.email,
      });

      return result;
    } catch (error) {
      this.logger.error("SignIn failed in AuthService", error.stack, {
        service: "AuthService",
        method: "signIn",
        email: signInDto.email,
      });

      if (error.code) {
        throw new CognitoException(error.message, error.code);
      }
      throw error;
    }
  }

  async signOut(signOutDto: SignOutDto) {
    try {
      this.logger.logAuthEvent("SignOut started", undefined, {
        accessToken: signOutDto.accessToken.substring(0, 10) + "...",
      });

      const result = await this.cognitoService.signOut(signOutDto);

      this.logger.logAuthEvent("SignOut completed", undefined, {
        accessToken: signOutDto.accessToken.substring(0, 10) + "...",
      });

      return result;
    } catch (error) {
      this.logger.error("SignOut failed in AuthService", error.stack, {
        service: "AuthService",
        method: "signOut",
      });

      if (error.code) {
        throw new CognitoException(error.message, error.code);
      }
      throw error;
    }
  }

  async confirmSignUp(confirmSignUpDto: ConfirmSignUpDto) {
    try {
      this.logger.logAuthEvent("ConfirmSignUp started", undefined, {
        email: confirmSignUpDto.email,
      });

      const result = await this.cognitoService.confirmSignUp(confirmSignUpDto);

      this.logger.logAuthEvent("ConfirmSignUp completed", undefined, {
        email: confirmSignUpDto.email,
      });

      return result;
    } catch (error) {
      this.logger.error("ConfirmSignUp failed in AuthService", error.stack, {
        service: "AuthService",
        method: "confirmSignUp",
        email: confirmSignUpDto.email,
      });

      if (error.code) {
        throw new CognitoException(error.message, error.code);
      }
      throw error;
    }
  }

  async getUserInfo(accessToken: string) {
    try {
      this.logger.logAuthEvent("GetUserInfo started", undefined, {
        accessToken: accessToken.substring(0, 10) + "...",
      });

      const userInfo = await this.cognitoService.getUserInfo(accessToken);

      this.logger.logAuthEvent(
        "GetUserInfo completed",
        userInfo.attributes.sub,
        {
          email: userInfo.attributes.email,
        }
      );

      return userInfo;
    } catch (error) {
      this.logger.error("GetUserInfo failed in AuthService", error.stack, {
        service: "AuthService",
        method: "getUserInfo",
      });

      if (error.code) {
        throw new CognitoException(error.message, error.code);
      }
      throw error;
    }
  }

  async checkEmailExists(email: string) {
    try {
      this.logger.logAuthEvent("CheckEmailExists started", undefined, {
        email,
      });

      const result = await this.cognitoService.checkEmailExists(email);

      this.logger.logAuthEvent("CheckEmailExists completed", undefined, {
        email,
        exists: result.exists,
      });

      return result;
    } catch (error) {
      this.logger.error("CheckEmailExists failed in AuthService", error.stack, {
        service: "AuthService",
        method: "checkEmailExists",
        email,
      });

      if (error.code) {
        throw new CognitoException(error.message, error.code);
      }
      throw error;
    }
  }

  async resendConfirmationCode(
    resendConfirmationCodeDto: ResendConfirmationCodeDto
  ) {
    const { email } = resendConfirmationCodeDto;
    try {
      this.logger.logAuthEvent("ResendConfirmationCode started", undefined, {
        email,
      });

      const result = await this.cognitoService.resendConfirmationCode({
        email,
      });

      this.logger.logAuthEvent("ResendConfirmationCode completed", undefined, {
        email,
      });

      return result;
    } catch (error) {
      this.logger.error(
        "ResendConfirmationCode failed in AuthService",
        error.stack,
        {
          service: "AuthService",
          method: "resendConfirmationCode",
          email,
        }
      );

      if (error.code) {
        throw new CognitoException(error.message, error.code);
      }
      throw error;
    }
  }

  async confirmEmailVerification(
    confirmEmailVerificationDto: ConfirmEmailVerificationDto
  ) {
    const { email, code } = confirmEmailVerificationDto;
    try {
      this.logger.logAuthEvent("ConfirmEmailVerification started", undefined, {
        email,
      });

      const result = await this.cognitoService.confirmEmailVerification({
        email,
        code,
      });

      this.logger.logAuthEvent(
        "ConfirmEmailVerification completed",
        undefined,
        {
          email,
        }
      );

      return result;
    } catch (error) {
      this.logger.error(
        "ConfirmEmailVerification failed in AuthService",
        error.stack,
        {
          service: "AuthService",
          method: "confirmEmailVerification",
          email,
        }
      );

      if (error.code) {
        throw new CognitoException(error.message, error.code);
      }
      throw error;
    }
  }

  private async createWallet(userSub: string) {
    try {
      // 기본 토큰 타입(콩) 조회 - symbol이 'KNG'인 토큰 타입을 찾습니다
      const defaultTokenType = await this.prisma.tokenType.findFirst({
        where: {
          symbol: "KNG",
        },
      });

      if (!defaultTokenType) {
        this.logger.error("Default token type (KNG) not found", undefined, {
          service: "AuthService",
          method: "createWallet",
          userSub,
        });
        return;
      }

      // 이미 해당 토큰 타입의 지갑이 있는지 확인
      const existingWallet = await this.prisma.wallet.findFirst({
        where: {
          token_type_id: defaultTokenType.id,
          ownerships: {
            some: {
              owner_id: userSub,
              ended_at: null,
            },
          },
        },
      });

      if (existingWallet) {
        this.logger.warn(
          `Wallet already exists for user: ${userSub}, tokenType: ${defaultTokenType.id}`
        );
        return;
      }

      // 새 지갑 생성
      const { v4: uuidv4 } = await import("uuid");
      const walletAddress = uuidv4();

      await this.prisma.$transaction(async (tx) => {
        // 지갑 생성
        const wallet = await tx.wallet.create({
          data: {
            address: walletAddress,
            token_type_id: defaultTokenType.id,
            amount: 0,
          },
        });

        // 지갑 소유권 설정
        await tx.walletOwnership.create({
          data: {
            wallet_id: wallet.id,
            owner_id: userSub,
          },
        });
      });

      this.logger.log(
        `✅ Wallet created successfully for user: ${userSub}, tokenType: ${defaultTokenType.symbol}, address: ${walletAddress}`
      );
    } catch (error) {
      this.logger.error("Failed to create wallet", error.stack, {
        service: "AuthService",
        method: "createWallet",
        userSub,
      });
      // 지갑 생성 실패는 회원가입을 차단하지 않도록 함
    }
  }
}
