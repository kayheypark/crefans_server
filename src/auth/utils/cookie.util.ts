import { Response } from "express";

export const setAuthCookies = (
  res: Response,
  tokens: {
    accessToken: string;
    idToken: string;
    refreshToken: string;
  }
) => {
  // Access Token 쿠키 설정 (1시간)
  res.cookie("access_token", tokens.accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "prod", // HTTPS에서만 전송
    sameSite: "lax", // strict에서 lax로 변경 (크로스 사이트 요청 허용)
    maxAge: 60 * 60 * 1000, // 1시간
    path: "/",
    domain: process.env.NODE_ENV === "prod" ? ".crefans.com" : undefined, // 서브도메인 공유
  });

  // ID Token 쿠키 설정 (1시간)
  res.cookie("id_token", tokens.idToken, {
    httpOnly: false,
    secure: process.env.NODE_ENV === "prod",
    sameSite: "lax", // strict에서 lax로 변경
    maxAge: 60 * 60 * 1000, // 1시간
    path: "/",
    domain: process.env.NODE_ENV === "prod" ? ".crefans.com" : undefined, // 서브도메인 공유
  });

  // Refresh Token 쿠키 설정 (30일)
  res.cookie("refresh_token", tokens.refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "prod",
    sameSite: "lax", // strict에서 lax로 변경
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30일
    path: "/",
    domain: process.env.NODE_ENV === "prod" ? ".crefans.com" : undefined, // 서브도메인 공유
  });
};

export const clearAuthCookies = (res: Response) => {
  res.clearCookie("access_token", {
    path: "/",
    domain: process.env.NODE_ENV === "prod" ? ".crefans.com" : undefined,
  });
  res.clearCookie("id_token", {
    path: "/",
    domain: process.env.NODE_ENV === "prod" ? ".crefans.com" : undefined,
  });
  res.clearCookie("refresh_token", {
    path: "/",
    domain: process.env.NODE_ENV === "prod" ? ".crefans.com" : undefined,
  });
};
