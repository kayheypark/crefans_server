import { Response } from "express";
import { ConfigService } from "@nestjs/config";

export const setAuthCookies = (
  res: Response,
  tokens: {
    accessToken: string;
    idToken: string;
    refreshToken: string;
  },
  configService?: ConfigService
) => {
  // 설정 서비스가 있으면 사용, 없으면 환경변수로 판단
  const isProduction = configService
    ? configService.get("app.isProduction")
    : process.env.NODE_ENV === "prod";

  const cookieConfig = configService?.get("app.cookie") || {
    domain: isProduction ? ".crefans.com" : undefined,
    secure: isProduction,
    sameSite: "lax" as const,
  };

  // Access Token 쿠키 설정 (1시간)
  res.cookie("access_token", tokens.accessToken, {
    httpOnly: true,
    secure: cookieConfig.secure,
    sameSite: cookieConfig.sameSite,
    maxAge: 60 * 60 * 1000, // 1시간
    path: "/",
    domain: cookieConfig.domain,
  });

  // ID Token 쿠키 설정 (1시간)
  res.cookie("id_token", tokens.idToken, {
    httpOnly: false,
    secure: cookieConfig.secure,
    sameSite: cookieConfig.sameSite,
    maxAge: 60 * 60 * 1000, // 1시간
    path: "/",
    domain: cookieConfig.domain,
  });

  // Refresh Token 쿠키 설정 (30일)
  res.cookie("refresh_token", tokens.refreshToken, {
    httpOnly: true,
    secure: cookieConfig.secure,
    sameSite: cookieConfig.sameSite,
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30일
    path: "/",
    domain: cookieConfig.domain,
  });
};

export const clearAuthCookies = (
  res: Response,
  configService?: ConfigService
) => {
  const isProduction = configService
    ? configService.get("app.isProduction")
    : process.env.NODE_ENV === "prod";

  const cookieConfig = configService?.get("app.cookie") || {
    domain: isProduction ? ".crefans.com" : undefined,
  };

  res.clearCookie("access_token", {
    path: "/",
    domain: cookieConfig.domain,
  });
  res.clearCookie("id_token", {
    path: "/",
    domain: cookieConfig.domain,
  });
  res.clearCookie("refresh_token", {
    path: "/",
    domain: cookieConfig.domain,
  });
};
