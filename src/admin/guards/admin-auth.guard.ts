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
    const request = context.switchToHttp().getRequest();

    // 1. 쿠키에서 토큰 확인 (우선 방식)
    let token = request.cookies?.access_token;

    // 2. Authorization 헤더에서 토큰 확인 (Bearer token)
    if (!token) {
      token = this.extractTokenFromHeader(request);
    }

    if (!token) {
      this.logger.warn('No token provided for admin authentication', {
        service: 'AdminAuthGuard',
        method: 'canActivate',
        hasAuthHeader: !!request.headers.authorization,
        hasCookie: !!request.cookies?.access_token,
      });
      throw new UnauthorizedException();
    }

    try {
      const user = await this.validateToken(token);

      // Check if user is an admin
      const adminUser = await this.adminService.getAdminByUserSub(user.sub);
      if (!adminUser || !adminUser.is_active) {
        this.logger.warn('User is not an active admin', {
          service: 'AdminAuthGuard',
          method: 'canActivate',
          userSub: user.sub,
        });
        throw new UnauthorizedException();
      }

      request.user = user;
      return true;
    } catch (error) {
      this.logger.error('Admin authentication failed', error.stack, {
        service: 'AdminAuthGuard',
        method: 'canActivate',
      });
      throw new UnauthorizedException();
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