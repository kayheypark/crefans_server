import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
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
  constructor(private prisma: PrismaService) {}

  async createPosting(
    creatorId: string,
    createPostingDto: CreatePostingDto,
  ): Promise<CreatePostingResponse> {
    const { media_ids, ...postingData } = createPostingDto;

    // 크리에이터 전용 기능 확인
    await this.validateCreatorOnlyFields(creatorId, postingData);

    // 미디어 ID들이 유효한지 확인
    if (media_ids && media_ids.length > 0) {
      const existingMedias = await this.prisma.media.findMany({
        where: {
          id: { in: media_ids },
          user_sub: creatorId,
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
        creator_id: creatorId,
        published_at: publishedAt,
      },
    });

    // 미디어 연결
    if (media_ids && media_ids.length > 0) {
      await this.prisma.postingMedia.createMany({
        data: media_ids.map((mediaId, index) => ({
          posting_id: posting.id,
          media_id: mediaId,
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

  async getPostings(queryDto: PostingQueryDto): Promise<PostingListResponse> {
    const { page, limit, status, is_membership, creator_id, search } = queryDto;
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

    if (creator_id) {
      whereCondition.creator_id = creator_id;
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
              media: true,
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

    const formattedPostings: PostingResponse[] = postings.map((posting) => ({
      id: posting.id,
      creator_id: posting.creator_id,
      title: posting.title,
      content: posting.content,
      status: posting.status as PostingStatus,
      is_membership: posting.is_membership,
      membership_level: posting.membership_level,
      publish_start_at: posting.publish_start_at?.toISOString(),
      publish_end_at: posting.publish_end_at?.toISOString(),
      allow_individual_purchase: posting.allow_individual_purchase,
      individual_purchase_price: posting.individual_purchase_price ? Number(posting.individual_purchase_price) : undefined,
      is_public: posting.is_public,
      total_view_count: posting.total_view_count,
      unique_view_count: posting.unique_view_count,
      like_count: posting.like_count,
      comment_count: posting.comment_count,
      published_at: posting.published_at?.toISOString(),
      archived_at: posting.archived_at?.toISOString(),
      created_at: posting.created_at.toISOString(),
      updated_at: posting.updated_at.toISOString(),
      medias: posting.medias.map((pm) => ({
        id: pm.media.id,
        type: pm.media.type,
        original_name: pm.media.original_name,
        original_url: pm.media.original_url,
        processed_urls: pm.media.processed_urls,
        thumbnail_urls: pm.media.thumbnail_urls,
        processing_status: pm.media.processing_status,
      })),
    }));

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

  async getPostingById(id: number, viewerId?: string): Promise<PostingDetailResponse> {
    const posting = await this.prisma.posting.findFirst({
      where: {
        id,
        is_deleted: false,
      },
      include: {
        medias: {
          where: { is_deleted: false },
          include: {
            media: true,
          },
          orderBy: { sort_order: 'asc' },
        },
      },
    });

    if (!posting) {
      throw new NotFoundException('포스팅을 찾을 수 없습니다.');
    }

    // 조회수 증가 (viewerId가 있고, 작성자가 아닌 경우)
    if (viewerId && viewerId !== posting.creator_id) {
      await this.incrementViewCount(id, viewerId);
    }

    const formattedPosting: PostingResponse = {
      id: posting.id,
      creator_id: posting.creator_id,
      title: posting.title,
      content: posting.content,
      status: posting.status as PostingStatus,
      is_membership: posting.is_membership,
      membership_level: posting.membership_level,
      publish_start_at: posting.publish_start_at?.toISOString(),
      publish_end_at: posting.publish_end_at?.toISOString(),
      allow_individual_purchase: posting.allow_individual_purchase,
      individual_purchase_price: posting.individual_purchase_price ? Number(posting.individual_purchase_price) : undefined,
      is_public: posting.is_public,
      total_view_count: posting.total_view_count,
      unique_view_count: posting.unique_view_count,
      like_count: posting.like_count,
      comment_count: posting.comment_count,
      published_at: posting.published_at?.toISOString(),
      archived_at: posting.archived_at?.toISOString(),
      created_at: posting.created_at.toISOString(),
      updated_at: posting.updated_at.toISOString(),
      medias: posting.medias.map((pm) => ({
        id: pm.media.id,
        type: pm.media.type,
        original_name: pm.media.original_name,
        original_url: pm.media.original_url,
        processed_urls: pm.media.processed_urls,
        thumbnail_urls: pm.media.thumbnail_urls,
        processing_status: pm.media.processing_status,
      })),
    };

    return {
      success: true,
      data: formattedPosting,
    };
  }

  async updatePosting(
    id: number,
    creatorId: string,
    updatePostingDto: UpdatePostingDto,
  ): Promise<{ success: boolean; message: string }> {
    const existingPosting = await this.prisma.posting.findFirst({
      where: {
        id,
        creator_id: creatorId,
        is_deleted: false,
      },
    });

    if (!existingPosting) {
      throw new NotFoundException('포스팅을 찾을 수 없거나 수정 권한이 없습니다.');
    }

    const { media_ids, ...postingData } = updatePostingDto;

    // 크리에이터 전용 기능 확인
    await this.validateCreatorOnlyFields(creatorId, postingData);

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
            user_sub: creatorId,
            is_deleted: false,
          },
        });

        if (existingMedias.length !== media_ids.length) {
          throw new BadRequestException('일부 미디어 파일을 찾을 수 없습니다.');
        }

        await this.prisma.postingMedia.createMany({
          data: media_ids.map((mediaId, index) => ({
            posting_id: id,
            media_id: mediaId,
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
    id: number,
    creatorId: string,
  ): Promise<{ success: boolean; message: string }> {
    const existingPosting = await this.prisma.posting.findFirst({
      where: {
        id,
        creator_id: creatorId,
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

  private async incrementViewCount(postingId: number, viewerId: string): Promise<void> {
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
      postingData.individual_purchase_price !== undefined;

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
}