import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../media/s3.service';
import { PostingLikeService } from './posting-like.service';
import {
  CreatePostingDto,
  UpdatePostingDto,
  PostingQueryDto,
  PostingResponse,
  PostingListResponse,
  PostingDetailResponse,
  CreatePostingResponse,
  PostingStatus,
} from './dto/posting.dto';

@Injectable()
export class PostingService {
  constructor(
    private prisma: PrismaService,
    private s3Service: S3Service,
    private postingLikeService: PostingLikeService,
  ) {}

  async createPosting(
    userId: string,
    createPostingDto: CreatePostingDto,
  ): Promise<CreatePostingResponse> {
    const { media_ids, ...postingData } = createPostingDto;

    // 크리에이터 전용 기능 확인
    await this.validateCreatorOnlyFields(userId, postingData);

    // 미디어 ID들이 유효한지 확인
    if (media_ids && media_ids.length > 0) {
      const existingMedias = await this.prisma.media.findMany({
        where: {
          id: { in: media_ids },
          user_sub: userId,
          is_deleted: false,
        },
      });

      if (existingMedias.length !== media_ids.length) {
        throw new BadRequestException('일부 미디어 파일을 찾을 수 없습니다.');
      }
    }

    // 발행 시 발행 일시 설정
    const publishedAt = postingData.status === PostingStatus.PUBLISHED ? new Date() : null;

    const posting = await this.prisma.posting.create({
      data: {
        ...postingData,
        user_sub: userId,
        published_at: publishedAt,
      },
    });

    // 미디어 연결 (미디어 타입과 순서 저장)
    if (media_ids && media_ids.length > 0) {
      // 미디어 정보를 가져와서 타입과 함께 저장
      const mediaList = await this.prisma.media.findMany({
        where: {
          id: { in: media_ids },
          user_sub: userId,
          is_deleted: false,
        },
        select: {
          id: true,
          type: true,
        },
      });

      // media_ids 순서대로 정렬
      const sortedMediaList = media_ids.map((id) => 
        mediaList.find((media) => media.id === id)
      ).filter(Boolean);

      await this.prisma.postingMedia.createMany({
        data: sortedMediaList.map((media, index) => ({
          posting_id: posting.id,
          media_id: media.id,
          sort_order: index,
        })),
      });
    }

    return {
      success: true,
      data: {
        id: posting.id,
        message: '포스팅이 성공적으로 생성되었습니다.',
      },
    };
  }

