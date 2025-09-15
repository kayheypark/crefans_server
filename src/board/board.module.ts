import { Module } from '@nestjs/common';
import { BoardController } from './board.controller';
import { BoardService } from './board.service';
import { AdminBoardController } from './admin-board.controller';
import { AdminBoardService } from './admin-board.service';
import { BoardCategoryController } from './board-category.controller';
import { BoardCategoryService } from './board-category.service';
import { AdminBoardCategoryController } from './admin-board-category.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AdminModule } from '../admin/admin.module';

@Module({
  imports: [PrismaModule, AdminModule],
  controllers: [
    BoardController,
    AdminBoardController,
    BoardCategoryController,
    AdminBoardCategoryController,
  ],
  providers: [BoardService, AdminBoardService, BoardCategoryService],
  exports: [BoardService, AdminBoardService, BoardCategoryService],
})
export class BoardModule {}