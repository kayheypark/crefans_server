import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, Req, ParseUUIDPipe, Patch } from '@nestjs/common';
import { MembershipService } from './membership.service';
import { CreateMembershipDto } from './dto/create-membership.dto';
import { UpdateMembershipDto } from './dto/update-membership.dto';
import { AuthGuard } from '../common/guards/auth.guard';
import { CreatorGuard } from '../common/guards/creator.guard';
import { ApiResponseDto } from '../common/dto/api-response.dto';

@Controller('membership')
export class MembershipController {
  constructor(private readonly membershipService: MembershipService) {}

  @Post()
  @UseGuards(AuthGuard, CreatorGuard)
  async createMembership(
    @Req() req: any,
    @Body() createMembershipDto: CreateMembershipDto
  ): Promise<ApiResponseDto<any>> {
    console.log('Request headers:', req.headers.authorization);
    console.log('Request cookies:', req.cookies);
    console.log('Request user:', req.user);
    const { sub } = req.user;
    const membership = await this.membershipService.createMembership(sub, createMembershipDto);
    return ApiResponseDto.success('멤버십이 성공적으로 생성되었습니다.', membership);
  }

  @Get()
  @UseGuards(AuthGuard, CreatorGuard)
  async getMemberships(@Req() req: any): Promise<ApiResponseDto<any[]>> {
    const { sub } = req.user;
    const memberships = await this.membershipService.getMembershipsByCreator(sub);
    return ApiResponseDto.success('멤버십 목록을 성공적으로 조회했습니다.', memberships);
  }

  @Get(':id')
  @UseGuards(AuthGuard, CreatorGuard)
  async getMembership(
    @Req() req: any,
    @Param('id', ParseUUIDPipe) id: string
  ): Promise<ApiResponseDto<any>> {
    const { sub } = req.user;
    const membership = await this.membershipService.getMembershipById(id, sub);
    return ApiResponseDto.success('멤버십을 성공적으로 조회했습니다.', membership);
  }

  @Put(':id')
  @UseGuards(AuthGuard, CreatorGuard)
  async updateMembership(
    @Req() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateMembershipDto: UpdateMembershipDto
  ): Promise<ApiResponseDto<any>> {
    const { sub } = req.user;
    const membership = await this.membershipService.updateMembership(id, sub, updateMembershipDto);
    return ApiResponseDto.success('멤버십이 성공적으로 수정되었습니다.', membership);
  }

  @Delete(':id')
  @UseGuards(AuthGuard, CreatorGuard)
  async deleteMembership(
    @Req() req: any,
    @Param('id', ParseUUIDPipe) id: string
  ): Promise<ApiResponseDto<any>> {
    const { sub } = req.user;
    await this.membershipService.deleteMembership(id, sub);
    return ApiResponseDto.success('멤버십이 성공적으로 삭제되었습니다.', null);
  }

  @Patch(':id/toggle-active')
  @UseGuards(AuthGuard, CreatorGuard)
  async toggleMembershipActive(
    @Req() req: any,
    @Param('id', ParseUUIDPipe) id: string
  ): Promise<ApiResponseDto<any>> {
    const { sub } = req.user;
    const membership = await this.membershipService.toggleMembershipActive(id, sub);
    return ApiResponseDto.success('멤버십 활성 상태가 변경되었습니다.', membership);
  }
}