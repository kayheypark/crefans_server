import { Controller, Get, Param, Query, UseGuards, Patch, Body } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminAuthGuard } from './guards/admin-auth.guard';
import { ApiResponseDto } from '../common/dto/api-response.dto';

@Controller('admin')
@UseGuards(AdminAuthGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // Dashboard endpoints
  @Get('dashboard/stats')
  async getDashboardStats() {
    const data = await this.adminService.getDashboardStats();
    return ApiResponseDto.success('대시보드 통계를 성공적으로 조회했습니다.', data);
  }

  @Get('dashboard/user-growth')
  async getUserGrowth() {
    const data = await this.adminService.getUserGrowth();
    return ApiResponseDto.success('사용자 증가 데이터를 성공적으로 조회했습니다.', data);
  }

  @Get('dashboard/revenue')
  async getRevenueStats() {
    const data = await this.adminService.getRevenueStats();
    return ApiResponseDto.success('매출 통계를 성공적으로 조회했습니다.', data);
  }


  // Posting management endpoints (READ ONLY)
  @Get('postings')
  async getPostings(@Query() query: any) {
    const data = await this.adminService.getPostings(query);
    return ApiResponseDto.success('포스팅 목록을 성공적으로 조회했습니다.', data);
  }

  @Get('postings/:id')
  async getPosting(@Param('id') id: string) {
    const data = await this.adminService.getPosting(id);
    return ApiResponseDto.success('포스팅 정보를 성공적으로 조회했습니다.', data);
  }

  @Patch('postings/:id/privacy')
  async togglePostingPrivacy(@Param('id') id: string, @Body() body: { isPrivate: boolean }) {
    const data = await this.adminService.togglePostingPrivacy(id, body.isPrivate);
    return ApiResponseDto.success('포스팅 공개/비공개 설정을 성공적으로 변경했습니다.', data);
  }

  // Report management endpoints (READ ONLY)
  @Get('reports')
  async getReports(@Query() query: any) {
    const data = await this.adminService.getReports(query);
    return ApiResponseDto.success('신고 목록을 성공적으로 조회했습니다.', data);
  }

  @Get('reports/:id')
  async getReport(@Param('id') id: string) {
    const data = await this.adminService.getReport(id);
    return ApiResponseDto.success('신고 정보를 성공적으로 조회했습니다.', data);
  }

  // User management endpoints (READ ONLY - using Cognito API)
  @Get('users')
  async getUsers(@Query() query: any) {
    const data = await this.adminService.getUsers(query);
    return ApiResponseDto.success('사용자 목록을 성공적으로 조회했습니다.', data);
  }

  @Get('users/search')
  async searchUsers(@Query('q') query: string) {
    const data = await this.adminService.searchUsers(query);
    return ApiResponseDto.success('사용자 검색을 성공적으로 완료했습니다.', data);
  }

  @Get('users/:userSub')
  async getUser(@Param('userSub') userSub: string) {
    const data = await this.adminService.getUser(userSub);
    return ApiResponseDto.success('사용자 정보를 성공적으로 조회했습니다.', data);
  }
}