import {
  Injectable,
  CanActivate,
  ExecutionContext,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  CognitoIdentityProviderClient,
  GetUserCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { LoggerService } from "../logger/logger.service";

@Injectable()
export class OptionalAuthGuard implements CanActivate {
  private cognitoClient: CognitoIdentityProviderClient;

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
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    
    // 1. 쿠키에서 토큰 확인 (우선 방식)
    let accessToken = request.cookies?.access_token;
    
    // 2. Authorization 헤더에서 토큰 확인 (Bearer token)
    if (!accessToken) {
      accessToken = this.extractTokenFromHeader(request);
    }

    // 토큰이 없는 경우 에러를 던지지 않고 그냥 통과
    if (!accessToken) {
      this.logger.log("No access token found - proceeding without authentication", {
        service: "OptionalAuthGuard",
        method: "canActivate",
      });
      request.user = null;
      return true;
    }

    try {
      const user = await this.validateToken(accessToken);
      request.user = user;
      this.logger.log("Optional authentication successful", {
        service: "OptionalAuthGuard",
        method: "canActivate",
        userSub: user.sub,
      });
    } catch (error) {
      this.logger.warn("Token validation failed - proceeding without authentication", {
        service: "OptionalAuthGuard",
        method: "canActivate",
        error: error.message,
      });
      // 토큰이 유효하지 않아도 요청을 통과시킴
      request.user = null;
    }

    return true;
  }

  private extractTokenFromHeader(request: any): string | null {
    const authorization = request.headers.authorization;
    if (!authorization) {
      return null;
    }

    // Bearer token 형식 확인
    const parts = authorization.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      this.logger.warn("Invalid authorization header format", {
        service: "OptionalAuthGuard",
        method: "extractTokenFromHeader",
        authorization: authorization.substring(0, 20) + "...", // 보안상 일부만 로그
      });
      return null;
    }

    return parts[1];
  }

  private async validateToken(accessToken: string) {
    const command = new GetUserCommand({
      AccessToken: accessToken,
    });

    try {
      const response = await this.cognitoClient.send(command);

      const user = {
        sub: response.UserAttributes?.find((attr) => attr.Name === "sub")
          ?.Value,
        userSub: response.UserAttributes?.find((attr) => attr.Name === "sub")
          ?.Value, // controller에서 사용하는 필드명과 통일
        email: response.UserAttributes?.find((attr) => attr.Name === "email")
          ?.Value,
        name: response.UserAttributes?.find((attr) => attr.Name === "name")
          ?.Value,
        username: response.Username,
        accessToken: accessToken, // accessToken 추가
      };

      return user;
    } catch (error) {
      this.logger.error("Cognito GetUser failed", error.stack, {
        service: "OptionalAuthGuard",
        method: "validateToken",
      });
      throw error;
    }
  }
}