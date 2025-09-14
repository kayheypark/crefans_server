import { Controller, Get, Param, Query } from "@nestjs/common";
import { ExploreService } from "./explore.service";
import { ApiResponseDto } from "../common/dto/api-response.dto";
import {
  GetCreatorsByCategoryDto,
  GetNewCreatorsDto,
  CreatorCategoryResponseDto,
  NewCreatorsResponseDto,
  CreatorsByCategoryResponseDto,
} from "./dto/explore.dto";

@Controller("explore")
export class ExploreController {
  constructor(private readonly exploreService: ExploreService) {}

  @Get("categories")
  async getCategories(): Promise<ApiResponseDto<CreatorCategoryResponseDto[]>> {
    const categories = await this.exploreService.getCreatorCategories();
    return ApiResponseDto.success(
      "크리에이터 카테고리를 성공적으로 조회했습니다.",
      categories
    );
  }

  @Get("creators/new")
  async getNewCreators(
    @Query() query: GetNewCreatorsDto
  ): Promise<ApiResponseDto<NewCreatorsResponseDto>> {
    const { limit = 20, cursor } = query;
    const result = await this.exploreService.getNewCreators(limit, cursor);
    return ApiResponseDto.success(
      "신규 크리에이터를 성공적으로 조회했습니다.",
      result
    );
  }

  @Get("creators/by-category/:categoryId")
  async getCreatorsByCategory(
    @Param("categoryId") categoryId: string,
    @Query() query: GetCreatorsByCategoryDto
  ): Promise<ApiResponseDto<CreatorsByCategoryResponseDto>> {
    const { limit = 20, cursor } = query;
    const result = await this.exploreService.getCreatorsByCategory(
      categoryId,
      limit,
      cursor
    );
    return ApiResponseDto.success(
      "카테고리별 크리에이터를 성공적으로 조회했습니다.",
      result
    );
  }
}