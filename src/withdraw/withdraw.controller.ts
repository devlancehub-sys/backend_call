import { Controller, Get, Post, Body, UseGuards, Req } from '@nestjs/common';
import { WithdrawService } from './withdraw.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('withdraw')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('female')
export class WithdrawController {
  constructor(private withdrawService: WithdrawService) {}

  @Post()
  request(@Req() req: any, @Body() body: { amount: number; method: string; account_details: any }) {
    return this.withdrawService.request(req.user.id, body.amount, body.method, body.account_details);
  }

  @Get('history')
  getHistory(@Req() req: any) {
    return this.withdrawService.getHistory(req.user.id);
  }
}
