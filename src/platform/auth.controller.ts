import {Body,Controller,Post,Req,Res} from '@nestjs/common';
import {Response} from 'express';
import {ConfigService} from '@nestjs/config';
import {PlatformAuthService} from './auth.service';
import {LocalMemberService} from '../auth/local/local-member.service';
import {setAuthCookies,clearAuthCookies} from '../auth/utils/cookie.util';
@Controller('auth')
export class PlatformAuthController {
 constructor(private auth:PlatformAuthService,private local:LocalMemberService,private config:ConfigService){}
 @Post('signup/email/request') request(@Body() body:any){return this.auth.requestCode(body.email);}
 @Post('signup/email/verify') verify(@Body() body:any){return this.auth.verifyCode(body);}
 @Post('identity') identity(){return this.auth.identity();}
 @Post('signup') signup(@Body() body:any){return this.auth.signup(body);}
 @Post('login') async login(@Body() body:any,@Res({passthrough:true}) res:Response){const tokens=await this.auth.login(body);setAuthCookies(res,tokens,this.config);return{message:'로그인했습니다.'};}
 @Post('logout') async logout(@Req() req:any,@Res({passthrough:true}) res:Response){await this.auth.logout(req.cookies?.access_token,req.cookies?.refresh_token);clearAuthCookies(res,this.config);return{message:'로그아웃했습니다.'};}
 @Post('refresh') async refresh(@Req() req:any,@Res({passthrough:true}) res:Response){try{const tokens=await this.local.refreshToken(req.cookies?.refresh_token);setAuthCookies(res,tokens,this.config);return{message:'세션을 갱신했습니다.'};}catch(error){clearAuthCookies(res,this.config);throw error;}}
 @Post('forgot-password') forgot(@Body() body:any){return this.local.forgotPassword(body.email);}
 @Post('reset-password') reset(@Body() body:any){return this.local.resetPassword(body.email,body.code,body.password);}
}
