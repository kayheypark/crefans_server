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
  UseGuards,
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
import { ConfigService } from "@nestjs/config";
import { AuthGuard } from "../common/guards/auth.guard";
import { CurrentUser } from "../common/decorators/current-user.decorator";

@Controller("auth")
@UseFilters(CognitoExceptionFilter)
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService
  ) {}

  @Post("signup")
  async signUp(@Body() signUpDto: SignUpDto) {
    const result = await this.authService.signUp(signUpDto);
    return {
      success: true,
      message: result.message,
      data: {
        user: {
          email: signUpDto.email,
          userSub: result.userSub,
        },
      },
    };
  }

  @Post("signin")
  async signIn(
    @Body() signInDto: SignInDto,
    @Res({ passthrough: true }) res: Response
  ) {
    const result = await this.authService.signIn(signInDto);

    // 토큰을 쿠키에 저장
    setAuthCookies(
      res,
      {
        accessToken: result.accessToken,
        idToken: result.idToken,
        refreshToken: result.refreshToken,
      },
      this.configService
    );

    // 클라이언트와 호환되는 응답 구조
    return {
      success: true,
      message: result.message,
      data: {
        user: {
          email: signInDto.email,
        },
      },
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
    clearAuthCookies(res, this.configService);

    return {
      success: true,
      message: "로그아웃이 완료되었습니다.",
      data: {},
    };
  }

  @Post("confirm-signup")
  async confirmSignUp(@Body() confirmSignUpDto: ConfirmSignUpDto) {
    const result = await this.authService.confirmSignUp(confirmSignUpDto);
    return {
      success: true,
      message: result.message,
      data: {
        user: {
          email: confirmSignUpDto.email,
        },
      },
    };
  }

  @Get("me")
  @UseGuards(AuthGuard)
  async getCurrentUser(@CurrentUser() user: any) {
    const userInfo = await this.authService.getUserInfo(user.accessToken);
    return {
      success: true,
      message: "사용자 정보를 성공적으로 가져왔습니다.",
      data: {
        user: userInfo,
      },
    };
  }

  @Get("check-email")
  async checkEmailExists(@Query("email") email: string) {
    if (!email) {
      throw new CognitoException(
        "이메일 주소를 입력해주세요.",
        "InvalidParameterException"
      );
    }

    const result = await this.authService.checkEmailExists(email);
    return {
      success: true,
      message: result.message,
      data: {
        exists: result.exists,
      },
    };
  }

  @Post("resend-confirmation-code")
  async resendConfirmationCode(@Body("email") email: string) {
    if (!email) {
      throw new CognitoException(
        "이메일 주소를 입력해주세요.",
        "InvalidParameterException"
      );
    }

    const result = await this.authService.resendConfirmationCode({ email });
    return {
      success: true,
      message: result.message,
      data: {},
    };
  }
}
