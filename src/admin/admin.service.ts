import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CognitoService } from '../auth/cognito.service';
import { MediaStreamUtil } from '../common/utils/media-stream.util';
import { AuthService } from '../auth/auth.service';

@Injectable()
export class AdminService {
  constructor(
    private prisma: PrismaService,
    private cognitoService: CognitoService,
    private authService: AuthService
  ) {}

  // Dashboard methods
  async getDashboardStats() {
    const [
      totalUsers,
      totalCreators,
      totalPosts,
      totalReports,
      activeSubscriptions,
    ] = await Promise.all([
      this.prisma.userProfile.count(),
      this.prisma.creator.count(),
      this.prisma.posting.count(),
      this.prisma.userReport.count(),
      this.prisma.subscription.count({
        where: { status: 'ONGOING' }
      }),
    ]);

    return {
      totalUsers,
      totalCreators,
      totalPosts,
      totalReports,
      activeSubscriptions,
    };
  }

  async getUserGrowth() {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const userGrowth = await this.prisma.$queryRaw`
      SELECT
        DATE(created_at) as date,
        COUNT(*) as count
      FROM user_profiles
      WHERE created_at >= ${thirtyDaysAgo}
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `;

    return userGrowth;
  }

  async getRevenueStats() {
    const revenue = await this.prisma.transfer.aggregate({
      where: {
        status: 'SUCCESS',
        created_at: {
          gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
        },
      },
      _sum: {
        amount: true,
      },
    });

    return {
      monthlyRevenue: revenue._sum.amount || 0,
    };
  }



  // Posting management methods (READ ONLY)
  async getPostings(query: any) {
    const { page = 1, limit = 20, search, status } = query;
    const skip = (page - 1) * limit;

    const where: any = {
      is_deleted: false, // Only show non-deleted posts
    };

    if (search) {
      where.OR = [
        { title: { contains: search } },
        { content: { contains: search } },
        { user_sub: { contains: search } },
      ];
    }

    if (status) {
      where.status = status;
    }

    const postings: any[] = await this.prisma.posting.findMany({
      where,
      skip,
      take: parseInt(limit),
      orderBy: { created_at: 'desc' },
      include: {
        medias: {
          where: { is_deleted: false },
          include: {
            media: {
              select: {
                id: true,
                type: true,
                original_name: true,
                file_name: true,
                mime_type: true,
                s3_upload_key: true,
                processed_urls: true,
                thumbnail_urls: true,
                processing_status: true,
                duration: true,
              },
            },
          },
          orderBy: { sort_order: "asc" },
        },
        _count: {
          select: {
            comments: true,
            likes: true,
            views: true,
          }
        }
      },
    });

    const total = await this.prisma.posting.count({ where });

    // Format postings to match crefans_front structure
    const formattedPostings = await Promise.all(
      postings.map(async (posting) => {
        // Convert medias to match front-end structure
        const mediasWithUrls = await Promise.all(
          posting.medias.map(async (pm) => {
            const streamUrl = MediaStreamUtil.getTypedStreamUrl(
              pm.media.id,
              pm.media.type === 'VIDEO' ? 'video' : 'image'
            );

            let processedUrls, thumbnailUrls;

            if (pm.media.type === 'VIDEO') {
              processedUrls = MediaStreamUtil.convertVideoUrlsToStreamProxy(
                pm.media.id,
                pm.media.processed_urls
              );
              thumbnailUrls = MediaStreamUtil.convertVideoThumbnailsToStreamProxy(
                pm.media.id,
                pm.media.thumbnail_urls
              );
            } else if (pm.media.type === 'IMAGE') {
              processedUrls = MediaStreamUtil.convertImageUrlsToStreamProxy(
                pm.media.id,
                pm.media.processed_urls
              );
              thumbnailUrls = MediaStreamUtil.convertImageThumbnailsToStreamProxy(
                pm.media.id,
                pm.media.thumbnail_urls
              );
            }

            return {
              id: pm.media.id,
              type: pm.media.type,
              file_name: pm.media.file_name,
              content_type: pm.media.mime_type,
              originalName: pm.media.original_name,
              mediaUrl: streamUrl,
              processedUrls,
              thumbnailUrls,
              processingStatus: pm.media.processing_status,
              duration: pm.media.duration,
            };
          })
        );

        // Get user info
        const userInfo = await this.getUserInfo(posting.user_sub);

        return {
          id: posting.id,
          userSub: posting.user_sub,
          user: userInfo,
          title: posting.title,
          content: posting.content,
          status: posting.status,
          isMembership: posting.is_membership,
          isGotMembership: true, // Admin can see all
          membershipLevel: posting.membership_level,
          publishStartAt: posting.publish_start_at?.toISOString(),
          publishEndAt: posting.publish_end_at?.toISOString(),
          allowIndividualPurchase: posting.allow_individual_purchase,
          individualPurchasePrice: posting.individual_purchase_price
            ? Number(posting.individual_purchase_price)
            : undefined,
          isPublic: posting.is_public,
          isSensitive: posting.is_sensitive,
          totalViewCount: posting.total_view_count,
          uniqueViewCount: posting.unique_view_count,
          likeCount: posting.like_count,
          commentCount: posting.comment_count,
          publishedAt: posting.published_at?.toISOString(),
          archivedAt: posting.archived_at?.toISOString(),
          createdAt: posting.created_at.toISOString(),
          updatedAt: posting.updated_at.toISOString(),
          medias: mediasWithUrls,
          isLiked: false, // Not applicable for admin
          // For backward compatibility with existing admin frontend
          total_view_count: posting.total_view_count,
          like_count: posting.like_count,
          comment_count: posting.comment_count,
          created_at: posting.created_at.toISOString(),
          published_at: posting.published_at?.toISOString(),
          is_membership: posting.is_membership,
          is_public: posting.is_public,
          is_sensitive: posting.is_sensitive,
          is_deleted: posting.is_deleted,
          user_sub: posting.user_sub,
          _count: {
            comments: posting._count.comments,
            likes: posting._count.likes,
            views: posting._count.views,
          }
        };
      })
    );

    return {
      data: formattedPostings,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(total / limit),
    };
  }

