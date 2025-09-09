import { Module } from '@nestjs/common';
import { EarlybirdService } from './earlybird.service';
import { EarlybirdController } from './earlybird.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [EarlybirdController],
  providers: [EarlybirdService],
  exports: [EarlybirdService],
})
export class EarlybirdModule {}