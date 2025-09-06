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
    const accessToken = request.cookies?.access_token;

    if (!accessToken) {
      this.logger.warn("Access token not found in cookies", {
        service: "AuthGuard",
        method: "canActivate",
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
