import {Body,Controller,Get,Param,Post,Put,Query,Req,UseGuards} from '@nestjs/common';
import {BankTransferService} from './bank-transfer';
import {PlatformAuthGuard} from './platform-auth.guard';
import {PlatformAdminGuard} from './admin.controller';
import {Permit} from './admin-permissions';

// 2026-11-16 bank transfer (무통장입금): checkout methods and deposit instructions for members; deposit confirmation, cash receipts and
// manual refunds for operators (menu 'deposits').
@Controller('payments') @UseGuards(PlatformAuthGuard)
export class BankTransferController{
 constructor(private transfers:BankTransferService){}
 @Get('methods') methods(){return this.transfers.methods();}
 @Get('bank-transfer/:kind/:orderId') instructions(@Req() r:any,@Param('kind') kind:string,@Param('orderId') id:string){return this.transfers.forMember(r.user.sub,kind,id);}
 @Post('bank-transfer/:kind/:orderId/deposited') deposited(@Req() r:any,@Param('kind') kind:string,@Param('orderId') id:string){return this.transfers.reportDeposit(r.user.sub,kind,id);}
}
@Controller('admin/bank-transfer') @UseGuards(PlatformAdminGuard)
export class BankTransferAdminController{
 constructor(private transfers:BankTransferService){}
 @Get('account') @Permit(['deposits','view']) account(){return this.transfers.adminAccount();}
 @Put('account') @Permit(['deposits','update']) saveAccount(@Req() r:any,@Body() b:any){return this.transfers.saveAccount(r.admin,b);}
 @Get('payments') @Permit(['deposits','view']) list(@Query() q:any){return this.transfers.list(q);}
 @Post('payments/:id/confirm') @Permit(['deposits','update']) confirm(@Req() r:any,@Param('id') id:string,@Body() b:any){return this.transfers.confirm(r.admin,id,b);}
 @Post('payments/:id/cancel') @Permit(['deposits','update']) cancel(@Req() r:any,@Param('id') id:string,@Body() b:any){return this.transfers.adminCancel(r.admin,id,b);}
 @Post('payments/:id/cash-receipt/reveal') @Permit(['deposits','update']) reveal(@Req() r:any,@Param('id') id:string){return this.transfers.revealCashReceipt(r.admin,id);}
 @Post('payments/:id/cash-receipt') @Permit(['deposits','update']) cashReceipt(@Req() r:any,@Param('id') id:string,@Body() b:any){return this.transfers.recordCashReceipt(r.admin,id,b);}
 @Get('refunds') @Permit(['deposits','view']) refunds(@Query() q:any){return this.transfers.refunds(q);}
 @Post('refunds/:id/account/reveal') @Permit(['deposits','update']) revealAccount(@Req() r:any,@Param('id') id:string){return this.transfers.revealRefundAccount(r.admin,id);}
 @Post('refunds/:id/complete') @Permit(['deposits','update']) complete(@Req() r:any,@Param('id') id:string,@Body() b:any){return this.transfers.completeRefund(r.admin,id,b);}
 @Post('refunds/:id/reject') @Permit(['deposits','update']) rejectRefund(@Req() r:any,@Param('id') id:string,@Body() b:any){return this.transfers.rejectRefund(r.admin,id,b);}
}
