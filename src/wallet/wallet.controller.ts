import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { PaginationQueryDto } from '../common/dto/pagination.dto';
import { WalletService } from './wallet.service';
import { CreateRechargeDto, VerifyRechargeDto } from './dto/wallet.dto';

@Controller('wallet')
@UseGuards(JwtAuthGuard)
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get()
  getBalance(@CurrentUser() user: AuthUser) {
    return this.walletService.getBalance(user.userId);
  }

  @Get('history')
  getHistory(@CurrentUser() user: AuthUser, @Query() query: PaginationQueryDto) {
    return this.walletService.getHistory(
      user.userId,
      query.page ?? 1,
      query.limit ?? 20,
    );
  }

  @Post('recharge')
  createRecharge(@CurrentUser() user: AuthUser, @Body() dto: CreateRechargeDto) {
    return this.walletService.createRechargeOrder(user.userId, dto.amountInr);
  }

  @Post('recharge/verify')
  verifyRecharge(@CurrentUser() user: AuthUser, @Body() dto: VerifyRechargeDto) {
    return this.walletService.verifyRecharge(user.userId, dto);
  }
}
