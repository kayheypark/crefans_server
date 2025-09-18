import {
  Controller,
  Post,
  Body,
  UseFilters,
  Res,
  HttpStatus,
  Get,
  Req,
  UseGuards,
  UnauthorizedException,
} from "@nestjs/common";
import { AuthService } from "../auth/auth.service";
import { AdminService } from "./admin.service";
import { SignInDto } from "../auth/dto/auth.dto";
import { CognitoExceptionFilter } from "../auth/filters/cognito-exception.filter";
import { Response, Request } from "express";
import { setAuthCookies, clearAuthCookies } from "../auth/utils/cookie.util";
import { CognitoException } from "../auth/exceptions/cognito.exception";
import { ConfigService } from "@nestjs/config";
import { AuthGuard } from "../common/guards/auth.guard";
import { AdminAuthGuard } from "./guards/admin-auth.guard";
import {
  CurrentUser,
  CurrentUser as CurrentUserType,
} from "../common/decorators/current-user.decorator";
import { ApiResponseDto } from "../common/dto/api-response.dto";

@Controller("admin/auth")
@UseFilters(CognitoExceptionFilter)
export class AdminAuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly adminService: AdminService,
    private readonly configService: ConfigService
  ) {}

  @Post("signin")
  async adminSignIn(
    @Body() signInDto: SignInDto,
    @Res({ passthrough: true }) res: Response
  ): Promise<ApiResponseDto<{ admin: { email: string; role: string } }>> {
    // 1. 일반 Cognito 인증 수행
    const authResult = await this.authService.signIn(signInDto);

    // 2. 토큰에서 사용자 정보 추출
    const userInfo = await this.authService.getUserInfo(authResult.accessToken);

    // 3. 관리자 권한 확인
    const adminUser = await this.adminService.getAdminByUserSub(userInfo.attributes.sub);
    if (!adminUser || !adminUser.is_active) {
      throw new UnauthorizedException("관리자 권한이 없습니다.");
    }

    // 4. 마지막 로그인 시간 업데이트
    await this.adminService.updateLastLogin(adminUser.id);

    // 5. 쿠키 설정
    setAuthCookies(
      res,
      {
        accessToken: authResult.accessToken,
        idToken: authResult.idToken,
        refreshToken: authResult.refreshToken,
      },
      this.configService
    );

    return ApiResponseDto.success("관리자 로그인이 완료되었습니다.", {
      admin: {
        email: signInDto.email,
        role: adminUser.role,
      },
    });
  }

  @Post("signout")
  async adminSignOut(
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

    return ApiResponseDto.success("관리자 로그아웃이 완료되었습니다.", {});
  }

  @Post("refresh")
  async adminRefreshToken(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response
  ): Promise<ApiResponseDto<{}>> {
    const refreshToken = req.cookies.refresh_token;
    const idToken = req.cookies.id_token;
    if (!refreshToken) {
      throw new UnauthorizedException("리프레시 토큰이 없습니다.");
    }

    try {
      // 토큰 갱신
      const authResult = await this.authService.refreshToken(refreshToken, idToken);

      // 새로운 토큰으로 사용자 정보 확인
      const userInfo = await this.authService.getUserInfo(authResult.accessToken);

      // 관리자 권한 재확인
      const adminUser = await this.adminService.getAdminByUserSub(userInfo.attributes.sub);
      if (!adminUser || !adminUser.is_active) {
        throw new UnauthorizedException("관리자 권한이 없습니다.");
      }

      // 새로운 쿠키 설정
      setAuthCookies(
        res,
        {
          accessToken: authResult.accessToken,
          idToken: authResult.idToken,
          refreshToken: authResult.refreshToken,
        },
        this.configService
      );

      return ApiResponseDto.success("토큰이 성공적으로 갱신되었습니다.", {});
    } catch (error: any) {
      // 리프레시 토큰이 만료되었거나 무효한 경우 모든 쿠키 삭제
      clearAuthCookies(res, this.configService);
      throw error;
    }
  }

  @Get("me")
  @UseGuards(AdminAuthGuard)
  async getCurrentAdmin(
    @CurrentUser() user: CurrentUserType
  ): Promise<ApiResponseDto<{ admin: any }>> {
    const userInfo = await this.authService.getUserInfo(user.accessToken);
    const adminUser = await this.adminService.getAdminByUserSub(userInfo.attributes.sub);

    if (!adminUser || !adminUser.is_active) {
      throw new UnauthorizedException("관리자 권한이 없습니다.");
    }

    return ApiResponseDto.success("관리자 정보를 성공적으로 가져왔습니다.", {
      admin: {
        id: adminUser.id,
        name: adminUser.name,
        email: adminUser.email,
        role: adminUser.role,
        last_login: adminUser.last_login,
        cognito: userInfo,
      },
    });
  }
}