import {Controller,Get,Post,Query,Res,Req} from '@nestjs/common';
import {MarketingService} from './marketing.service';
import {ok} from './http';
const page=(body:string)=>`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>크레팬스 광고 메일 수신 설정</title><body style="margin:0;font:16px/1.6 sans-serif;background:#f6f7fa;color:#242638"><main style="max-width:440px;margin:15vh auto;padding:28px;background:white;border-radius:16px"><h1 style="font-size:22px">광고 메일 수신 설정</h1>${body}</main></body></html>`;
@Controller('marketing')
export class MarketingController {
 constructor(private marketing:MarketingService){}
 @Get('unsubscribe') confirmation(@Query('token') token:string,@Res() res:any){this.marketing.memberFromToken(token);res.set({'Cache-Control':'no-store','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'"});return res.type('html').send(page('<p>로그인 없이 광고 메일 수신을 중단할 수 있습니다.</p><form method="post"><button style="min-height:44px;padding:10px 20px;border:0;border-radius:8px;background:#2962ff;color:white" name="confirm" value="true">수신거부</button></form>'));}
 @Post('unsubscribe') async unsubscribe(@Query('token') token:string,@Req() req:any,@Res() res:any){res.set({'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});const result=await this.marketing.unsubscribe(token);if(req.get('Accept')?.includes('text/html'))return res.status(201).type('html').send(page(`<p>${result.message}</p>`));return res.status(201).json(ok(result));}
}
