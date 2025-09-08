import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  CognitoIdentityProviderClient,
  SignUpCommand,
  InitiateAuthCommand,
  GlobalSignOutCommand,
  ConfirmSignUpCommand,
  GetUserCommand,
  ListUsersCommand,
  ResendConfirmationCodeCommand,
  AdminDeleteUserCommand,
  AdminUpdateUserAttributesCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { LoggerService } from "../common/logger/logger.service";
import * as crypto from "crypto";
import {
  SignUpDto,
  SignInDto,
  SignOutDto,
  ConfirmSignUpDto,
  ResendConfirmationCodeDto,
  ConfirmEmailVerificationDto,
} from "./dto/auth.dto";

@Injectable()
export class CognitoService {
  private cognitoClient: CognitoIdentityProviderClient;
  private userPoolId: string;
  private clientId: string;
  private clientSecret: string;

  constructor(
    private configService: ConfigService,
    private logger: LoggerService
  ) {
    this.cognitoClient = new CognitoIdentityProviderClient({
      region: this.configService.get("aws.region"),
      credentials: {
        accessKeyId: this.configService.get("aws.accessKeyId"),
        secretAccessKey: this.configService.get("aws.secretAccessKey"),
      },
    });
    this.userPoolId = this.configService.get("aws.cognito.userPoolId");
    this.clientId = this.configService.get("aws.cognito.clientId");
    this.clientSecret = this.configService.get("aws.cognito.clientSecret");
  }

  private computeSecretHash(keyword: string): string {
    const message = keyword + this.clientId;
    const hmac = crypto.createHmac("sha256", this.clientSecret);
    hmac.update(message);
    return hmac.digest("base64");
  }

  async signUp(signUpDto: SignUpDto) {
    console.info("signUpDto!!!!!!!!!", signUpDto);
    const { email, password, name, nickname, phoneNumber } = signUpDto;
    const username = email;
    const timestamp = Date.now().toString();

    const command = new SignUpCommand({
      ClientId: this.clientId,
      Username: username,
      Password: password,
      SecretHash: this.computeSecretHash(username),
      UserAttributes: [
        {
          Name: "name",
          Value: name,
        },
        {
          Name: "email",
          Value: email,
        },
        {
          Name: "preferred_username",
          Value: timestamp,
        },
        {
          Name: "nickname",
          Value: nickname,
        },
        {
          Name: "phone_number",
          Value: phoneNumber,
        },
        {
          Name: "custom:is_creator",
          Value: "0",
        },
      ],
    });

    try {
      this.logger.logAuthEvent("SignUp initiated", undefined, {
        email,
        username,
      });
      const response = await this.cognitoClient.send(command);

      this.logger.logAuthEvent("SignUp successful", undefined, {
        email,
        username,
        userSub: response.UserSub,
      });

      return {
        userSub: response.UserSub,
        username,
        message: "회원가입이 완료되었습니다. 이메일 인증을 진행해주세요.",
      };
    } catch (error) {
      this.logger.error("SignUp failed", error.stack, {
        service: "CognitoService",
        method: "signUp",
        email,
      });
      throw this.handleCognitoError(error);
    }
  }

  async signIn(signInDto: SignInDto) {
    const { email, password } = signInDto;
    const secretHash = this.computeSecretHash(email);

    const command = new InitiateAuthCommand({
      AuthFlow: "USER_PASSWORD_AUTH",
      ClientId: this.clientId,
      AuthParameters: {
        USERNAME: email,
        PASSWORD: password,
        SECRET_HASH: secretHash,
      },
    });

    try {
      this.logger.logAuthEvent("SignIn initiated", undefined, {
        email,
      });
      const response = await this.cognitoClient.send(command);

      this.logger.logAuthEvent("SignIn successful", undefined, {
        email,
      });

      return {
        accessToken: response.AuthenticationResult.AccessToken,
        idToken: response.AuthenticationResult.IdToken,
        refreshToken: response.AuthenticationResult.RefreshToken,
        message: "로그인이 완료되었습니다.",
      };
    } catch (error) {
      this.logger.error("SignIn failed", error.stack, {
        service: "CognitoService",
        method: "signIn",
        email,
      });
      throw this.handleCognitoError(error);
    }
  }

  async signOut(signOutDto: SignOutDto) {
    const { accessToken } = signOutDto;
    const command = new GlobalSignOutCommand({
      AccessToken: accessToken,
    });

    try {
      this.logger.logAuthEvent("SignOut initiated", undefined, {
        accessToken: accessToken.substring(0, 10) + "...",
      });
      await this.cognitoClient.send(command);

      this.logger.logAuthEvent("SignOut successful", undefined, {
        accessToken: accessToken.substring(0, 10) + "...",
      });

      return {
        message: "로그아웃이 완료되었습니다.",
      };
    } catch (error) {
      this.logger.error("SignOut failed", error.stack, {
        service: "CognitoService",
        method: "signOut",
      });
      throw this.handleCognitoError(error);
    }
  }

