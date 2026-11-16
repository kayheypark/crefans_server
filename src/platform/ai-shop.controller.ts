import {LocalMemberService} from '../auth/local/local-member.service';
import {digest} from '../auth/local/credentials';
import {requestContext} from './request-context';
import {Body,Controller,Delete,Get,Header,HttpCode,Param,Post,Put,Query,Req,UseGuards} from '@nestjs/common';
import {PlatformAuthGuard} from './platform-auth.guard';
import {PlatformAdminGuard} from './admin.controller';
import {Permit} from './admin-permissions';
import {AiShopService,productView,orderView,AI_SHOP_MIN_UNIT_KRW} from './ai-shop';
import {AiSubscriptionService} from './ai-subscription';
import {PlatformService} from './service';
import {reject,text} from './http';
import {appendAudit,contentDigest} from './audit';
@Controller('studio/shop') @UseGuards(PlatformAuthGuard)
export class AiShopController{
 constructor(private shop:AiShopService,private aiSubscriptions:AiSubscriptionService){}
 @Get('products') products(@Req() r:any){return this.shop.catalog(r.user.sub);}
 @Get('orders') orders(@Req() r:any){return this.shop.orders(r.user.sub);}
 @Get('orders/:id') async order(@Req() r:any,@Param('id') id:string){return orderView(await this.shop.order(r.user.sub,id));}
 @Post('orders') create(@Req() r:any,@Body() b:any){return this.shop.create(r.user.sub,b);}
 @Post('orders/:id/payment-window') window(@Req() r:any,@Param('id') id:string){return this.shop.window(r.user.sub,id);}
 @Post('orders/:id/confirm') confirm(@Req() r:any,@Param('id') id:string,@Body() b:any){return this.shop.confirm(r.user.sub,id,b);}
 @Post('orders/:id/refund') refund(@Req() r:any,@Param('id') id:string,@Body() b:any){return this.shop.refund(r.user.sub,id,b);}
 // 2026-11-16 AI 이용권 구독형 (monthly card billing). Shows 'payment preparing' until the PG contract keys are configured.
 @Get('subscriptions') subscriptions(@Req() r:any){return this.aiSubscriptions.list(r.user.sub);}
 @Post('subscriptions') subscribe(@Req() r:any,@Body() b:any){return this.aiSubscriptions.start(r.user.sub,b);}
 @Post('subscriptions/:id/cancel') cancelSubscription(@Req() r:any,@Param('id') id:string){return this.aiSubscriptions.cancel(r.user.sub,id);}
 @Post('subscriptions/:id/refund') refundSubscription(@Req() r:any,@Param('id') id:string){return this.aiSubscriptions.refund(r.user.sub,id);}
}
@Controller('admin/shop') @UseGuards(PlatformAdminGuard)
export class AiShopAdminController{
 constructor(private service:PlatformService){}
 @Get('products') @Permit(['shop','view']) async products(){return{items:(await this.service.db.aiShopProduct.findMany({where:{deleted_at:null},orderBy:{created_at:'desc'},take:100})).map(productView)};}
 @Post('products') @Permit(['shop','create']) create(@Body() b:any){return this.save(undefined,b);}
 @Put('products/:id') @Permit(['shop','update']) update(@Param('id') id:string,@Body() b:any){return this.save(id,b);}
 private async save(id:string|undefined,b:any){if(!b||!Number.isSafeInteger(b.amount)||b.amount<100||b.amount>1000000||!Number.isSafeInteger(b.quantity)||b.quantity<1||b.quantity>10000||b.amount%b.quantity!==0||!Number.isSafeInteger(b.validityDays)||b.validityDays<1||b.validityDays>3650||typeof b.visible!=='boolean'||typeof b.onSale!=='boolean'||!['pack','subscription'].includes(b.kind??'pack'))reject(400,'INVALID_PRODUCT','금액·수량·유효기간을 확인해 주세요. 1회 단가는 원 단위 정수여야 합니다.');
  // 2026-11-16 loss guard: the price per generation must cover the worst-case provider cost, VAT and PG fee (AI_SHOP_MIN_UNIT_KRW).
  if(b.amount/b.quantity<AI_SHOP_MIN_UNIT_KRW)reject(400,'PRICE_BELOW_COST',`1회 단가가 ${AI_SHOP_MIN_UNIT_KRW}원보다 낮으면 원가·수수료를 넘지 못해 저장할 수 없어요.`);
  if((b.kind??'pack')==='subscription'&&b.validityDays!==30)reject(400,'INVALID_PRODUCT','구독형은 이용 기간을 30일(한 달)로 정해요.');
  const data={kind:b.kind??'pack',name:text(b.name,100),description:text(b.description,3000),amount:b.amount,quantity:b.quantity,validity_days:b.validityDays,visible:b.visible,on_sale:b.onSale};return this.service.db.$transaction(async tx=>{if(id)await tx.$queryRaw`SELECT id FROM ai_shop_products WHERE id=${id} FOR UPDATE`;const old=id?await tx.aiShopProduct.findUnique({where:{id}}):null;if(id&&(!old||old.deleted_at))reject(404,'PRODUCT_NOT_FOUND','상품을 찾을 수 없습니다.');if(old&&b.version!==old.version)reject(409,'PRODUCT_CHANGED','다른 운영자가 변경했습니다. 다시 불러와 주세요.');const p=old?await tx.aiShopProduct.update({where:{id},data:{...data,version:{increment:1}}}):await tx.aiShopProduct.create({data});await appendAudit(tx,{category:'admin',action:old?'admin.shop_product_updated':'admin.shop_product_created',entityId:p.id,data:{amount:p.amount,count:p.quantity,after:{version:p.version,contentHash:contentDigest(data)}}});return productView(p);});}
 @Delete('products/:id') @Permit(['shop','delete']) async remove(@Param('id') id:string,@Body() b:any){return this.service.db.$transaction(async tx=>{await tx.$queryRaw`SELECT id FROM ai_shop_products WHERE id=${id} FOR UPDATE`;const p=await tx.aiShopProduct.findUnique({where:{id}});if(!p)reject(404,'PRODUCT_NOT_FOUND','상품이 없습니다.');if(p.version!==b?.version)reject(409,'PRODUCT_CHANGED','상품을 다시 불러와 주세요.');await tx.aiShopProduct.update({where:{id},data:{deleted_at:new Date(),visible:false,on_sale:false,version:{increment:1}}});await appendAudit(tx,{category:'admin',action:'admin.shop_product_archived',entityId:id,data:{before:{version:p.version}}});return{message:'상품을 삭제했습니다. 기존 구매 조건과 이력은 보존됩니다.'};});}
 @Get('orders') @Permit(['shop','view']) async orders(@Query() q:any){const page=Number(q.page||1);if(!Number.isSafeInteger(page)||page<1||page>10000)reject(400,'INVALID_QUERY','페이지를 확인해 주세요.');const where=q.status?{status:String(q.status)}:{};return{items:(await this.service.db.aiShopOrder.findMany({where,orderBy:{created_at:'desc'},skip:(page-1)*20,take:20})).map(o=>({...orderView(o),creatorId:o.creator_id,productId:o.product_id,failureCode:o.failure_code})),total:await this.service.db.aiShopOrder.count({where}),page};}
 @Get('orders/:id') @Permit(['shop','view']) async order(@Param('id') id:string){const o=await this.service.db.aiShopOrder.findUnique({where:{id}});if(!o)reject(404,'SHOP_ORDER_NOT_FOUND','주문이 없습니다.');return{...orderView(o),creatorId:o.creator_id,productId:o.product_id,failureCode:o.failure_code,terms:o.terms,uses:await this.service.db.aiShopUse.findMany({where:{order_id:id},orderBy:{created_at:'desc'},take:100,select:{id:true,status:true,created_at:true,updated_at:true}})};}
}

@Controller('shop')
export class AiShopWebhookController {
 constructor(private service:PlatformService,private limiter:LocalMemberService,private shop:AiShopService,private aiSubscriptions:AiSubscriptionService){}
 // 2026-11-17 user decision: the shop can be browsed without signing in. Only the public product list and whether monthly plans
 // are on sale; buying, orders and subscriptions stay behind the member session (studio/shop).
 @Get('products') @Header('Cache-Control','no-store') async publicCatalog(){return{products:await this.shop.publicCatalog(),subscriptionsAvailable:this.aiSubscriptions.available()};}
 @Post('webhook') @HttpCode(200) async webhook(@Req() r:any,@Body() b:any){await this.limiter.limit('shop-webhook:'+digest(requestContext.getStore()?.ip||r.socket?.remoteAddress||'unknown'),30,60);const id=b?.data?.orderId;if(typeof id==='string'&&/^[a-f0-9-]{36}$/.test(id))await this.service.db.aiShopOrder.updateMany({where:{id,status:{in:['paid','processing','refunding']}},data:{updated_at:new Date(0)}});return{received:true};}
}