  async getPosting(postingId: string) {
    const posting: any = await this.prisma.posting.findUnique({
      where: { id: postingId },
      include: {
        medias: {
          where: { is_deleted: false },
          include: {
            media: {
              select: {
                id: true,
                type: true,
                original_name: true,
                file_name: true,
                mime_type: true,
                s3_upload_key: true,
                processed_urls: true,
                thumbnail_urls: true,
                processing_status: true,
                duration: true,
              },
            },
          },
          orderBy: { sort_order: "asc" },
        },
        comments: {
          where: { is_deleted: false },
          take: 5, // Latest 5 comments
          orderBy: { created_at: 'desc' },
        },
        _count: {
          select: {
            comments: { where: { is_deleted: false } },
            likes: { where: { is_deleted: false } },
            views: true,
          }
        }
      },
    });

    if (!posting) {
      throw new NotFoundException('Posting not found');
    }

    // Convert medias to match front-end structure
    const mediasWithUrls = await Promise.all(
      posting.medias.map(async (pm) => {
        const streamUrl = MediaStreamUtil.getTypedStreamUrl(
          pm.media.id,
          pm.media.type === 'VIDEO' ? 'video' : 'image'
        );

        let processedUrls, thumbnailUrls;

        if (pm.media.type === 'VIDEO') {
          processedUrls = MediaStreamUtil.convertVideoUrlsToStreamProxy(
            pm.media.id,
            pm.media.processed_urls
          );
          thumbnailUrls = MediaStreamUtil.convertVideoThumbnailsToStreamProxy(
            pm.media.id,
            pm.media.thumbnail_urls
          );
        } else if (pm.media.type === 'IMAGE') {
          processedUrls = MediaStreamUtil.convertImageUrlsToStreamProxy(
            pm.media.id,
            pm.media.processed_urls
          );
          thumbnailUrls = MediaStreamUtil.convertImageThumbnailsToStreamProxy(
            pm.media.id,
            pm.media.thumbnail_urls
          );
        }

        return {
          id: pm.media.id,
          type: pm.media.type,
          file_name: pm.media.file_name,
          content_type: pm.media.mime_type,
          originalName: pm.media.original_name,
          mediaUrl: streamUrl,
          processedUrls,
          thumbnailUrls,
          processingStatus: pm.media.processing_status,
          duration: pm.media.duration,
        };
      })
    );

    // Get user info
    const userInfo = await this.getUserInfo(posting.user_sub);

    const formattedPosting = {
      id: posting.id,
      userSub: posting.user_sub,
      user: userInfo,
      title: posting.title,
      content: posting.content,
      status: posting.status,
      isMembership: posting.is_membership,
      isGotMembership: true, // Admin can see all
      membershipLevel: posting.membership_level,
      publishStartAt: posting.publish_start_at?.toISOString(),
      publishEndAt: posting.publish_end_at?.toISOString(),
      allowIndividualPurchase: posting.allow_individual_purchase,
      individualPurchasePrice: posting.individual_purchase_price
        ? Number(posting.individual_purchase_price)
        : undefined,
      isPublic: posting.is_public,
      isSensitive: posting.is_sensitive,
      totalViewCount: posting.total_view_count,
      uniqueViewCount: posting.unique_view_count,
      likeCount: posting.like_count,
      commentCount: posting.comment_count,
      publishedAt: posting.published_at?.toISOString(),
      archivedAt: posting.archived_at?.toISOString(),
      createdAt: posting.created_at.toISOString(),
      updatedAt: posting.updated_at.toISOString(),
      medias: mediasWithUrls,
      isLiked: false, // Not applicable for admin
      comments: posting.comments,
      // For backward compatibility with existing admin frontend
      total_view_count: posting.total_view_count,
      like_count: posting.like_count,
      comment_count: posting.comment_count,
      created_at: posting.created_at.toISOString(),
      published_at: posting.published_at?.toISOString(),
      is_membership: posting.is_membership,
      is_public: posting.is_public,
      is_sensitive: posting.is_sensitive,
      is_deleted: posting.is_deleted,
      user_sub: posting.user_sub,
      _count: {
        comments: posting._count.comments,
        likes: posting._count.likes,
        views: posting._count.views,
      }
    };

    return formattedPosting;
  }

