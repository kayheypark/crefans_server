import { createParamDecorator, ExecutionContext } from "@nestjs/common";

export interface CurrentUser {
  userSub: string;
  email: string;
  username?: string;
  accessToken?: string;
}

export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): CurrentUser => {
    const request = ctx.switchToHttp().getRequest();

    // Cognito에서 추출한 사용자 정보
    const user = request.user;

    if (!user) {
      return null;
    }

    return {
      userSub: user.sub,
      email: user.email,
      username: user.username,
      accessToken: user.accessToken,
    };
  }
);
