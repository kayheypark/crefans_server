import {PrismaService} from "../../prisma/prisma.service";
import {observeAudit} from "../../platform/audit";
import {randomUUID} from "node:crypto";
import { Injectable, Optional } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createTransport, Transporter } from "nodemailer";
import { codeMail, CodePurpose, noticeMail, noticeCopy, marketingMail } from "./mail/templates";

@Injectable()
export class MemberMailService {
  private transport: Transporter;
  constructor(private config: ConfigService, @Optional() private db?:PrismaService) {}
  async sendCode(email: string, code: string, purpose: CodePurpose) {
    return this.send(email,codeMail(code,purpose),purpose);
  }
  async sendNotice(email:string,kind:keyof typeof noticeCopy,rows:Array<[string,string]>,url:string,note:string,id:string){
    return this.send(email,noticeMail(kind,rows,url,note),kind,id);
  }
  async sendMarketing(email:string,subject:string,body:string,url:string,advertisement:boolean,id:string){
    return this.send(email,marketingMail(subject,body,url,advertisement),advertisement?'marketing-campaign':'marketing-notice',id);
  }
  private async send(email:string,message:ReturnType<typeof codeMail>,purpose:string,messageId:string=randomUUID()){
    const attemptId=randomUUID(),start=Date.now();
    await observeAudit(this.db,{category:'mail',action:'mail.attempt',entityId:attemptId,data:{attemptId,purpose,provider:'smtp'}});
    try {
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
    const result=await this.transport.sendMail({ from, to: email, ...message, messageId:`<${messageId}@mail.crefans.com>` });
    if(!result.accepted?.length||result.rejected?.length)throw new Error('SMTP recipient not accepted');
    // Recipient lists and SMTP response text can contain addresses; retain counts and status only.
    await observeAudit(this.db,{category:'mail',action:'mail.result',entityId:attemptId,durationMs:Date.now()-start,data:{attemptId,purpose,provider:'smtp',outcome:'accepted',messageId:String(result.messageId||'').replace(/[<>]/g,''),acceptedCount:result.accepted?.length||0,rejectedCount:result.rejected?.length||0}});
    }catch(error){await observeAudit(this.db,{category:'mail',action:'mail.result',level:'error',entityId:attemptId,durationMs:Date.now()-start,data:{attemptId,purpose,provider:'smtp',outcome:'failed',providerCode:error?.code,smtpStatus:error?.responseCode}});throw error;}
  }
}