  async confirmSignUp(confirmSignUpDto: ConfirmSignUpDto) {
    const { email, confirmationCode } = confirmSignUpDto;
    const username = email;
    const secretHash = this.computeSecretHash(username);

    const command = new ConfirmSignUpCommand({
      ClientId: this.clientId,
      Username: username,
      ConfirmationCode: confirmationCode,
      SecretHash: secretHash,
    });

    try {
      this.logger.logAuthEvent("ConfirmSignUp initiated", undefined, {
        email,
        username,
      });
      await this.cognitoClient.send(command);

      this.logger.logAuthEvent("ConfirmSignUp successful", undefined, {
        email,
        username,
      });

      return {
        message: "이메일 인증이 완료되었습니다.",
      };
    } catch (error) {
      this.logger.error("ConfirmSignUp failed", error.stack, {
        service: "CognitoService",
        method: "confirmSignUp",
        email,
      });
      throw this.handleCognitoError(error);
    }
  }

  async getUserInfo(accessToken: string) {
    const command = new GetUserCommand({
      AccessToken: accessToken,
    });

    try {
      const response = await this.cognitoClient.send(command);

      // Cognito UserAttributes를 객체로 변환
      const attributes =
        response.UserAttributes?.reduce((acc, attr) => {
          acc[attr.Name] = attr.Value;
          return acc;
        }, {} as Record<string, string>) || {};

      // 클라이언트가 기대하는 구조로 사용자 정보 변환
      const userInfo = {
        username:
          attributes.preferred_username ||
          attributes.email ||
          response.Username,
        attributes: {
          email: attributes.email || "",
          email_verified: attributes.email_verified === "true",
          preferred_username:
            attributes.preferred_username || attributes.email || "",
          name: attributes.name || "",
          sub: attributes.sub || "",
          picture: attributes.picture || "",
          nickname: attributes.nickname || "",
          phone_number: attributes.phone_number || "",
        },
        points: 0, // 기본값 설정
      };

      this.logger.logAuthEvent(
        "GetUserInfo successful",
        userInfo.attributes.sub,
        {
          email: userInfo.attributes.email,
          username: userInfo.username,
        }
      );

      return userInfo;
    } catch (error) {
      this.logger.error("GetUserInfo failed", error.stack, {
        service: "CognitoService",
        method: "getUserInfo",
      });
      throw this.handleCognitoError(error);
    }
  }

  async checkEmailExists(email: string) {
    const command = new ListUsersCommand({
      UserPoolId: this.userPoolId,
      Filter: `email = "${email}"`,
    });

    try {
      const response = await this.cognitoClient.send(command);
      const exists = response.Users && response.Users.length > 0;

      this.logger.logAuthEvent("CheckEmailExists", undefined, {
        email,
        exists,
      });

      return {
        exists,
        message: exists
          ? "이미 사용 중인 이메일입니다."
          : "사용 가능한 이메일입니다.",
      };
    } catch (error) {
      this.logger.error("CheckEmailExists failed", error.stack, {
        service: "CognitoService",
        method: "checkEmailExists",
        email,
      });
      throw this.handleCognitoError(error);
    }
  }

  async resendConfirmationCode(
    resendConfirmationCodeDto: ResendConfirmationCodeDto
  ) {
    const { email } = resendConfirmationCodeDto;
    const secretHash = this.computeSecretHash(email);

    const command = new ResendConfirmationCodeCommand({
      ClientId: this.clientId,
      Username: email,
      SecretHash: secretHash,
    });

    try {
      this.logger.logAuthEvent("ResendConfirmationCode initiated", undefined, {
        email,
      });
      await this.cognitoClient.send(command);

      this.logger.logAuthEvent("ResendConfirmationCode successful", undefined, {
        email,
      });

      return {
        message: "인증 코드가 재전송되었습니다.",
      };
    } catch (error) {
      this.logger.error("ResendConfirmationCode failed", error.stack, {
        service: "CognitoService",
        method: "resendConfirmationCode",
        email,
      });
      throw this.handleCognitoError(error);
    }
  }

  async confirmEmailVerification(
    confirmEmailVerificationDto: ConfirmEmailVerificationDto
  ) {
    const { email, code } = confirmEmailVerificationDto;
    const username = email;
    const secretHash = this.computeSecretHash(username);

    const command = new ConfirmSignUpCommand({
      ClientId: this.clientId,
      Username: username,
      ConfirmationCode: code,
      SecretHash: secretHash,
    });

    try {
      this.logger.logAuthEvent(
        "ConfirmEmailVerification initiated",
        undefined,
        {
          email,
          username,
        }
      );
      await this.cognitoClient.send(command);

      this.logger.logAuthEvent(
        "ConfirmEmailVerification successful",
        undefined,
        {
          email,
          username,
        }
      );

      return {
        message: "이메일 인증이 완료되었습니다.",
      };
    } catch (error) {
      this.logger.error("ConfirmEmailVerification failed", error.stack, {
        service: "CognitoService",
        method: "confirmEmailVerification",
        email,
      });
      throw this.handleCognitoError(error);
    }
  }

