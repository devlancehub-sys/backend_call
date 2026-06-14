import { Controller, Get, Post, Body, Query, UseGuards, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { WalletService } from './wallet.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { ConfirmRechargeDto, RechargeDto } from './dto/wallet.dto';

@ApiTags('Wallet')
@ApiBearerAuth('JWT')
@Controller('wallet')
@UseGuards(JwtAuthGuard)
export class WalletController {
  constructor(private walletService: WalletService) {}

  @Get('balance')
  @ApiOperation({ summary: 'Get wallet balance' })
  getBalance(@Req() req: any) {
    return this.walletService.getBalance(req.user.id);
  }

  @Get('transactions')
  @ApiOperation({ summary: 'Get wallet transaction history' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  getTransactions(@Req() req: any, @Query('page') page?: number, @Query('limit') limit?: number) {
    return this.walletService.getTransactions(req.user.id, page, limit);
  }

  @Post('recharge')
  @ApiOperation({ summary: 'Initiate wallet recharge (boys only)' })
  @UseGuards(RolesGuard)
  @Roles('male')
  recharge(@Req() req: any, @Body() body: RechargeDto) {
    return this.walletService.recharge(req.user.id, body.amount, body.gateway);
  }

  @Post('recharge/confirm')
  @ApiOperation({ summary: 'Confirm recharge after payment (boys only)' })
  @UseGuards(RolesGuard)
  @Roles('male')
  confirmRecharge(@Req() req: any, @Body() body: ConfirmRechargeDto) {
    return this.walletService.confirmRecharge(req.user.id, body.payment_id, body.amount);
  }
}