  // Report management methods
  async getReports(query: any) {
    const { page = 1, limit = 20, status } = query;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (status) {
      where.status = status;
    }

    const reports = await this.prisma.userReport.findMany({
      where,
      skip,
      take: parseInt(limit),
      orderBy: { created_at: 'desc' },
    });

    const total = await this.prisma.userReport.count({ where });

    return {
      data: reports,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(total / limit),
    };
  }

  async getReport(reportId: string) {
    const report = await this.prisma.userReport.findUnique({
      where: { id: reportId },
    });

    if (!report) {
      throw new NotFoundException('Report not found');
    }

    return report;
  }

  // Admin authentication methods
  async getAdminByUserSub(userSub: string) {
    return this.prisma.admin.findUnique({
      where: { user_sub: userSub },
    });
  }

  async updateLastLogin(adminId: string) {
    return this.prisma.admin.update({
      where: { id: adminId },
      data: { last_login: new Date() },
    });
  }

  // User management methods (using Cognito API)
  async getUsers(query: any) {
    const { limit = 20, paginationToken } = query;


    try {
      const { ListUsersCommand } = await import('@aws-sdk/client-cognito-identity-provider');

      const cognitoClient = (this.cognitoService as any).cognitoClient;
      const userPoolId = (this.cognitoService as any).userPoolId;


      // AWS Cognito's maximum limit is 60
      const validatedLimit = Math.min(parseInt(limit), 60);

      const command = new ListUsersCommand({
        UserPoolId: userPoolId,
        Limit: validatedLimit,
        PaginationToken: paginationToken,
        // Remove AttributesToGet to get all attributes
      });

      const response = await cognitoClient.send(command);

      const users = response.Users?.map(user => {
        const userAttributes = user.Attributes || user.UserAttributes;
        const attributes = userAttributes?.reduce((acc, attr) => {
          if (attr.Name && attr.Value) {
            acc[attr.Name] = attr.Value;
          }
          return acc;
        }, {} as Record<string, string>) || {};

        return {
          username: user.Username,
          email: attributes.email || 'N/A',
          name: attributes.name || 'N/A',
          nickname: attributes.nickname || 'N/A',
          phoneNumber: attributes.phone_number || 'N/A',
          preferredUsername: attributes.preferred_username || 'N/A',
          isCreator: attributes['custom:is_creator'] === '1',
          emailVerified: attributes.email_verified === 'true',
          userStatus: user.UserStatus,
          enabled: user.Enabled,
          createdDate: user.UserCreateDate,
          lastModifiedDate: user.UserLastModifiedDate,
          sub: attributes.sub,
        };
      }) || [];

      return {
        users,
        paginationToken: response.PaginationToken,
        hasMore: !!response.PaginationToken,
      };
    } catch (error) {
      throw new Error(`사용자 목록 조회 실패: ${error.message}`);
    }
  }

