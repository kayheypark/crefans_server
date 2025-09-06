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
  Put,
} from "@nestjs/common";
import { AuthService } from "./auth.service";
import {
  SignUpDto,
  SignInDto,
  ConfirmSignUpDto,
  UpdateNicknameDto,
  UpdateHandleDto,
} from "./dto/auth.dto";
import { CognitoExceptionFilter } from "./filters/cognito-exception.filter";
import { Response, Request } from "express";
import { setAuthCookies, clearAuthCookies } from "./utils/cookie.util";
import { CognitoException } from "./exceptions/cognito.exception";
import { ConfigService } from "@nestjs/config";
import { AuthGuard } from "../common/guards/auth.guard";
import {
  CurrentUser,
  CurrentUser as CurrentUserType,
} from "../common/decorators/current-user.decorator";
import { ApiResponseDto } from "../common/dto/api-response.dto";

@Controller("auth")
@UseFilters(CognitoExceptionFilter)
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService
  ) {}

  @Post("signup")
  async signUp(
    @Body() signUpDto: SignUpDto
  ): Promise<ApiResponseDto<{ user: { email: string; userSub: string } }>> {
    const result = await this.authService.signUp(signUpDto);
    return ApiResponseDto.success(result.message, {
      user: {
        email: signUpDto.email,
        userSub: result.userSub,
      },
    });
  }

  @Post("signin")
  async signIn(
    @Body() signInDto: SignInDto,
    @Res({ passthrough: true }) res: Response
  ): Promise<ApiResponseDto<{ user: { email: string } }>> {
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
    return ApiResponseDto.success(result.message, {
      user: {
        email: signInDto.email,
      },
    });
  }

  @Post("signout")
  async signOut(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response
  ): Promise<ApiResponseDto<{}>> {
    const accessToken = req.cookies.access_token;
    if (!accessToken) {
      throw new CognitoException("인증되지 않은 사용자입니다.", "Unauthorized");
    }

    await this.authService.signOut({ accessToken });

    // 쿠키 삭제
    clearAuthCookies(res, this.configService);

    return ApiResponseDto.success("로그아웃이 완료되었습니다.", {});
  }

  @Post("confirm-signup")
  async confirmSignUp(
    @Body() confirmSignUpDto: ConfirmSignUpDto
  ): Promise<ApiResponseDto<{ user: { email: string } }>> {
    const result = await this.authService.confirmSignUp(confirmSignUpDto);
    return ApiResponseDto.success(result.message, {
      user: {
        email: confirmSignUpDto.email,
      },
    });
  }

  @Get("me")
  @UseGuards(AuthGuard)
  async getCurrentUser(
    @CurrentUser() user: CurrentUserType
  ): Promise<ApiResponseDto<{ user: any }>> {
    console.log('=== /auth/me Debug ===');
    console.log('AccessToken (first 50 chars):', user.accessToken?.substring(0, 50));
    
    const userInfo = await this.authService.getUserInfo(user.accessToken);
    
    console.log('Retrieved userInfo:', {
      username: userInfo.username,
      nickname: userInfo.attributes.nickname,
      preferred_username: userInfo.attributes.preferred_username,
    });
    console.log('======================');
    
    return ApiResponseDto.success("사용자 정보를 성공적으로 가져왔습니다.", {
      user: userInfo,
    });
  }

  @Get("check-email")
  async checkEmailExists(
    @Query("email") email: string
  ): Promise<ApiResponseDto<{ exists: boolean }>> {
    if (!email) {
      throw new CognitoException(
        "이메일 주소를 입력해주세요.",
        "InvalidParameterException"
      );
    }

    const result = await this.authService.checkEmailExists(email);
    return ApiResponseDto.success(result.message, {
      exists: result.exists,
    });
  }

  @Post("resend-confirmation-code")
  async resendConfirmationCode(
    @Body("email") email: string
  ): Promise<ApiResponseDto<{}>> {
    if (!email) {
      throw new CognitoException(
        "이메일 주소를 입력해주세요.",
        "InvalidParameterException"
      );
    }

    const result = await this.authService.resendConfirmationCode({ email });
    return ApiResponseDto.success(result.message, {});
  }

  @Get("confirm-email-verification")
  async confirmEmailVerification(
    @Query() query: { email: string; code: string }
  ): Promise<ApiResponseDto<{ user: { email: string } }>> {
    const { email, code } = query;

    if (!email || !code) {
      throw new CognitoException(
        "이메일과 인증 코드가 필요합니다.",
        "InvalidParameterException"
      );
    }

    const result = await this.authService.confirmEmailVerification({
      email,
      code,
    });
    return ApiResponseDto.success(result.message, {
      user: {
        email: email,
      },
    });
  }

  @Put("nickname")
  @UseGuards(AuthGuard)
  async updateNickname(
    @CurrentUser() user: CurrentUserType,
    @Body() updateNicknameDto: UpdateNicknameDto
  ): Promise<ApiResponseDto<{}>> {
    const result = await this.authService.updateNickname(
      user.username,
      updateNicknameDto.nickname
    );
    return ApiResponseDto.success(result.message, {});
  }

  @Put("handle")
  @UseGuards(AuthGuard)
  async updateHandle(
    @CurrentUser() user: CurrentUserType,
    @Body() updateHandleDto: UpdateHandleDto
  ): Promise<ApiResponseDto<{}>> {
    const result = await this.authService.updateHandle(
      user.username,
      updateHandleDto.preferredUsername
    );
    return ApiResponseDto.success(result.message, {});
  }
}
