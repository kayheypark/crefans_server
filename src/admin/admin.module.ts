import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminAuthController } from './admin-auth.controller';
import { AdminService } from './admin.service';
import { AdminAuthGuard } from './guards/admin-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { AuthModule } from '../auth/auth.module';
import { LoggerService } from '../common/logger/logger.service';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [AuthModule, ConfigModule],
  controllers: [AdminController, AdminAuthController],
  providers: [AdminService, AdminAuthGuard, PrismaService, LoggerService],
  exports: [AdminService, AdminAuthGuard],
})
export class AdminModule {}