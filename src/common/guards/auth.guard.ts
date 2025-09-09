import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  CognitoIdentityProviderClient,
  GetUserCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { LoggerService } from "../logger/logger.service";

@Injectable()
export class AuthGuard implements CanActivate {
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

    if (!accessToken) {
      this.logger.warn("Access token not found in header or cookies", {
        service: "AuthGuard",
        method: "canActivate",
        hasAuthHeader: !!request.headers.authorization,
        authHeaderValue: request.headers.authorization?.substring(0, 30) + "...",
        hasCookie: !!request.cookies?.access_token,
        cookieValue: request.cookies?.access_token?.substring(0, 30) + "...",
        allHeaders: Object.keys(request.headers),
      });
      throw new UnauthorizedException("인증 토큰이 없습니다.");
    }

    try {
      const user = await this.validateToken(accessToken);
      request.user = user;
      return true;
    } catch (error) {
      this.logger.error("Token validation failed", error.stack, {
        service: "AuthGuard",
        method: "canActivate",
      });
      throw new UnauthorizedException("유효하지 않은 토큰입니다.");
    }
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
        service: "AuthGuard",
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
        email: response.UserAttributes?.find((attr) => attr.Name === "email")
          ?.Value,
        name: response.UserAttributes?.find((attr) => attr.Name === "name")
          ?.Value,
        username: response.Username,
        accessToken: accessToken, // accessToken 추가
      };

      this.logger.log("Token validation successful", {
        service: "AuthGuard",
        method: "validateToken",
        userSub: user.sub,
      });

      return user;
    } catch (error) {
      this.logger.error("Cognito GetUser failed", error.stack, {
        service: "AuthGuard",
        method: "validateToken",
      });
      throw error;
    }
  }
}
