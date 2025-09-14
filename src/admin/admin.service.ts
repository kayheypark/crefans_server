import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CognitoService } from '../auth/cognito.service';

@Injectable()
export class AdminService {
  constructor(
    private prisma: PrismaService,
    private cognitoService: CognitoService
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

    const postings = await this.prisma.posting.findMany({
      where,
      skip,
      take: parseInt(limit),
      orderBy: { created_at: 'desc' },
      include: {
        medias: {
          select: {
            id: true,
            media: {
              select: {
                type: true,
                file_name: true,
              }
            }
          }
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

    return {
      data: postings,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(total / limit),
    };
  }

  async getPosting(postingId: string) {
    const posting = await this.prisma.posting.findUnique({
      where: { id: postingId },
      include: {
        medias: {
          include: {
            media: true,
          }
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

    return posting;
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
      });

      const response = await cognitoClient.send(command);

      // 사용자 데이터를 관리자가 보기 편한 형태로 변환
      const users = response.Users?.map(user => {
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
      }) || [];

      return {
        users,
        paginationToken: response.PaginationToken,
        hasMore: !!response.PaginationToken,
      };
    } catch (error) {
      console.error('[ERROR] AdminService.getUsers failed:', error);
      console.error('[ERROR] Error message:', error.message);
      console.error('[ERROR] Error stack:', error.stack);
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
}