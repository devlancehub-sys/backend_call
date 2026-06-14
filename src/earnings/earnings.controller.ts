import { Controller, Get, Query, UseGuards, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { EarningsService } from './earnings.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@ApiTags('Earnings')
@ApiBearerAuth('JWT')
@Controller('earnings')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('female')
export class EarningsController {
  constructor(private earningsService: EarningsService) {}

  @Get('summary')
  @ApiOperation({ summary: 'Get earnings summary — girls only' })
  getSummary(@Req() req: any) {
    return this.earningsService.getSummary(req.user.id);
  }

  @Get('history')
  @ApiOperation({ summary: 'Get earnings history — girls only' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  getHistory(@Req() req: any, @Query('page') page?: number, @Query('limit') limit?: number) {
    return this.earningsService.getHistory(req.user.id, page, limit);
  }
}
