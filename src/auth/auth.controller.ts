import {
  Controller,
  Post,
  Body,
  UseFilters,
  Res,
  HttpStatus,
  Get,
  Req,
  Query,
} from "@nestjs/common";
import { AuthService } from "./auth.service";
import {
  SignUpDto,
  SignInDto,
  SignOutDto,
  ConfirmSignUpDto,
} from "./dto/auth.dto";
import { CognitoExceptionFilter } from "./filters/cognito-exception.filter";
import { Response, Request } from "express";
import { setAuthCookies, clearAuthCookies } from "./utils/cookie.util";
import { CognitoException } from "./exceptions/cognito.exception";

@Controller("auth")
@UseFilters(CognitoExceptionFilter)
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("signup")
  async signUp(@Body() signUpDto: SignUpDto) {
    return this.authService.signUp(signUpDto);
  }

  @Post("signin")
  async signIn(
    @Body() signInDto: SignInDto,
    @Res({ passthrough: true }) res: Response
  ) {
    const result = await this.authService.signIn(signInDto);

    // 토큰을 쿠키에 저장
    setAuthCookies(res, {
      accessToken: result.accessToken,
      idToken: result.idToken,
      refreshToken: result.refreshToken,
    });

    // 클라이언트에는 토큰을 제외한 메시지만 반환
    return {
      message: result.message,
    };
  }

  @Post("signout")
  async signOut(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response
  ) {
    const accessToken = req.cookies.access_token;
    if (!accessToken) {
      throw new CognitoException("인증되지 않은 사용자입니다.", "Unauthorized");
    }

    await this.authService.signOut({ accessToken });

    // 쿠키 삭제
    clearAuthCookies(res);

    return {
      message: "로그아웃이 완료되었습니다.",
    };
  }

  @Post("confirm-signup")
  async confirmSignUp(@Body() confirmSignUpDto: ConfirmSignUpDto) {
    return this.authService.confirmSignUp(confirmSignUpDto);
  }

  @Get("me")
  async getCurrentUser(@Req() req: Request) {
    const accessToken = req.cookies.access_token;
    if (!accessToken) {
      throw new CognitoException("인증되지 않은 사용자입니다.", "Unauthorized");
    }
    return this.authService.getUserInfo(accessToken);
  }

  @Get("check-email")
  async checkEmailExists(@Query("email") email: string) {
    if (!email) {
      throw new CognitoException(
        "이메일 주소를 입력해주세요.",
        "InvalidParameterException"
      );
    }

    return this.authService.checkEmailExists(email);
  }

  @Post("resend-confirmation-code")
  async resendConfirmationCode(@Body("email") email: string) {
    if (!email) {
      throw new CognitoException(
        "이메일 주소를 입력해주세요.",
        "InvalidParameterException"
      );
    }

    return this.authService.resendConfirmationCode(email);
  }
}
