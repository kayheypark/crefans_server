import { Controller, Get } from "@nestjs/common";
import { AppService } from "./app.service";
import { ApiResponseDto } from "./common/dto/api-response.dto";

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): ApiResponseDto<{ message: string }> {
    const message = this.appService.getHello();
    return ApiResponseDto.success("서버가 정상 동작중입니다.", { message });
  }
}
