import { Controller, Get, Param, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { PaginationQueryDto } from '../common/dto/pagination.dto';
import { GirlsService } from './girls.service';

@Controller('girls')
@UseGuards(JwtAuthGuard)
export class GirlsController {
  constructor(private readonly girlsService: GirlsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: PaginationQueryDto) {
    return this.girlsService.listGirls(
      user.userId,
      query.page ?? 1,
      query.limit ?? 20,
    );
  }

  @Get(':id')
  detail(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.girlsService.getGirlDetail(user.userId, id);
  }
}