  async getUser(userSub: string) {
    try {
      const user = await this.cognitoService.getUserBySub(userSub);

      if (!user) {
        throw new NotFoundException('사용자를 찾을 수 없습니다');
      }

      const attributes = user.UserAttributes?.reduce((acc, attr) => {
        acc[attr.Name] = attr.Value;
        return acc;
      }, {} as Record<string, string>) || {};

      return {
        username: user.Username,
        email: attributes.email,
        name: attributes.name,
        nickname: attributes.nickname,
        phoneNumber: attributes.phone_number,
        isCreator: attributes['custom:is_creator'] === '1',
        emailVerified: attributes.email_verified === 'true',
        userStatus: user.UserStatus,
        enabled: user.Enabled,
        createdDate: user.UserCreateDate,
        lastModifiedDate: user.UserLastModifiedDate,
        sub: attributes.sub,
      };
    } catch (error) {
      throw new Error(`사용자 정보 조회 실패: ${error.message}`);
    }
  }

  async searchUsers(query: string) {
    try {
      const { ListUsersCommand } = await import('@aws-sdk/client-cognito-identity-provider');
      const cognitoClient = (this.cognitoService as any).cognitoClient;
      const userPoolId = (this.cognitoService as any).userPoolId;

      // 이메일로 검색
      const emailSearchCommand = new ListUsersCommand({
        UserPoolId: userPoolId,
        Filter: `email ^= "${query}"`,
        Limit: 10,
      });

      const emailResults = await cognitoClient.send(emailSearchCommand);

      // 닉네임으로 검색
      const nicknameSearchCommand = new ListUsersCommand({
        UserPoolId: userPoolId,
        Filter: `nickname ^= "${query}"`,
        Limit: 10,
      });

      const nicknameResults = await cognitoClient.send(nicknameSearchCommand);

      // 결과 합치기 및 중복 제거
      const allUsers = [...(emailResults.Users || []), ...(nicknameResults.Users || [])];
      const uniqueUsers = allUsers.filter((user, index, self) =>
        index === self.findIndex(u => u.Username === user.Username)
      );

      const users = uniqueUsers.map(user => {
        const attributes = user.UserAttributes?.reduce((acc, attr) => {
          acc[attr.Name] = attr.Value;
          return acc;
        }, {} as Record<string, string>) || {};

        return {
          username: user.Username,
          email: attributes.email,
          name: attributes.name,
          nickname: attributes.nickname,
          phoneNumber: attributes.phone_number,
          isCreator: attributes['custom:is_creator'] === '1',
          emailVerified: attributes.email_verified === 'true',
          userStatus: user.UserStatus,
          enabled: user.Enabled,
          createdDate: user.UserCreateDate,
          lastModifiedDate: user.UserLastModifiedDate,
          sub: attributes.sub,
        };
      });

      return { users };
    } catch (error) {
      throw new Error(`사용자 검색 실패: ${error.message}`);
    }
  }

  private async getUserInfo(userSub: string) {
    try {
      const cognitoUser = await this.authService.getUserBySub(userSub);

      if (!cognitoUser) {
        return {
          id: userSub,
          handle: userSub,
          name: userSub,
          avatar: "/profile-90.png",
        };
      }

      return {
        id: cognitoUser.Username,
        handle: cognitoUser.UserAttributes.find((attr) => attr.Name === "preferred_username")?.Value || userSub,
        name: cognitoUser.UserAttributes.find((attr) => attr.Name === "nickname")?.Value || userSub,
        avatar: cognitoUser.UserAttributes.find((attr) => attr.Name === "picture")?.Value || "/profile-90.png",
      };
    } catch (error) {
      // Fall back to userSub if Cognito lookup fails
      return {
        id: userSub,
        handle: userSub,
        name: userSub,
        avatar: "/profile-90.png",
      };
    }
  }
}