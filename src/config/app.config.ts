import { registerAs } from "@nestjs/config";

export default registerAs("app", () => ({
  port: parseInt(process.env.PORT, 10) || 3001,
  nodeEnv: process.env.NODE_ENV || "development",
  isProduction:
    process.env.NODE_ENV === "prod" || process.env.NODE_ENV === "production",
  cors: {
    origins: [
      "http://localhost:3000",
      "http://localhost:3001",
      "https://crefans.com",
      "https://www.crefans.com",
      "https://api.crefans.com",
    ],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "Accept",
      "Origin",
      "X-Requested-With",
      "Cookie",
      "Set-Cookie",
    ],
    exposedHeaders: ["Set-Cookie", "Authorization"],
    credentials: true,
    preflightContinue: false,
    optionsSuccessStatus: 204,
  },
  cookie: {
    domain: process.env.NODE_ENV === "prod" ? ".crefans.com" : undefined,
    secure: process.env.NODE_ENV === "prod",
    sameSite: "lax" as const,
  },
}));
