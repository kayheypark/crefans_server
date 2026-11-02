import {LocalMemberService} from '../auth/local/local-member.service';
import {PrismaService} from '../prisma/prisma.service';
import {ConfigService} from '@nestjs/config';
import {requestContext} from './request-context';
import {digest} from '../auth/local/credentials';
import {Body,Controller,Get,Post,Param,Query,Req,UseGuards,HttpCode} from '@nestjs/common';
import {BeansService} from './beans.service';
import {PlatformAuthGuard} from './platform-auth.guard';
import {PlatformAdminGuard} from './admin.controller';
import {Permit} from './admin-permissions';
@Controller() @UseGuards(PlatformAuthGuard)
export class BeansController {
 constructor(private beans:BeansService){}
 @Get('beans/wallet') wallet(@Req() r:any,@Query() query:any){return this.beans.wallet(r.user.sub,query.page,query);}
 @Post('beans/charges') create(@Req() r:any,@Body() b:any){return this.beans.createCharge(r.user.sub,b);}
 @Get('beans/charges/:id') charge(@Req() r:any,@Param('id') id:string){return this.beans.charge(r.user.sub,id);}
 @Post('beans/charges/:id/payment-window') window(@Req() r:any,@Param('id') id:string,@Body() b:any){return this.beans.paymentWindow(r.user.sub,id,b?.paymentTerms??null);}
 @Get('beans/charges/:id/refund-quote') refundQuote(@Req() r:any,@Param('id') id:string){return this.beans.refundQuote(r.user.sub,id);}
 @Post('beans/charges/:id/refund') refund(@Req() r:any,@Param('id') id:string,@Body() b:any){return this.beans.refundCharge(r.user.sub,id,b);}
 @Post('beans/charges/:id/confirm') confirm(@Req() r:any,@Param('id') id:string,@Body() b:any){return this.beans.confirm(r.user.sub,id,b);}
 @Post('creators/:id/tips') tip(@Req() r:any,@Param('id') id:string,@Body() b:any){return this.beans.tip(r.user.sub,id,b);}
 @Get('beans/tips') tips(@Req() r:any,@Query() query:any){return this.beans.tips(r.user.sub,false,query.page,query);}
 @Get('studio/bean-finance') studio(@Req() r:any,@Query('page') page:string){return this.beans.studio(r.user.sub,page);}
 @Get('studio/tips') received(@Req() r:any,@Query('page') page:string){return this.beans.tips(r.user.sub,true,page);}
 @Post('studio/bean-withdrawal-quotes') review(@Req() r:any,@Body() b:any){return this.beans.review(r.user.sub,b);}
 @Post('studio/bean-withdrawals/verify') verify(@Req() r:any,@Body() b:any){return this.beans.authorize(r.user.sub,b);}
 @Post('studio/bean-withdrawals') withdraw(@Req() r:any,@Body() b:any){return this.beans.requestPayout(r.user.sub,b);}
}
@Controller('admin/beans') @UseGuards(PlatformAdminGuard)
export class BeansAdminController {
 constructor(private beans:BeansService){}
 @Get('overview') @Permit(['beans','view']) overview(@Req() r:any,@Query('page') page:string){return this.beans.adminData(r.admin,page);}
 @Get('wallets/:id') @Permit(['beans','view']) wallet(@Req() r:any,@Param('id') id:string,@Query('page') page:string){return this.beans.adminWallet(r.admin,id,page);}
 @Post('promotions') @Permit(['beans','create']) grant(@Req() r:any,@Body() b:any){return this.beans.grant(r.admin,b);}
 @Post('charges/:id/receipt') @Permit(['beans','create']) receipt(@Req() r:any,@Param('id') id:string,@Body() b:any){return this.beans.receipt(r.admin,id,b);}
 // Company-fault refunds (waived:true) skip the 10% deduction after 7 days; the reason is kept with the refund movement.
 @Post('charges/:id/refund') @Permit(['beans','update']) refund(@Req() r:any,@Param('id') id:string,@Body() b:any){return this.beans.refundCharge(null,id,b,r.admin);}
 @Get('receivables') @Permit(['beans','view']) receivables(@Req() r:any){return this.beans.receivables(r.admin);}
 @Post('receivables/:id/settle') @Permit(['beans','update']) settle(@Req() r:any,@Param('id') id:string,@Body() b:any){return this.beans.settleReceivable(r.admin,id,b);}
 @Post('withdrawals/:id/approve') @Permit(['beans','update']) async approve(@Req() r:any,@Param('id') id:string){await this.beans.payout(id,r.admin);return{message:'은행 지급 상태를 확인했습니다.'};}
 @Post('withdrawals/:id/manual-result') @Permit(['beans','update']) manualResult(@Req() r:any,@Param('id') id:string,@Body() b:any){return this.beans.manualResult(r.admin,id,b);}
 @Post('withdrawals/:id/reject') @Permit(['beans','update']) reject(@Req() r:any,@Param('id') id:string,@Body() b:any){return this.beans.rejectPayout(r.admin,id,b);}
}

@Controller('beans')
export class BeanWebhookController {
 constructor(private db:PrismaService,private limiter:LocalMemberService,private config:ConfigService){}
 @Post('webhook') @HttpCode(200) async webhook(@Req() r:any,@Body() b:any){
  await this.limiter.limit('beans-webhook:'+digest(requestContext.getStore()?.ip||r.socket?.remoteAddress||'unknown'),30,60);
  const id=b?.data?.orderId;if(this.config.get('BEAN_LEDGER_ENABLED')==='true'&&typeof id==='string'&&/^[a-f0-9-]{36}$/.test(id))await this.db.beanCharge.updateMany({where:{id,status:{in:['pending','processing','paid']}},data:{updated_at:new Date(0)}});
  // Untrusted webhook content only schedules authenticated provider lookup by the worker.
  return{received:true};
 }
}
