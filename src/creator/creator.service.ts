import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class CreatorService {
  constructor(private readonly prisma: PrismaService) {}

  async onboardCreator(user_id: string, name: string) {
    return this.prisma.creator.create({
      data: {
        user_id,
        name,
        is_active: true,
      },
    });
  }
}
