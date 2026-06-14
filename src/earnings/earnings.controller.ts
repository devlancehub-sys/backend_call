import { Controller, Get, Query, UseGuards, Req } from '@nestjs/common';
import { EarningsService } from './earnings.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('earnings')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('female')
export class EarningsController {
  constructor(private earningsService: EarningsService) {}

  @Get('summary')
  getSummary(@Req() req: any) {
    return this.earningsService.getSummary(req.user.id);
  }

  @Get('history')
  getHistory(@Req() req: any, @Query('page') page?: number, @Query('limit') limit?: number) {
    return this.earningsService.getHistory(req.user.id, page, limit);
  }
}
