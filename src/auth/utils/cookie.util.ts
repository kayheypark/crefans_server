import { Response } from "express";

export const setAuthCookies = (
  res: Response,
  tokens: {
    accessToken: string;
    idToken: string;
    refreshToken: string;
  }
) => {
  // 프로덕션 환경 감지 (여러 방법으로 확인)
  const isProduction =
    process.env.NODE_ENV === "prod" ||
    process.env.NODE_ENV === "production" ||
    process.env.HOSTNAME?.includes("crefans.com") ||
    process.env.HOST?.includes("crefans.com");

  // 환경 변수 디버깅
  console.log("=== 쿠키 설정 디버깅 ===");
  console.log("NODE_ENV:", process.env.NODE_ENV);
  console.log("HOSTNAME:", process.env.HOSTNAME);
  console.log("HOST:", process.env.HOST);
  console.log("isProduction:", isProduction);
  console.log("cookieDomain:", isProduction ? ".crefans.com" : undefined);
  console.log("========================");

  // Access Token 쿠키 설정 (1시간)
  res.cookie("access_token", tokens.accessToken, {
    httpOnly: true,
    secure: isProduction, // HTTPS에서만 전송
    sameSite: "lax", // strict에서 lax로 변경 (크로스 사이트 요청 허용)
    maxAge: 60 * 60 * 1000, // 1시간
    path: "/",
    domain: isProduction ? ".crefans.com" : undefined, // 프로덕션에서만 도메인 설정
  });

  // ID Token 쿠키 설정 (1시간)
  res.cookie("id_token", tokens.idToken, {
    httpOnly: false,
    secure: isProduction,
    sameSite: "lax", // strict에서 lax로 변경
    maxAge: 60 * 60 * 1000, // 1시간
    path: "/",
    domain: isProduction ? ".crefans.com" : undefined, // 프로덕션에서만 도메인 설정
  });

  // Refresh Token 쿠키 설정 (30일)
  res.cookie("refresh_token", tokens.refreshToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax", // strict에서 lax로 변경
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30일
    path: "/",
    domain: isProduction ? ".crefans.com" : undefined, // 프로덕션에서만 도메인 설정
  });
};

export const clearAuthCookies = (res: Response) => {
  const isProduction =
    process.env.NODE_ENV === "prod" ||
    process.env.NODE_ENV === "production" ||
    process.env.HOSTNAME?.includes("crefans.com") ||
    process.env.HOST?.includes("crefans.com");

  res.clearCookie("access_token", {
    path: "/",
    domain: isProduction ? ".crefans.com" : undefined,
  });
  res.clearCookie("id_token", {
    path: "/",
    domain: isProduction ? ".crefans.com" : undefined,
  });
  res.clearCookie("refresh_token", {
    path: "/",
    domain: isProduction ? ".crefans.com" : undefined,
  });
};
