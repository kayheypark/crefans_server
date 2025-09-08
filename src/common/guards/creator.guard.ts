import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class CreatorGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const { sub } = request.user;

    if (!sub) {
      throw new ForbiddenException("인증된 사용자만 접근할 수 있습니다.");
    }

    const creator = await this.prisma.creator.findUnique({
      where: { user_id: sub },
    });

    if (!creator) {
      throw new ForbiddenException("크리에이터만 접근할 수 있습니다.");
    }

    return true;
  }
}
