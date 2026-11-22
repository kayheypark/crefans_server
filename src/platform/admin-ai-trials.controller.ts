import {Body,Controller,Get,Header,Param,Post,Query,Req,Res,UseGuards} from '@nestjs/common';
import {ConfigService} from '@nestjs/config';
import {join,resolve} from 'node:path';
import {pipeline} from 'node:stream/promises';
import {Readable} from 'node:stream';
import {PlatformAdminGuard} from './admin.controller';
import {Permit} from './admin-permissions';
import {PlatformService} from './service';
import {PlatformMediaStorage,managedMediaKey} from './media-storage';
import {reject} from './http';
import {aiTrialDetail,aiTrialMedia,listAiTrials,setTrialFavorite} from './admin-ai-trials';
import {listReviews} from './ai-photo-reviews';

// 2026-11-20 user request: console "AI 체험관리" (members.view). Photos are streamed only through this route, never as public URLs.
@Controller('admin') @UseGuards(PlatformAdminGuard)
export class AiTrialsAdminController {
 constructor(private service:PlatformService,private config:ConfigService,private storage:PlatformMediaStorage){}
// 2026-11-21 user request: AI photo reviews in the same console menu.
 @Get('ai-photo-reviews') @Header('Cache-Control','private, no-store') @Permit(['members','view']) reviews(@Query() query:any){return listReviews(this.service.db,query);}
 @Get('ai-trials') @Header('Cache-Control','private, no-store') @Permit(['members','view']) list(@Query() query:any,@Req() req:any){return listAiTrials(this.service.db,req.admin,query);}
 // 2026-11-22: per-operator star (members.view; personal, not a business change).
 @Post('ai-trials/:id/favorite') @Permit(['members','view']) favorite(@Param('id') id:string,@Body() body:any,@Req() req:any){return setTrialFavorite(this.service.db,req.admin,id,body?.favorite);}
 @Get('ai-trials/:id') @Header('Cache-Control','private, no-store') @Permit(['members','view']) detail(@Param('id') id:string,@Req() req:any){return aiTrialDetail(this.service.db,req.admin,id,this.config);}
 @Get('ai-trials/:id/media/:mediaId') @Permit(['members','view'])
 async media(@Param('id') id:string,@Param('mediaId') mediaId:string,@Req() req:any,@Res() res:any){
  const m=await aiTrialMedia(this.service.db,req.admin,id,mediaId);
  res.setHeader('Cache-Control','private, no-store');res.setHeader('Content-Type',m.mime_type);res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Cross-Origin-Resource-Policy','same-origin');
  if(managedMediaKey(m.s3_upload_key)){
   try{const object=await this.storage.read(m.s3_upload_key);if(object.ContentLength!==undefined)res.setHeader('Content-Length',object.ContentLength);await pipeline(object.Body as Readable,res);}
   catch{if(res.headersSent){res.destroy();return;}reject(503,'STORAGE_UNAVAILABLE','사진을 불러오지 못했습니다.');}
   return;
  }
  if(m.s3_upload_key.startsWith('local/'))return res.sendFile(join(resolve(this.config.get('MEDIA_ROOT')||'.local/media'),m.file_name));
  reject(404,'MEDIA_NOT_FOUND','사진을 찾을 수 없어요.');
 }
}