  async updateUserAttribute(
    userSub: string,
    attributeName: string,
    attributeValue: string
  ) {
    // 디버깅을 위한 로그 추가
    this.logger.log(
      `Received parameters - userSub: ${userSub}, attributeName: ${attributeName}, attributeValue: ${attributeValue}`,
      {
        service: "CognitoService",
        method: "updateUserAttribute",
      }
    );

    if (!userSub) {
      throw new Error("userSub is required");
    }

    const command = new AdminUpdateUserAttributesCommand({
      UserPoolId: this.userPoolId,
      Username: userSub,
      UserAttributes: [
        {
          Name: attributeName,
          Value: attributeValue,
        },
      ],
    });

    try {
      this.logger.log(
        `Updating user attribute ${attributeName} for user: ${userSub}`,
        {
          service: "CognitoService",
          method: "updateUserAttribute",
          userSub,
          attributeName,
        }
      );

      await this.cognitoClient.send(command);

      this.logger.log(
        `✅ User attribute ${attributeName} updated successfully for user: ${userSub}`,
        {
          service: "CognitoService",
          method: "updateUserAttribute",
          userSub,
          attributeName,
        }
      );

      return {
        message: `${attributeName} 정보가 성공적으로 업데이트되었습니다.`,
      };
    } catch (error) {
      this.logger.error(
        `Failed to update user attribute ${attributeName}`,
        error.stack,
        {
          service: "CognitoService",
          method: "updateUserAttribute",
          userSub,
          attributeName,
        }
      );
      throw this.handleCognitoError(error);
    }
  }

  async getUserByHandle(handle: string) {
    const handleWithoutAt = handle.replace("@", "");
    const command = new ListUsersCommand({
      UserPoolId: this.userPoolId,
      Filter: `preferred_username = "${handleWithoutAt}"`,
    });

    try {
      this.logger.log(`Getting user by handle: ${handleWithoutAt}`, {
        service: "CognitoService",
        method: "getUserByHandle",
        handleWithoutAt,
      });

      const response = await this.cognitoClient.send(command);

      if (!response.Users || response.Users.length === 0) {
        this.logger.log(`No user found with handle: ${handleWithoutAt}`, {
          service: "CognitoService",
          method: "getUserByHandle",
          handleWithoutAt,
        });
        return null;
      }

      const user = response.Users[0];

      this.logger.log(`✅ User found by handle: ${handleWithoutAt}`, {
        service: "CognitoService",
        method: "getUserByHandle",
        handleWithoutAt,
        username: user.Username,
      });

      return user;
    } catch (error) {
      this.logger.error("Failed to get user by handle", error.stack, {
        service: "CognitoService",
        method: "getUserByHandle",
        handleWithoutAt,
      });
      return null;
    }
  }

  async checkNicknameAvailability(nickname: string): Promise<boolean> {
    const command = new ListUsersCommand({
      UserPoolId: this.userPoolId,
      Filter: `nickname = "${nickname}"`,
    });

    try {
      this.logger.log(`Checking nickname availability: ${nickname}`, {
        service: "CognitoService",
        method: "checkNicknameAvailability",
        nickname,
      });

      const response = await this.cognitoClient.send(command);
      const available = !response.Users || response.Users.length === 0;

      this.logger.log(`✅ Nickname availability checked: ${nickname}`, {
        service: "CognitoService",
        method: "checkNicknameAvailability",
        nickname,
        available,
      });

      return available;
    } catch (error) {
      this.logger.error("Failed to check nickname availability", error.stack, {
        service: "CognitoService",
        method: "checkNicknameAvailability",
        nickname,
      });
      return false;
    }
  }

  private handleCognitoError(error: any): {
    message: string;
    code?: string;
    details?: any;
  } {
    const errorMessage = error.message || "알 수 없는 오류가 발생했습니다.";
    const errorCode = error.name || "UnknownError";

    const errorMessages: { [key: string]: string } = {
      UsernameExistsException: "이미 존재하는 사용자입니다.",
      InvalidPasswordException: "비밀번호가 정책에 맞지 않습니다.",
      InvalidParameterException: "잘못된 입력값이 있습니다.",
      CodeMismatchException: "인증 코드가 일치하지 않습니다.",
      ExpiredCodeException: "인증 코드가 만료되었습니다.",
      NotAuthorizedException: "인증에 실패했습니다.",
      UserNotFoundException: "사용자를 찾을 수 없습니다.",
      UserNotConfirmedException: "이메일 인증이 필요합니다.",
      LimitExceededException: "요청 횟수가 초과되었습니다.",
      TooManyRequestsException: "너무 많은 요청이 발생했습니다.",
    };

    return {
      message: errorMessages[errorCode] || errorMessage,
      code: errorCode,
      details: error,
    };
  }
}
