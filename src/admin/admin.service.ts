import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdminService {
  constructor(
    private prisma: PrismaService
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
}