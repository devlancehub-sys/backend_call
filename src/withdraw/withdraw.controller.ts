import { Controller, Get, Post, Body, UseGuards, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { WithdrawService } from './withdraw.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { WithdrawRequestDto } from './dto/withdraw.dto';

@ApiTags('Withdraw')
@ApiBearerAuth('JWT')
@Controller('withdraw')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('female')
export class WithdrawController {
  constructor(private withdrawService: WithdrawService) {}

  @Post()
  @ApiOperation({ summary: 'Request withdrawal — girls only' })
  request(@Req() req: any, @Body() body: WithdrawRequestDto) {
    return this.withdrawService.request(req.user.id, body.amount, body.method, body.account_details);
  }

  @Get('history')
  @ApiOperation({ summary: 'Get withdrawal history — girls only' })
  getHistory(@Req() req: any) {
    return this.withdrawService.getHistory(req.user.id);
  }
}
