import {Body,Controller,Get,Param,Post,Put,Req,UseGuards} from '@nestjs/common';
import {PlatformAuthGuard} from './platform-auth.guard';
import {PlatformFinanceService} from './finance.service';
@Controller() @UseGuards(PlatformAuthGuard)
export class PlatformFinanceController {
 constructor(private finance:PlatformFinanceService){}
 @Get('billing/config') config(@Req() r:any){return this.finance.billingConfig(r.user.sub);}
 @Post('billing/registrations') registration(@Body() b:any,@Req() r:any){return this.finance.startRegistration(r.user.sub,b);}
 @Post('billing/methods') method(@Body() b:any,@Req() r:any){return this.finance.addMethod(r.user.sub,b);}
 @Put('billing/methods/:id') methodState(@Param('id') id:string,@Body('operation') op:string,@Req() r:any){return this.finance.method(r.user.sub,id,op);}
 @Post('checkout') checkout(@Body() b:any,@Req() r:any){return this.finance.createOrder(r.user.sub,b);}
 @Get('checkout/:id') order(@Param('id') id:string,@Req() r:any){return this.finance.order(r.user.sub,id);}
 @Post('checkout/:id/retry') retry(@Param('id') id:string,@Req() r:any){return this.finance.retryPayment(r.user.sub,id);}
 @Post('checkout/:id/payment-window') window(@Param('id') id:string,@Body() b:any,@Req() r:any){return this.finance.paymentWindow(r.user.sub,id,b?.paymentTerms??null);}
 @Post('checkout/:id/confirm') confirm(@Param('id') id:string,@Body() b:any,@Req() r:any){return this.finance.confirmPayment(r.user.sub,id,b);}
 @Post('checkout/:id/pay') pay(@Param('id') id:string,@Body('methodId') method:string,@Body('paymentTerms') terms:unknown,@Req() r:any){return this.finance.pay(r.user.sub,id,method,undefined,terms??null);}
 @Post('subscriptions/:creator/cancel') cancel(@Param('creator') id:string,@Req() r:any){return this.finance.cancelSubscription(r.user.sub,id);}
 @Get('checkout/:id/refund-eligibility') refundEligibility(@Param('id') id:string,@Req() r:any){return this.finance.refundEligibility(r.user.sub,id);}
 @Post('checkout/:id/refund') refund(@Param('id') id:string,@Req() r:any){return this.finance.refund(r.user.sub,id);}
 @Get('studio/finance') financeData(@Req() r:any){return this.finance.finance(r.user.sub);}
 @Post('studio/accounts') account(@Body() b:any,@Req() r:any){return this.finance.account(r.user.sub,b);}
 @Post('studio/accounts/:id/verify') verifyAccount(@Param('id') id:string,@Req() r:any){return this.finance.verifyAccount(r.user.sub,id);}
 @Put('studio/accounts/:id/default') defaultAccount(@Param('id') id:string,@Req() r:any){return this.finance.defaultAccount(r.user.sub,id);}
 @Post('studio/pin') pin(@Body() body:any,@Req() r:any){return this.finance.setupPin(r.user.sub,body.pin,body.identityProof);}
 @Post('studio/withdraw/review') review(@Body() b:any,@Req() r:any){return this.finance.review(r.user.sub,b);}
 @Post('studio/withdraw/verify') verifyPin(@Body() b:any,@Req() r:any){return this.finance.verifyPin(r.user.sub,b);}
 @Post('studio/withdraw') withdraw(@Body() b:any,@Req() r:any){return this.finance.requestWithdrawal(r.user.sub,b);}
}
