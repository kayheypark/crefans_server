import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpStatus,
  HttpCode,
  Res,
  StreamableFile,
} from "@nestjs/common";
import { MediaService } from "./media.service";
import {
  CreateMediaDto,
  CompleteUploadDto,
  MediaProcessingWebhookDto,
} from "./dto/media.dto";
import { AuthGuard } from "../common/guards/auth.guard";
import { OptionalAuthGuard } from "../common/guards/optional-auth.guard";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Logger } from "@nestjs/common";
import { Response } from "express";
import { MediaStreamUtil } from "../common/utils/media-stream.util";

type CurrentUserType = {
  userSub: string;
  email: string;
  username?: string;
  accessToken?: string;
};

@Controller("media")
export class MediaController {
  private readonly logger = new Logger(MediaController.name);

  constructor(private readonly mediaService: MediaService) {}

  @UseGuards(AuthGuard)
  @Post("prepare-upload")
  async prepareUpload(@Request() req, @Body() createMediaDto: CreateMediaDto) {
    const userSub = req.user.sub;

    this.logger.log(`Preparing upload for user: ${userSub}`);

    const result = await this.mediaService.createMedia(userSub, createMediaDto);

    return {
      success: true,
      data: result,
    };
  }

  @UseGuards(AuthGuard)
  @Post("complete-upload")
  async completeUpload(
    @Request() req,
    @Body() completeUploadDto: CompleteUploadDto
  ) {
    const userSub = req.user.sub;

    this.logger.log(
      `Completing upload for user: ${userSub}, media: ${completeUploadDto.mediaId}`
    );

    const media = await this.mediaService.completeUpload(
      userSub,
      completeUploadDto
    );

    return {
      success: true,
      data: media,
    };
  }

  @UseGuards(AuthGuard)
  @Get("my-media")
  async getMyMedia(
    @Request() req,
    @Query("limit") limit: string = "20",
    @Query("offset") offset: string = "0"
  ) {
    const userSub = req.user.sub;
    const limitNum = parseInt(limit, 10);
    const offsetNum = parseInt(offset, 10);

    const media = await this.mediaService.getUserMedia(
      userSub,
      limitNum,
      offsetNum
    );

    return {
      success: true,
      data: media,
    };
  }

  @UseGuards(AuthGuard)
  @Get(":mediaId")
  async getMedia(@Request() req, @Param("mediaId") mediaId: string) {
    const userSub = req.user.sub;

    const media = await this.mediaService.getMedia(mediaId, userSub);

    return {
      success: true,
      data: media,
    };
  }

  @UseGuards(AuthGuard)
  @Get(":mediaId/status")
  async getProcessingStatus(@Request() req, @Param("mediaId") mediaId: string) {
    const userSub = req.user.sub;

    const status = await this.mediaService.getProcessingStatus(
      mediaId,
      userSub
    );

    return {
      success: true,
      data: status,
    };
  }

  // MediaConvert 웹훅 엔드포인트 (인증 없음)
  @Post("processing-webhook")
  @HttpCode(HttpStatus.OK)
  async handleProcessingWebhook(@Body() webhookDto: MediaProcessingWebhookDto) {
    this.logger.log(
      `Processing webhook received: ${webhookDto.jobId}, status: ${webhookDto.status}`
    );

    await this.mediaService.handleProcessingWebhook(
      webhookDto.jobId,
      webhookDto.status,
      webhookDto.progress,
      webhookDto.mediaId,
      webhookDto.userSub,
      webhookDto.duration
    );

    return { success: true };
  }

  // 동적 미디어 프록시 - Option 3 구현
  @UseGuards(OptionalAuthGuard)
  @Get("stream/:mediaId")
  async streamMedia(
    @Param("mediaId") mediaId: string,
    @Query("quality") quality?: string,
    @CurrentUser() user?: CurrentUserType,
    @Res() res?: Response
  ) {
    return this.mediaService.streamMedia(mediaId, quality, user?.userSub, res);
  }

  // 공개 미디어 조회 (게시글에서 사용) - 레거시 호환성
  @Get("public/:mediaId")
  async getPublicMedia(@Param("mediaId") mediaId: string) {
    const media = await this.mediaService.getMedia(mediaId);

    // 완료된 미디어만 공개
    if (media.processing_status !== "COMPLETED") {
      return {
        success: false,
        error: "Media is not ready",
      };
    }

    // processedUrls와 thumbnailUrls를 /media/stream 프록시로 변환
    const processedUrls = MediaStreamUtil.convertProcessedUrlsToStreamProxy(
      mediaId,
      media.processed_urls
    );
    const thumbnailUrls = MediaStreamUtil.convertThumbnailUrlsToStreamProxy(
      mediaId,
      media.thumbnail_urls
    );

    return {
      success: true,
      data: {
        id: media.id,
        processing_status: media.processing_status,
        processed_urls: processedUrls,
        thumbnail_urls: thumbnailUrls,
        metadata: media.metadata,
      },
    };
  }

}
