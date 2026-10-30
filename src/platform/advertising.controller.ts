import {Body,Controller,Delete,Get,Param,Post,Put,Query,Req,UseGuards} from '@nestjs/common';
import {PlatformService} from './service';
import {PlatformAuthGuard} from './platform-auth.guard';
import {PlatformAdminGuard} from './admin.controller';
import {Permit} from './admin-permissions';
import {adProductView,saveAdProduct,deleteAdProduct} from './advertising-catalog';
import {reject} from './http';
@Controller('studio/advertising') @UseGuards(PlatformAuthGuard)
export class AdvertisingController {
 constructor(private service:PlatformService){}
 @Get('products') async products(@Req() req:any){await this.service.requireCreator(req.user.sub);return(await this.service.db.adProduct.findMany({where:{deleted_at:null,visible:true},orderBy:[{sort_order:'asc'},{id:'asc'}],take:100})).map(adProductView);}
}
@Controller('admin/advertising') @UseGuards(PlatformAdminGuard)
export class AdvertisingAdminController {
 constructor(private service:PlatformService){}
 @Get('products') @Permit(['advertising','view']) async products(@Query() query:any){const page=Number(query.page||1);if(!Number.isSafeInteger(page)||page<1||page>10000||query.deleted&&!['true','false'].includes(query.deleted))reject(400,'INVALID_QUERY','조회 조건을 확인해주세요.');const where={deleted_at:query.deleted==='true'?{not:null}:null};return{items:(await this.service.db.adProduct.findMany({where,orderBy:[{sort_order:'asc'},{id:'asc'}],take:20,skip:(page-1)*20})).map(adProductView),total:await this.service.db.adProduct.count({where}),page};}
 @Post('products') @Permit(['advertising','create']) create(@Body() body:any){return saveAdProduct(this.service.db,undefined,body);}
 @Put('products/:id') @Permit(['advertising','update']) update(@Param('id') id:string,@Body() body:any){return saveAdProduct(this.service.db,id,body);}
 @Delete('products/:id') @Permit(['advertising','delete']) remove(@Param('id') id:string,@Body() body:any){return deleteAdProduct(this.service.db,id,body);}
}
