import { Controller, Get, UseGuards } from '@nestjs/common';
import { ReferralsService } from './referrals.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('referrals')
@UseGuards(JwtAuthGuard)
export class ReferralsController {
  constructor(private referralsService: ReferralsService) {}

  @Get('my-code')
  async getMyReferralCode(@CurrentUser('id') userId: number) {
    const code = await this.referralsService.generateReferralCode(userId);
    return { success: true, referral_code: code };
  }

  @Get('stats')
  async getReferralStats(@CurrentUser('id') userId: number) {
    const stats = await this.referralsService.getReferralStats(userId);
    return { success: true, data: stats };
  }

  @Get('history')
  async getReferralHistory(@CurrentUser('id') userId: number) {
    const history = await this.referralsService.getReferralHistory(userId);
    return { success: true, data: history };
  }
}
