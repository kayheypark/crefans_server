import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createTransport, Transporter } from "nodemailer";

@Injectable()
export class MemberMailService {
  private transport: Transporter;
  constructor(private config: ConfigService) {}
  async sendCode(email: string, code: string, purpose: string) {
    if (this.config.get("MEMBER_MAIL_PROVIDER") !== "smtp")
      throw new Error("Local member email requires MEMBER_MAIL_PROVIDER=smtp");
    const host = this.config.get<string>("SMTP_HOST");
    const from = this.config.get<string>("SMTP_FROM");
    if (!host || !from) throw new Error("SMTP_HOST and SMTP_FROM are required");
    if (!this.transport) {
      const local = ["127.0.0.1", "localhost", "::1", "mailpit"].includes(host);
      this.transport = createTransport({
        host, port: Number(this.config.get("SMTP_PORT") || 587),
        secure: this.config.get("SMTP_SECURE") === "true",
        requireTLS: !local,
        auth: this.config.get("SMTP_USER") ? {
          user: this.config.get("SMTP_USER"), pass: this.config.get("SMTP_PASSWORD"),
        } : undefined,
        connectionTimeout: 10000, socketTimeout: 15000,
        disableFileAccess: true, disableUrlAccess: true,
      });
    }
    await this.transport.sendMail({ from, to: email,
      subject: purpose === "reset" ? "CREFANS 비밀번호 재설정" : "CREFANS 이메일 인증",
      text: `인증 코드: ${code}\n10분 안에 입력해주세요. 요청하지 않았다면 무시해주세요.`,
    });
  }
}
