import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';

export interface FeedFilter {
  type: 'all' | 'membership' | 'public';
}

export interface FeedQuery {
  page?: number;
  limit?: number;
  filter?: FeedFilter['type'];
}

@Injectable()
export class FeedService {
  private readonly logger = new Logger(FeedService.name);

  constructor(
    private prisma: PrismaService,
    private authService: AuthService
  ) {}

  async getFeed(userId?: string, query: FeedQuery = {}) {
    const { page = 1, limit = 10, filter = 'all' } = query;
    
    // 타입 안전성을 위한 숫자 변환
    const pageNum = typeof page === 'string' ? parseInt(page, 10) : page;
    const limitNum = typeof limit === 'string' ? parseInt(limit, 10) : limit;
    const skip = (pageNum - 1) * limitNum;

    try {
      // 기본 쿼리 조건
      const whereConditions: any = {
        status: 'PUBLISHED', // 발행된 포스트만
        is_deleted: false,   // 삭제되지 않은 포스트만
      };

      // 필터 적용
      if (filter === 'membership') {
        whereConditions.is_membership = true;
      } else if (filter === 'public') {
        whereConditions.is_membership = false;
      }

      // 포스팅 조회
      const postings = await this.prisma.posting.findMany({
        where: whereConditions,
        include: {
          medias: {
            where: {
              is_deleted: false
            },
            include: {
              media: true
            },
            orderBy: {
              sort_order: 'asc'
            }
          },
          comments: {
            where: {
              deleted_at: null
            },
            select: {
              id: true
            }
          }
        },
        orderBy: {
          created_at: 'desc'
        },
        skip,
        take: limitNum,
      });

      // 빈 데이터 처리
      if (!postings || postings.length === 0) {
        this.logger.log(`No posts found for filter: ${filter}, userId: ${userId || 'anonymous'}`, {
          service: 'FeedService',
          method: 'getFeed',
          filter,
          userId: userId || null
        });

        return {
          success: true,
          data: [],
          pagination: {
            page: pageNum,
            limit: limitNum,
            hasMore: false,
            total: 0
          },
          message: filter === 'membership' 
            ? '멤버십 전용 포스팅이 없습니다.' 
            : filter === 'public' 
              ? '공개 포스팅이 없습니다.'
              : '표시할 포스팅이 없습니다.'
        };
      }

      // 고유한 사용자 ID 수집
      const uniqueUserIds = [...new Set(postings.map(post => post.user_sub))];
      
      // 모든 사용자 정보를 한 번에 조회
      const usersMap = new Map();
      try {
        const users = await Promise.all(
          uniqueUserIds.map(async (userSub) => {
            try {
              const cognitoUser = await this.authService.getUserBySub(userSub);
              
              // Cognito 응답 파싱
              let user = {
                name: `User ${userSub.slice(-4)}`,
                nickname: `user_${userSub.slice(-8)}`,
                preferred_username: `user_${userSub.slice(-8)}`,
                avatar_url: '/profile-90.png'
              };

              if (cognitoUser && cognitoUser.UserAttributes) {
                const attributes = cognitoUser.UserAttributes;
                
                // Cognito attributes에서 실제 값 추출
                const name = attributes.find(attr => attr.Name === 'name')?.Value;
                const nickname = attributes.find(attr => attr.Name === 'nickname')?.Value;
                const preferredUsername = attributes.find(attr => attr.Name === 'preferred_username')?.Value;
                const picture = attributes.find(attr => attr.Name === 'picture')?.Value;
                
                user = {
                  name: name || `User ${userSub.slice(-4)}`,
                  nickname: nickname || `user_${userSub.slice(-8)}`,
                  preferred_username: preferredUsername || nickname || `user_${userSub.slice(-8)}`,
                  avatar_url: picture || '/profile-90.png'
                };

                this.logger.log(`Parsed user data for ${userSub}`, {
                  service: 'FeedService',
                  method: 'getFeed',
                  userSub,
                  parsedUser: user
                });
              }
              
              return { userSub, user };
            } catch (error) {
              this.logger.warn(`Failed to get user info for ${userSub}`, {
                service: 'FeedService',
                method: 'getFeed',
                userSub,
                error: error.message
              });
              // 실패한 경우 기본값 반환
              return {
                userSub,
                user: {
                  name: `User ${userSub.slice(-4)}`,
                  nickname: `user_${userSub.slice(-8)}`,
                  preferred_username: `user_${userSub.slice(-8)}`,
                  avatar_url: '/profile-90.png'
                }
              };
            }
          })
        );
        
        users.forEach(({ userSub, user }) => {
          usersMap.set(userSub, user);
        });
      } catch (error) {
        this.logger.error('Failed to fetch user information', error);
      }

      // 사용자별 멤버십 상태 확인 및 데이터 변환
      const postsWithMembership = await Promise.all(
        postings.map(async (post) => {
          let isGotMembership = false;
          
          // 로그인 사용자의 멤버십 상태 확인
          if (userId && post.is_membership) {
            try {
              // 멤버십 구독 상태 확인
              const membership = await this.prisma.subscription.findFirst({
                where: {
                  subscriber_id: userId,
                  status: 'ONGOING',
                  ended_at: null
                }
              });
              isGotMembership = !!membership;
            } catch (error) {
              this.logger.warn('Failed to check membership status', {
                service: 'FeedService',
                method: 'getFeed',
                userId,
                postId: post.id,
                error: error.message
              });
              // 멤버십 확인 실패 시 기본값 false
              isGotMembership = false;
            }
          } else if (!post.is_membership) {
            // 공개 포스트는 항상 접근 가능
            isGotMembership = true;
          }
          // 비로그인 사용자가 멤버십 포스트에 접근 시 isGotMembership = false (기본값)

          // 이미지 URL 생성
          const images = post.medias
            .filter(media => media.media.type === 'IMAGE')
            .map(media => ({
              url: this.generateMediaUrl(media.media.s3_upload_key, media.is_free_preview),
              isPublic: media.is_free_preview || false,
            }));

          // 실제 사용자 정보 가져오기
          const creator = usersMap.get(post.user_sub) || {
            name: `User ${post.user_sub.slice(-4)}`,
            nickname: `user_${post.user_sub.slice(-8)}`,
            preferred_username: `user_${post.user_sub.slice(-8)}`,
            avatar_url: '/profile-90.png'
          };

          return {
            id: post.id,
            title: post.title,
            content: post.content,
            createdAt: post.created_at.toISOString(),
            isMembershipOnly: post.is_membership,
            isGotMembership,
            allowComments: post.allow_comments,
            images,
            textLength: post.content?.length || 0,
            imageCount: images.length,
            videoCount: post.medias.filter(media => media.media.type === 'VIDEO').length,
            commentCount: post.comments.length,
            creator: {
              id: post.user_sub,
              handle: creator.preferred_username || creator.nickname || `user_${post.user_sub.slice(-8)}`,
              name: creator.nickname || creator.name || `User ${post.user_sub.slice(-4)}`,
              avatar: creator.avatar_url || '/profile-90.png',
            }
          };
        })
      );

      // 다음 페이지 존재 여부 확인
      const totalCount = await this.prisma.posting.count({
        where: whereConditions
      });
      const hasMore = skip + limit < totalCount;

      return {
        success: true,
        data: postsWithMembership,
        pagination: {
          page: pageNum,
          limit: limitNum,
          hasMore,
          total: totalCount
        }
      };

    } catch (error) {
      this.logger.error('Failed to get feed:', error.stack || error, {
        service: 'FeedService',
        method: 'getFeed',
        userId: userId || null,
        filter,
        page: pageNum,
        limit: limitNum
      });
      
      return {
        success: false,
        message: userId 
          ? '피드를 불러오는데 실패했습니다.' 
          : '로그인이 필요하거나 피드를 불러올 수 없습니다.',
        data: [],
        pagination: {
          page: pageNum,
          limit: limitNum,
          hasMore: false,
          total: 0
        }
      };
    }
  }

