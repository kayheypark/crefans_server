import { Module } from '@nestjs/common';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';
import { S3Service } from './s3.service';
import { MediaConvertService } from './media-convert.service';

@Module({
  controllers: [MediaController],
  providers: [MediaService, S3Service, MediaConvertService],
  exports: [MediaService, S3Service, MediaConvertService],
})
export class MediaModule {}