import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { PlatformSettingsService } from '../common/services/platform-settings.service';
import {
  CREATOR_EARNING_RATES,
  CreatorEarningRate,
  boyRateFromCreatorEarning,
  creatorEarningFromBoyRate,
  listCreatorRateOptions,
  normalizeStoredBoyRate,
} from '../common/utils/creator-rate.util';
import { RECORD_STATUS } from '../common/constants/record-status';

@Injectable()
export class HostRateService {
  constructor(
    private db: DatabaseService,
    private platformSettings: PlatformSettingsService,
  ) {}

  async getRateProfile(hostId: number) {
    const row = await this.getHostRow(hostId);
    const boyRate = normalizeStoredBoyRate(row.rate_per_minute);
    const earningRate = creatorEarningFromBoyRate(boyRate) ?? 6;
    const isPromoted = !!row.is_featured;
    const promotedShare = 100 - this.platformSettings.getPromotedCommissionPercentage();
    const standardShare = 100 - this.platformSettings.getStandardCommissionPercentage();

    return {
      success: true,
      data: {
        earning_rate: earningRate,
        boy_rate_per_minute: boyRate,
        is_promoted: isPromoted,
        host_share_percentage: isPromoted ? promotedShare : standardShare,
        host_earning_per_minute: this.earningPerMinute(boyRate, isPromoted),
        options: listCreatorRateOptions(
          isPromoted,
          promotedShare,
          standardShare,
        ),
      },
    };
  }

  async setRate(hostId: number, earningRate: number) {
    if (!CREATOR_EARNING_RATES.includes(earningRate as CreatorEarningRate)) {
      throw new BadRequestException('Rate must be one of 6, 12, 18, or 24');
    }

    const row = await this.getHostRow(hostId);
    if (row.host_status === 'available' || row.host_status === 'busy') {
      throw new BadRequestException('Go offline before changing your rate');
    }

    const boyRate = boyRateFromCreatorEarning(earningRate as CreatorEarningRate);
    await this.db.query('UPDATE female_hosts SET rate_per_minute = ? WHERE user_id = ?', [
      boyRate,
      hostId,
    ]);

    return this.getRateProfile(hostId);
  }

  async resolveBillingRate(hostId: number): Promise<{
    boyRatePerMinute: number;
    earningRate: CreatorEarningRate;
    isPromoted: boolean;
    commissionPct: number;
  }> {
    const row = await this.getHostRow(hostId);
    const boyRate = normalizeStoredBoyRate(row.rate_per_minute);
    const earningRate = creatorEarningFromBoyRate(boyRate) ?? 6;
    const isPromoted = !!row.is_featured;
    const commissionPct = isPromoted
      ? this.platformSettings.getPromotedCommissionPercentage()
      : this.platformSettings.getStandardCommissionPercentage();

    return {
      boyRatePerMinute: boyRate,
      earningRate,
      isPromoted,
      commissionPct,
    };
  }

  earningPerMinute(boyRate: number, isPromoted: boolean): number {
    const commissionPct = isPromoted
      ? this.platformSettings.getPromotedCommissionPercentage()
      : this.platformSettings.getStandardCommissionPercentage();
    return parseFloat((boyRate * (1 - commissionPct / 100)).toFixed(2));
  }

  private async getHostRow(hostId: number) {
    const rows = await this.db.query<any[]>(
      `SELECT fh.rate_per_minute, fh.host_status, fh.is_featured
       FROM female_hosts fh
       JOIN users u ON u.id = fh.user_id
       WHERE fh.user_id = ? AND u.role = 'female' AND u.status = ?`,
      [hostId, RECORD_STATUS.ACTIVE],
    );
    if (!rows.length) {
      throw new ForbiddenException('Female host profile not found');
    }
    return rows[0];
  }
}