  async getPostings(queryDto: PostingQueryDto, viewerId?: string): Promise<PostingListResponse> {
    const { page, limit, status, is_membership, user_sub, search } = queryDto;
    const skip = (page - 1) * limit;

    const whereCondition: any = {
      is_deleted: false,
    };

    if (status) {
      whereCondition.status = status;
    }

    if (is_membership !== undefined) {
      whereCondition.is_membership = is_membership;
    }

    if (user_sub) {
      whereCondition.user_sub = user_sub;
    }

    if (search) {
      whereCondition.OR = [
        { title: { contains: search } },
        { content: { contains: search } },
      ];
    }

    const [postings, total] = await Promise.all([
      this.prisma.posting.findMany({
        where: whereCondition,
        include: {
          medias: {
            where: { is_deleted: false },
            include: {
              media: {
                select: {
                  id: true,
                  type: true,
                  original_name: true,
                  s3_upload_key: true,
                  processed_urls: true,
                  thumbnail_urls: true,
                  processing_status: true,
                  duration: true,
                },
              },
            },
            orderBy: { sort_order: 'asc' },
          },
        },
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.posting.count({
        where: whereCondition,
      }),
    ]);

    // 모든 포스팅 ID 수집
    const postingIds = postings.map(posting => posting.id);

    // 좋아요 상태 조회 - TODO: PostingLikeService should be updated to handle string IDs
    const likesStatus = await this.postingLikeService.getPostingLikesStatus(viewerId, postingIds);

    const formattedPostings: PostingResponse[] = await Promise.all(
      postings.map(async (posting) => {
        // Option 3: 동적 미디어 프록시 URL 사용
        const mediasWithUrls = await Promise.all(
          posting.medias.map(async (pm) => {
            // 새로운 미디어 스트리밍 API URL 사용
            const streamUrl = `${process.env.API_BASE_URL || 'http://localhost:3001'}/media/stream/${pm.media.id}`;
            
            // processedUrls를 /media/stream 프록시를 통하도록 변환
            const processedUrls = this.convertUrlsToStreamProxy(pm.media.id, pm.media.processed_urls);
            
            // thumbnailUrls를 /media/stream 프록시를 통하도록 변환
            const thumbnailUrls = this.convertThumbnailUrlsToStreamProxy(pm.media.id, pm.media.thumbnail_urls);

            return {
              id: pm.media.id,
              type: pm.media.type,
              originalName: pm.media.original_name,
              mediaUrl: streamUrl,
              processedUrls,
              thumbnailUrls,
              processingStatus: pm.media.processing_status,
              duration: pm.media.duration,
            };
          })
        );

        return {
          id: posting.id,
          userSub: posting.user_sub,
          title: posting.title,
          content: posting.content,
          status: posting.status as PostingStatus,
          isMembership: posting.is_membership,
          membershipLevel: posting.membership_level,
          publishStartAt: posting.publish_start_at?.toISOString(),
          publishEndAt: posting.publish_end_at?.toISOString(),
          allowIndividualPurchase: posting.allow_individual_purchase,
          individualPurchasePrice: posting.individual_purchase_price ? Number(posting.individual_purchase_price) : undefined,
          isPublic: posting.is_public,
          isSensitive: posting.is_sensitive,
          totalViewCount: posting.total_view_count,
          uniqueViewCount: posting.unique_view_count,
          likeCount: likesStatus[posting.id]?.likeCount || posting.like_count,
          commentCount: posting.comment_count,
          publishedAt: posting.published_at?.toISOString(),
          archivedAt: posting.archived_at?.toISOString(),
          createdAt: posting.created_at.toISOString(),
          updatedAt: posting.updated_at.toISOString(),
          medias: mediasWithUrls,
          isLiked: likesStatus[posting.id]?.isLiked || false,
        };
      })
    );

    return {
      success: true,
      data: {
        postings: formattedPostings,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getPostingById(id: string, viewerId?: string): Promise<PostingDetailResponse> {
    const posting = await this.prisma.posting.findFirst({
      where: {
        id,
        is_deleted: false,
      },
      include: {
        medias: {
          where: { is_deleted: false },
          include: {
            media: {
              select: {
                id: true,
                type: true,
                original_name: true,
                s3_upload_key: true,
                processed_urls: true,
                thumbnail_urls: true,
                processing_status: true,
                duration: true,
              },
            },
          },
          orderBy: { sort_order: 'asc' },
        },
      },
    });

    if (!posting) {
      throw new NotFoundException('포스팅을 찾을 수 없습니다.');
    }

    // 조회수 증가 (viewerId가 있고, 작성자가 아닌 경우)
    if (viewerId && viewerId !== posting.user_sub) {
      await this.incrementViewCount(id, viewerId);
    }

    // 좋아요 상태 조회 - TODO: PostingLikeService should be updated to handle string IDs
    const likesStatus = await this.postingLikeService.getPostingLikesStatus(viewerId, [id] as any);

    // Option 3: 동적 미디어 프록시 URL 사용 
    const mediasWithUrls = await Promise.all(
      posting.medias.map(async (pm) => {
        // 새로운 미디어 스트리밍 API URL 사용
        const streamUrl = `${process.env.API_BASE_URL || 'http://localhost:3001'}/media/stream/${pm.media.id}`;
        
        // processedUrls를 /media/stream 프록시를 통하도록 변환
        const processedUrls = this.convertUrlsToStreamProxy(pm.media.id, pm.media.processed_urls);
        
        // thumbnailUrls를 /media/stream 프록시를 통하도록 변환
        const thumbnailUrls = this.convertThumbnailUrlsToStreamProxy(pm.media.id, pm.media.thumbnail_urls);

        return {
          id: pm.media.id,
          type: pm.media.type,
          originalName: pm.media.original_name,
          mediaUrl: streamUrl,
          processedUrls,
          thumbnailUrls,
          processingStatus: pm.media.processing_status,
          duration: pm.media.duration,
        };
      })
    );

    const formattedPosting: PostingResponse = {
      id: posting.id,
      userSub: posting.user_sub,
      title: posting.title,
      content: posting.content,
      status: posting.status as PostingStatus,
      isMembership: posting.is_membership,
      membershipLevel: posting.membership_level,
      publishStartAt: posting.publish_start_at?.toISOString(),
      publishEndAt: posting.publish_end_at?.toISOString(),
      allowIndividualPurchase: posting.allow_individual_purchase,
      individualPurchasePrice: posting.individual_purchase_price ? Number(posting.individual_purchase_price) : undefined,
      isPublic: posting.is_public,
      isSensitive: posting.is_sensitive,
      totalViewCount: posting.total_view_count,
      uniqueViewCount: posting.unique_view_count,
      likeCount: likesStatus[id]?.likeCount || posting.like_count,
      commentCount: posting.comment_count,
      publishedAt: posting.published_at?.toISOString(),
      archivedAt: posting.archived_at?.toISOString(),
      createdAt: posting.created_at.toISOString(),
      updatedAt: posting.updated_at.toISOString(),
      medias: mediasWithUrls,
      isLiked: likesStatus[id]?.isLiked || false,
    };

    return {
      success: true,
      data: formattedPosting,
    };
  }

  async updatePosting(
    id: string,
    userId: string,
    updatePostingDto: UpdatePostingDto,
  ): Promise<{ success: boolean; message: string }> {
    const existingPosting = await this.prisma.posting.findFirst({
      where: {
        id,
        user_sub: userId,
        is_deleted: false,
      },
    });

    if (!existingPosting) {
      throw new NotFoundException('포스팅을 찾을 수 없거나 수정 권한이 없습니다.');
    }

    const { media_ids, ...postingData } = updatePostingDto;

    // 크리에이터 전용 기능 확인
    await this.validateCreatorOnlyFields(userId, postingData);

    // 발행 상태 변경 시 발행 일시 업데이트
    if (postingData.status === PostingStatus.PUBLISHED && !existingPosting.published_at) {
      postingData['published_at'] = new Date();
    }

    // 보관 상태 변경 시 보관 일시 업데이트
    if (postingData.status === PostingStatus.ARCHIVED && !existingPosting.archived_at) {
      postingData['archived_at'] = new Date();
    }

    await this.prisma.posting.update({
      where: { id },
      data: postingData,
    });

    // 미디어 연결 업데이트
    if (media_ids !== undefined) {
      // 기존 미디어 연결 삭제
      await this.prisma.postingMedia.updateMany({
        where: { posting_id: id },
        data: { is_deleted: true },
      });

      // 새로운 미디어 연결 생성
      if (media_ids.length > 0) {
        const existingMedias = await this.prisma.media.findMany({
          where: {
            id: { in: media_ids },
            user_sub: userId,
            is_deleted: false,
          },
        });

        if (existingMedias.length !== media_ids.length) {
          throw new BadRequestException('일부 미디어 파일을 찾을 수 없습니다.');
        }

        // 미디어 정보를 가져와서 타입과 함께 저장
        const mediaList = await this.prisma.media.findMany({
          where: {
            id: { in: media_ids },
            user_sub: userId,
            is_deleted: false,
          },
          select: {
            id: true,
            type: true,
          },
        });

        // media_ids 순서대로 정렬
        const sortedMediaList = media_ids.map((id) => 
          mediaList.find((media) => media.id === id)
        ).filter(Boolean);

        await this.prisma.postingMedia.createMany({
          data: sortedMediaList.map((media, index) => ({
            posting_id: id,
            media_id: media.id,
            sort_order: index,
          })),
        });
      }
    }

    return {
      success: true,
      message: '포스팅이 성공적으로 수정되었습니다.',
    };
  }

  async deletePosting(
    id: string,
    userId: string,
  ): Promise<{ success: boolean; message: string }> {
    const existingPosting = await this.prisma.posting.findFirst({
      where: {
        id,
        user_sub: userId,
        is_deleted: false,
      },
    });

    if (!existingPosting) {
      throw new NotFoundException('포스팅을 찾을 수 없거나 삭제 권한이 없습니다.');
    }

    await this.prisma.posting.update({
      where: { id },
      data: {
        is_deleted: true,
        deleted_at: new Date(),
      },
    });

    return {
      success: true,
      message: '포스팅이 성공적으로 삭제되었습니다.',
    };
  }

  private async incrementViewCount(postingId: string, viewerId: string): Promise<void> {
    // 이미 조회한 기록이 있는지 확인
    const existingView = await this.prisma.postingView.findFirst({
      where: {
        posting_id: postingId,
        viewer_id: viewerId,
      },
    });

    if (!existingView) {
      // 새로운 조회 기록 생성
      await this.prisma.postingView.create({
        data: {
          posting_id: postingId,
          viewer_id: viewerId,
        },
      });

      // 포스팅의 고유 조회수 증가
      await this.prisma.posting.update({
        where: { id: postingId },
        data: {
          unique_view_count: { increment: 1 },
        },
      });
    }

    // 전체 조회수는 매번 증가
    await this.prisma.posting.update({
      where: { id: postingId },
      data: {
        total_view_count: { increment: 1 },
      },
    });
  }

  private async validateCreatorOnlyFields(
    userId: string,
    postingData: Partial<CreatePostingDto | UpdatePostingDto>,
  ): Promise<void> {
    // 크리에이터 전용 필드들이 설정되었는지 확인
    const hasCreatorOnlyFields = 
      postingData.is_membership ||
      postingData.membership_level ||
      postingData.allow_individual_purchase ||
      postingData.individual_purchase_price !== undefined ||
      postingData.publish_start_at ||
      postingData.publish_end_at ||
      postingData.is_sensitive;

    if (hasCreatorOnlyFields) {
      // 사용자가 크리에이터인지 확인
      const creator = await this.prisma.creator.findFirst({
        where: {
          user_id: userId,
          is_active: true,
        },
      });

      if (!creator) {
        throw new ForbiddenException('크리에이터 전용 기능입니다. 크리에이터로 전환 후 이용해주세요.');
      }
    }
  }

  // 미디어 URL을 공개/비공개에 따라 적절히 생성
  private async generateMediaUrl(
    originalUrl: string,
    s3Key: string,
    isPublic: boolean,
    isMembershipPosting: boolean,
    hasAccess: boolean
  ): Promise<string> {
    // 공개 게시글이거나 멤버십 게시글이지만 접근 권한이 있는 경우
    if (isPublic || (isMembershipPosting && hasAccess)) {
      // S3 signed URL 생성 (7일간 유효)
      return await this.s3Service.getObjectUrl(
        process.env.S3_UPLOAD_BUCKET,
        s3Key
      );
    }
    
    // 권한이 없는 경우 썸네일이나 블러 처리된 URL 반환
    // 현재는 기존 URL 그대로 반환 (추후 썸네일 로직 구현)
    return originalUrl;
  }

  /**
   * processedUrls를 /media/stream 프록시 URL로 변환
   */
  private convertUrlsToStreamProxy(mediaId: string, processedUrls: any): any {
    if (!processedUrls || typeof processedUrls !== 'object') {
      return processedUrls;
    }

    const baseUrl = process.env.API_BASE_URL || 'http://localhost:3001';
    const convertedUrls: any = {};

    // 비디오 품질별 URL 변환
    if (processedUrls['1080p']) {
      convertedUrls['1080p'] = `${baseUrl}/media/stream/${mediaId}?quality=1080p`;
    }
    if (processedUrls['720p']) {
      convertedUrls['720p'] = `${baseUrl}/media/stream/${mediaId}?quality=720p`;
    }
    if (processedUrls['480p']) {
      convertedUrls['480p'] = `${baseUrl}/media/stream/${mediaId}?quality=480p`;
    }
    
    // 기타 품질 레벨 (high, medium, low 등)
    ['high', 'medium', 'low', 'original'].forEach(quality => {
      if (processedUrls[quality]) {
        convertedUrls[quality] = `${baseUrl}/media/stream/${mediaId}?quality=${quality}`;
      }
    });

    return convertedUrls;
  }

  /**
   * thumbnailUrls를 /media/stream 프록시 URL로 변환
   */
  private convertThumbnailUrlsToStreamProxy(mediaId: string, thumbnailUrls: any): any {
    if (!thumbnailUrls || typeof thumbnailUrls !== 'object') {
      return thumbnailUrls;
    }

    const baseUrl = process.env.API_BASE_URL || 'http://localhost:3001';
    const convertedUrls: any = {};

    // 썸네일 인덱스별 URL 변환 (thumb_0, thumb_1, ...)
    Object.keys(thumbnailUrls).forEach(key => {
      if (key.startsWith('thumb_')) {
        convertedUrls[key] = `${baseUrl}/media/stream/${mediaId}?quality=thumbnail`;
      } else {
        // 기타 썸네일 관련 필드
        convertedUrls[key] = `${baseUrl}/media/stream/${mediaId}?quality=thumbnail`;
      }
    });

    return convertedUrls;
  }
}