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
import { QueueStatus } from "@prisma/client";
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

      // 지갑 생성 큐에 추가
      await this.addToWalletCreationQueue(cognitoResult.userSub);

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

  async confirmEmailVerification(confirmEmailVerificationDto: ConfirmEmailVerificationDto) {
    const { email, code } = confirmEmailVerificationDto;
    try {
      this.logger.logAuthEvent("ConfirmEmailVerification started", undefined, {
        email,
      });

      const result = await this.cognitoService.confirmEmailVerification({
        email,
        code,
      });

      this.logger.logAuthEvent("ConfirmEmailVerification completed", undefined, {
        email,
      });

      return result;
    } catch (error) {
      this.logger.error("ConfirmEmailVerification failed in AuthService", error.stack, {
        service: "AuthService",
        method: "confirmEmailVerification",
        email,
      });

      if (error.code) {
        throw new CognitoException(error.message, error.code);
      }
      throw error;
    }
  }

  private async addToWalletCreationQueue(userSub: string) {
    // TODO: 지갑 생성 큐 기능 구현
  }
}
