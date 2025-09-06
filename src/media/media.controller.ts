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
} from "@nestjs/common";
import { MediaService } from "./media.service";
import {
  CreateMediaDto,
  CompleteUploadDto,
  MediaProcessingWebhookDto,
} from "./dto/media.dto";
import { AuthGuard } from "@nestjs/passport";
import { Logger } from "@nestjs/common";

@Controller("media")
export class MediaController {
  private readonly logger = new Logger(MediaController.name);

  constructor(private readonly mediaService: MediaService) {}

  //TODO: 가드 JWT 개발 후 미디어 업로드 정상 작동 확인하기 (S3 버킷에 업로드되는지)
  @UseGuards(AuthGuard("jwt"))
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

  @UseGuards(AuthGuard("jwt"))
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

  @UseGuards(AuthGuard("jwt"))
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

  @UseGuards(AuthGuard("jwt"))
  @Get(":mediaId")
  async getMedia(@Request() req, @Param("mediaId") mediaId: string) {
    const userSub = req.user.sub;

    const media = await this.mediaService.getMedia(mediaId, userSub);

    return {
      success: true,
      data: media,
    };
  }

  @UseGuards(AuthGuard("jwt"))
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
      webhookDto.progress
    );

    return { success: true };
  }

  // 공개 미디어 조회 (게시글에서 사용)
  @Get("public/:mediaId")
  async getPublicMedia(@Param("mediaId") mediaId: string) {
    const media = await this.mediaService.getMedia(mediaId);

    // 완료된 미디어만 공개
    if (media.status !== "completed") {
      return {
        success: false,
        error: "Media is not ready",
      };
    }

    return {
      success: true,
      data: {
        id: media.id,
        status: media.status,
        versions: media.versions,
        thumbnails: media.thumbnails,
        metadata: media.metadata,
      },
    };
  }
}
