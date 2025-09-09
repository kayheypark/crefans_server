import { Injectable, NotFoundException, ConflictException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMembershipDto } from './dto/create-membership.dto';
import { UpdateMembershipDto } from './dto/update-membership.dto';

@Injectable()
export class MembershipService {
  constructor(private readonly prisma: PrismaService) {}

  async createMembership(creatorId: string, createMembershipDto: CreateMembershipDto) {
    // 크리에이터 권한 확인
    const creator = await this.prisma.creator.findUnique({
      where: { user_id: creatorId, is_active: true }
    });

    if (!creator) {
      throw new ForbiddenException('크리에이터 권한이 필요합니다.');
    }

    // 같은 레벨의 활성 멤버십이 이미 존재하는지 확인 (소프트 삭제된 것은 제외)
    const existingMembership = await this.prisma.membershipItem.findFirst({
      where: {
        creator_id: creatorId,
        level: createMembershipDto.level,
        is_deleted: false
      }
    });

    if (existingMembership) {
      throw new ConflictException(`레벨 ${createMembershipDto.level}의 멤버십이 이미 존재합니다.`);
    }

    // 새로운 멤버십 생성
    return this.prisma.membershipItem.create({
      data: {
        ...createMembershipDto,
        creator_id: creatorId,
        trial_unit: createMembershipDto.trial_unit || 'DAY',
        trial_period: createMembershipDto.trial_period || 0,
      }
    });
  }

  async getMembershipsByCreator(creatorId: string) {
    return this.prisma.membershipItem.findMany({
      where: {
        creator_id: creatorId,
        is_deleted: false
      },
      orderBy: {
        level: 'asc'
      }
    });
  }

  async getMembershipById(id: number, creatorId: string) {
    const membership = await this.prisma.membershipItem.findFirst({
      where: {
        id,
        creator_id: creatorId,
        is_deleted: false
      }
    });

    if (!membership) {
      throw new NotFoundException('멤버십을 찾을 수 없습니다.');
    }

    return membership;
  }

  async updateMembership(id: number, creatorId: string, updateMembershipDto: UpdateMembershipDto) {
    // 멤버십 존재 및 소유권 확인
    const existingMembership = await this.getMembershipById(id, creatorId);

    // 레벨 변경 시 중복 확인
    if (updateMembershipDto.level && updateMembershipDto.level !== existingMembership.level) {
      const conflictMembership = await this.prisma.membershipItem.findFirst({
        where: {
          creator_id: creatorId,
          level: updateMembershipDto.level,
          is_deleted: false,
          id: { not: id }
        }
      });

      if (conflictMembership) {
        throw new ConflictException(`레벨 ${updateMembershipDto.level}의 멤버십이 이미 존재합니다.`);
      }
    }

    return this.prisma.membershipItem.update({
      where: { id },
      data: updateMembershipDto
    });
  }

  async deleteMembership(id: number, creatorId: string) {
    // 멤버십 존재 및 소유권 확인
    await this.getMembershipById(id, creatorId);

    // 활성 구독이 있는지 확인
    const activeSubscriptions = await this.prisma.subscription.count({
      where: {
        membership_item_id: id,
        status: 'ONGOING'
      }
    });

    if (activeSubscriptions > 0) {
      throw new ConflictException('활성 구독이 있는 멤버십은 삭제할 수 없습니다.');
    }

    // 소프트 삭제
    return this.prisma.membershipItem.update({
      where: { id },
      data: {
        is_deleted: true,
        deleted_at: new Date(),
        is_active: false
      }
    });
  }

  async toggleMembershipActive(id: number, creatorId: string) {
    const membership = await this.getMembershipById(id, creatorId);

    return this.prisma.membershipItem.update({
      where: { id },
      data: {
        is_active: !membership.is_active
      }
    });
  }
}