import { Controller, Get, Post, Body, Query, UseGuards, Req } from '@nestjs/common';
import { WalletService } from './wallet.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('wallet')
@UseGuards(JwtAuthGuard)
export class WalletController {
  constructor(private walletService: WalletService) {}

  @Get('balance')
  getBalance(@Req() req: any) {
    return this.walletService.getBalance(req.user.id);
  }

  @Get('transactions')
  getTransactions(@Req() req: any, @Query('page') page?: number, @Query('limit') limit?: number) {
    return this.walletService.getTransactions(req.user.id, page, limit);
  }

  @Post('recharge')
  @UseGuards(RolesGuard)
  @Roles('male')
  recharge(@Req() req: any, @Body() body: { amount: number; gateway?: string }) {
    return this.walletService.recharge(req.user.id, body.amount, body.gateway);
  }

  @Post('recharge/confirm')
  @UseGuards(RolesGuard)
  @Roles('male')
  confirmRecharge(@Req() req: any, @Body() body: { payment_id: string; amount: number }) {
    return this.walletService.confirmRecharge(req.user.id, body.payment_id, body.amount);
  }
}