  async getPublicFeed(query: FeedQuery = {}) {
    const { page = 1, limit = 10 } = query;
    
    // 타입 안전성을 위한 숫자 변환
    const pageNum = typeof page === 'string' ? parseInt(page, 10) : page;
    const limitNum = typeof limit === 'string' ? parseInt(limit, 10) : limit;
    const skip = (pageNum - 1) * limitNum;

    try {
      // 공개 포스트만 조회
      const postings = await this.prisma.posting.findMany({
        where: {
          is_membership: false,
          status: 'PUBLISHED',
          is_deleted: false
        },
        include: {
          medias: {
            where: {
              is_deleted: false
            },
            include: {
              media: true
            },
            orderBy: {
              sort_order: 'asc'
            }
          },
          comments: {
            where: {
              deleted_at: null
            },
            select: {
              id: true
            }
          }
        },
        orderBy: {
          created_at: 'desc'
        },
        skip,
        take: limitNum,
      });

      // 빈 데이터 처리
      if (!postings || postings.length === 0) {
        this.logger.log('No public posts found', {
          service: 'FeedService',
          method: 'getPublicFeed'
        });

        return {
          success: true,
          data: [],
          pagination: {
            page: pageNum,
            limit: limitNum,
            hasMore: false,
            total: 0
          },
          message: '공개 포스팅이 없습니다.'
        };
      }

      // 고유한 사용자 ID 수집
      const uniqueUserIds = [...new Set(postings.map(post => post.user_sub))];
      
      // 모든 사용자 정보를 한 번에 조회
      const usersMap = new Map();
      try {
        const users = await Promise.all(
          uniqueUserIds.map(async (userSub) => {
            try {
              const cognitoUser = await this.authService.getUserBySub(userSub);
              
              // Cognito 응답 파싱
              let user = {
                name: `User ${userSub.slice(-4)}`,
                nickname: `user_${userSub.slice(-8)}`,
                preferred_username: `user_${userSub.slice(-8)}`,
                avatar_url: '/profile-90.png'
              };

              if (cognitoUser && cognitoUser.UserAttributes) {
                const attributes = cognitoUser.UserAttributes;
                
                // Cognito attributes에서 실제 값 추출
                const name = attributes.find(attr => attr.Name === 'name')?.Value;
                const nickname = attributes.find(attr => attr.Name === 'nickname')?.Value;
                const preferredUsername = attributes.find(attr => attr.Name === 'preferred_username')?.Value;
                const picture = attributes.find(attr => attr.Name === 'picture')?.Value;
                
                user = {
                  name: name || `User ${userSub.slice(-4)}`,
                  nickname: nickname || `user_${userSub.slice(-8)}`,
                  preferred_username: preferredUsername || nickname || `user_${userSub.slice(-8)}`,
                  avatar_url: picture || '/profile-90.png'
                };

                this.logger.log(`Parsed user data for ${userSub} in getPublicFeed`, {
                  service: 'FeedService',
                  method: 'getPublicFeed',
                  userSub,
                  parsedUser: user
                });
              }
              
              return { userSub, user };
            } catch (error) {
              this.logger.warn(`Failed to get user info for ${userSub}`, {
                service: 'FeedService',
                method: 'getPublicFeed',
                userSub,
                error: error.message
              });
              // 실패한 경우 기본값 반환
              return {
                userSub,
                user: {
                  name: `User ${userSub.slice(-4)}`,
                  nickname: `user_${userSub.slice(-8)}`,
                  preferred_username: `user_${userSub.slice(-8)}`,
                  avatar_url: '/profile-90.png'
                }
              };
            }
          })
        );
        
        users.forEach(({ userSub, user }) => {
          usersMap.set(userSub, user);
        });
      } catch (error) {
        this.logger.error('Failed to fetch user information in getPublicFeed', error);
      }

      const transformedPosts = postings.map(post => {
        const images = post.medias
          .filter(media => media.media.type === 'IMAGE')
          .map(media => ({
            url: this.generateMediaUrl(media.media.s3_upload_key, media.is_free_preview),
            isPublic: media.is_free_preview || false,
          }));

        // 실제 사용자 정보 가져오기
        const creator = usersMap.get(post.user_sub) || {
          name: `User ${post.user_sub.slice(-4)}`,
          nickname: `user_${post.user_sub.slice(-8)}`,
          preferred_username: `user_${post.user_sub.slice(-8)}`,
          avatar_url: '/profile-90.png'
        };

        return {
          id: post.id,
          title: post.title,
          content: post.content,
          createdAt: post.created_at.toISOString(),
          isMembershipOnly: false,
          isGotMembership: true, // 공개 포스트는 항상 접근 가능
          allowComments: post.allow_comments,
          images,
          textLength: post.content?.length || 0,
          imageCount: images.length,
          videoCount: post.medias.filter(media => media.media.type === 'VIDEO').length,
          commentCount: post.comments.length,
          creator: {
            id: post.user_sub,
            handle: creator.preferred_username || creator.nickname || `user_${post.user_sub.slice(-8)}`,
            name: creator.nickname || creator.name || `User ${post.user_sub.slice(-4)}`,
            avatar: creator.avatar_url || '/profile-90.png',
          }
        };
      });

      const totalCount = await this.prisma.posting.count({
        where: { is_membership: false, status: 'PUBLISHED', is_deleted: false }
      });
      const hasMore = skip + limitNum < totalCount;

      return {
        success: true,
        data: transformedPosts,
        pagination: {
          page: pageNum,
          limit: limitNum,
          hasMore,
          total: totalCount
        }
      };

    } catch (error) {
      this.logger.error('Failed to get public feed:', error.stack || error, {
        service: 'FeedService',
        method: 'getPublicFeed',
        page: pageNum,
        limit: limitNum
      });
      
      return {
        success: false,
        message: '공개 피드를 불러오는데 실패했습니다.',
        data: [],
        pagination: {
          page: pageNum,
          limit: limitNum,
          hasMore: false,
          total: 0
        }
      };
    }
  }

  private generateMediaUrl(s3Key: string, isPublic: boolean): string {
    if (isPublic) {
      return `${process.env.CLOUDFRONT_URL}/${s3Key}`;
    } else {
      return `/api/media/access/${s3Key.split('/').pop()}`;
    }
  }
}