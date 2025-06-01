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
    secure: process.env.NODE_ENV === "production", // HTTPS에서만 전송
    sameSite: "strict",
    maxAge: 60 * 60 * 1000, // 1시간
    path: "/",
  });

  // ID Token 쿠키 설정 (1시간)
  res.cookie("id_token", tokens.idToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 60 * 60 * 1000, // 1시간
    path: "/",
  });

  // Refresh Token 쿠키 설정 (30일)
  res.cookie("refresh_token", tokens.refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30일
    path: "/auth/refresh", // refresh 토큰은 refresh 엔드포인트에서만 사용
  });
};

export const clearAuthCookies = (res: Response) => {
  res.clearCookie("access_token", { path: "/" });
  res.clearCookie("id_token", { path: "/" });
  res.clearCookie("refresh_token", { path: "/auth/refresh" });
};
