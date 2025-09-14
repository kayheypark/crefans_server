import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminAuthGuard } from './guards/admin-auth.guard';

@Controller('api/admin')
@UseGuards(AdminAuthGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // Dashboard endpoints
  @Get('dashboard/stats')
  async getDashboardStats() {
    return this.adminService.getDashboardStats();
  }

  @Get('dashboard/user-growth')
  async getUserGrowth() {
    return this.adminService.getUserGrowth();
  }

  @Get('dashboard/revenue')
  async getRevenueStats() {
    return this.adminService.getRevenueStats();
  }


  // Posting management endpoints (READ ONLY)
  @Get('postings')
  async getPostings(@Query() query: any) {
    return this.adminService.getPostings(query);
  }

  @Get('postings/:id')
  async getPosting(@Param('id') id: string) {
    return this.adminService.getPosting(id);
  }

  // Report management endpoints (READ ONLY)
  @Get('reports')
  async getReports(@Query() query: any) {
    return this.adminService.getReports(query);
  }

  @Get('reports/:id')
  async getReport(@Param('id') id: string) {
    return this.adminService.getReport(id);
  }
}