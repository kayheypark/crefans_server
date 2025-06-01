import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  CognitoIdentityProviderClient,
  SignUpCommand,
  InitiateAuthCommand,
  GlobalSignOutCommand,
  ConfirmSignUpCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  SignUpDto,
  SignInDto,
  SignOutDto,
  ConfirmSignUpDto,
} from "./dto/auth.dto";
import * as crypto from "crypto";
import { CognitoException } from "./exceptions/cognito.exception";

@Injectable()
export class AuthService {
  private cognitoClient: CognitoIdentityProviderClient;
  private userPoolId: string;
  private clientId: string;
  private clientSecret: string;

  constructor(private configService: ConfigService) {
    this.cognitoClient = new CognitoIdentityProviderClient({
      region: this.configService.get("AWS_REGION"),
      credentials: {
        accessKeyId: this.configService.get("AWS_ACCESS_KEY_ID"),
        secretAccessKey: this.configService.get("AWS_SECRET_ACCESS_KEY"),
      },
    });
    this.userPoolId = this.configService.get("COGNITO_USER_POOL_ID");
    this.clientId = this.configService.get("COGNITO_CLIENT_ID");
    this.clientSecret = this.configService.get("COGNITO_CLIENT_SECRET");
  }

  private computeSecretHash(username: string): string {
    const message = username + this.clientId;
    const hmac = crypto.createHmac("sha256", this.clientSecret);
    hmac.update(message);
    return hmac.digest("base64");
  }

  private generateUsername(email: string): string {
    const [id, domain] = email.split("@");
    const timestamp = Date.now();
    return `${id}:${domain}:${timestamp}`;
  }

  private handleCognitoError(error: any): {
    message: string;
    code?: string;
    details?: any;
  } {
    // AWS Cognito 에러 메시지 추출
    const errorMessage = error.message || "알 수 없는 오류가 발생했습니다.";

    // 일반적인 Cognito 에러 코드 매핑
    const errorCode = error.name || "UnknownError";

    // 한글 에러 메시지 매핑
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

    // InvalidParameterException의 경우 추가 정보 제공
    if (errorCode === "InvalidParameterException") {
      console.error("InvalidParameterException Details:", {
        error,
        message: errorMessage,
        stack: error.stack,
      });
    }

    return {
      message: errorMessages[errorCode] || errorMessage,
      code: errorCode,
      details:
        errorCode === "InvalidParameterException"
          ? {
              originalMessage: errorMessage,
              stack: error.stack,
            }
          : undefined,
    };
  }

  async signUp(signUpDto: SignUpDto) {
    const username = this.generateUsername(signUpDto.email);
    const secretHash = this.computeSecretHash(username);

    const command = new SignUpCommand({
      ClientId: this.clientId,
      Username: username,
      Password: signUpDto.password,
      SecretHash: secretHash,
      UserAttributes: [
        {
          Name: "name",
          Value: signUpDto.name,
        },
        {
          Name: "email",
          Value: signUpDto.email,
        },
        {
          Name: "preferred_username",
          Value: username,
        },
      ],
    });

    try {
      console.log("SignUp Request:", {
        clientId: this.clientId,
        username: username,
        secretHash: secretHash,
        userAttributes: command.input.UserAttributes,
        region: this.configService.get("AWS_REGION"),
        userPoolId: this.userPoolId,
      });

      const response = await this.cognitoClient.send(command);
      return {
        message:
          "임시 회원가입이 완료되었습니다. 이메일 인증 후 로그인 가능합니다.",
        userSub: response.UserSub,
        username: username,
      };
    } catch (error) {
      console.error("SignUp Error:", {
        error,
        request: {
          clientId: this.clientId,
          username: username,
          secretHash: secretHash,
          userAttributes: command.input.UserAttributes,
        },
      });
      const errorResponse = this.handleCognitoError(error);
      throw new CognitoException(errorResponse.message, errorResponse.code);
    }
  }

  async signIn(signInDto: SignInDto) {
    const command = new InitiateAuthCommand({
      AuthFlow: "USER_PASSWORD_AUTH",
      ClientId: this.clientId,
      AuthParameters: {
        USERNAME: signInDto.email,
        PASSWORD: signInDto.password,
        SECRET_HASH: this.computeSecretHash(signInDto.email),
      },
    });

    try {
      console.log("SignIn Request:", {
        clientId: this.clientId,
        username: signInDto.email,
        region: this.configService.get("AWS_REGION"),
        userPoolId: this.userPoolId,
      });

      const response = await this.cognitoClient.send(command);
      return {
        message: "로그인이 완료되었습니다.",
        accessToken: response.AuthenticationResult.AccessToken,
        refreshToken: response.AuthenticationResult.RefreshToken,
        idToken: response.AuthenticationResult.IdToken,
      };
    } catch (error) {
      console.error("SignIn Error:", {
        error,
        request: {
          clientId: this.clientId,
          username: signInDto.email,
        },
      });
      const errorResponse = this.handleCognitoError(error);
      throw new CognitoException(errorResponse.message, errorResponse.code);
    }
  }

  async signOut(signOutDto: SignOutDto) {
    const command = new GlobalSignOutCommand({
      AccessToken: signOutDto.accessToken,
    });

    try {
      await this.cognitoClient.send(command);
      return {
        message: "로그아웃이 완료되었습니다.",
      };
    } catch (error) {
      console.error("SignOut Error:", {
        error,
        request: {
          accessToken: signOutDto.accessToken,
        },
      });
      const errorResponse = this.handleCognitoError(error);
      throw new CognitoException(errorResponse.message, errorResponse.code);
    }
  }

  async confirmSignUp(confirmSignUpDto: ConfirmSignUpDto) {
    const command = new ConfirmSignUpCommand({
      ClientId: this.clientId,
      Username: confirmSignUpDto.userSub,
      ConfirmationCode: confirmSignUpDto.confirmationCode,
      SecretHash: this.computeSecretHash(confirmSignUpDto.userSub),
    });

    try {
      console.log("ConfirmSignUp Request:", {
        clientId: this.clientId,
        userSub: confirmSignUpDto.userSub,
        confirmationCode: confirmSignUpDto.confirmationCode,
      });

      await this.cognitoClient.send(command);
      return {
        message: "이메일 인증이 완료되었습니다. 이제 로그인이 가능합니다.",
      };
    } catch (error) {
      console.error("ConfirmSignUp Error:", {
        error,
        request: {
          clientId: this.clientId,
          userSub: confirmSignUpDto.userSub,
          confirmationCode: confirmSignUpDto.confirmationCode,
        },
      });
      const errorResponse = this.handleCognitoError(error);
      throw new CognitoException(errorResponse.message, errorResponse.code);
    }
  }
}
