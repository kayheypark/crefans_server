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
import { LoggerService } from "../../common/logger/logger.service";
import { AdminService } from "../admin.service";

@Injectable()
export class AdminAuthGuard implements CanActivate {
  private cognitoClient: CognitoIdentityProviderClient;

  constructor(
    private configService: ConfigService,
    private logger: LoggerService,
    private adminService: AdminService
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
    /* Temporarily disable authentication for testing
    return true;

    Original code commented out for testing */
    const request = context.switchToHttp().getRequest();

    // 1. 쿠키에서 토큰 확인 (우선 방식)
    let accessToken = request.cookies?.access_token;

    // 2. Authorization 헤더에서 토큰 확인 (Bearer token)
    if (!accessToken) {
      accessToken = this.extractTokenFromHeader(request);
    }

    if (!accessToken) {
      this.logger.warn("Admin access token not found", {
        service: "AdminAuthGuard",
        method: "canActivate",
      });
      throw new UnauthorizedException("관리자 인증 토큰이 없습니다.");
    }

    try {
      // Cognito 토큰 검증
      const user = await this.validateToken(accessToken);

      // 관리자 권한 확인
      const adminUser = await this.adminService.getAdminByUserSub(user.sub);
      if (!adminUser || !adminUser.is_active) {
        this.logger.warn("User is not an admin or inactive", {
          service: "AdminAuthGuard",
          method: "canActivate",
          userSub: user.sub,
        });
        throw new UnauthorizedException("관리자 권한이 없습니다.");
      }

      // request에 사용자 및 관리자 정보 추가
      request.user = user;
      request.admin = adminUser;
      return true;
    } catch (error) {
      this.logger.error("Admin token validation failed", error.stack, {
        service: "AdminAuthGuard",
        method: "canActivate",
      });

      if (error instanceof UnauthorizedException) {
        throw error;
      }

      throw new UnauthorizedException("유효하지 않은 관리자 토큰입니다.");
    }
  }

  private extractTokenFromHeader(request: any): string | null {
    const authorization = request.headers.authorization;
    if (!authorization) {
      return null;
    }

    const parts = authorization.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
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
        accessToken: accessToken,
      };

      return user;
    } catch (error) {
      this.logger.error("Cognito GetUser failed for admin", error.stack, {
        service: "AdminAuthGuard",
        method: "validateToken",
      });
      throw error;
    }
  }
}