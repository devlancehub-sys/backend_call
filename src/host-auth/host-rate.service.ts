import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import {
  BOY_RATES_PER_MINUTE,
  CreatorEarningRate,
  creatorEarningFromBoyRate,
  hostEarningPerMinute,
  isBoyRatePerMinute,
  listCreatorRateOptions,
  normalizeStoredBoyRate,
} from '../common/utils/creator-rate.util';
import {
  hostSharePercentageForTier,
  hostTierFromDurationSeconds,
  platformCommissionForTier,
} from '../common/utils/host-tier.util';
import { RECORD_STATUS } from '../common/constants/record-status';

@Injectable()
export class HostRateService {
  constructor(private db: DatabaseService) {}

  async getRateProfile(hostId: number) {
    const row = await this.getHostRow(hostId);
    const rawRate = Math.round(parseFloat(String(row.rate_per_minute ?? 0)));
    const boyRate = normalizeStoredBoyRate(row.rate_per_minute);
    const earningRate = isBoyRatePerMinute(rawRate)
      ? rawRate
      : (creatorEarningFromBoyRate(boyRate) ?? 0);
    const tier = hostTierFromDurationSeconds(Number(row.total_duration_seconds ?? 0));
    const hostShare = hostSharePercentageForTier(tier);

    return {
      success: true,
      data: {
        earning_rate: earningRate,
        boy_rate_per_minute: boyRate,
        is_promoted: !!row.is_featured,
        creator_tier: tier,
        host_share_percentage: hostShare,
        platform_commission_percentage: platformCommissionForTier(tier),
        host_earning_per_minute: hostEarningPerMinute(boyRate, hostShare),
        options: listCreatorRateOptions(hostShare),
      },
    };
  }

  async setRate(hostId: number, earningRate: number) {
    if (!isBoyRatePerMinute(earningRate)) {
      throw new BadRequestException('Rate must be one of 6, 12, 18, 24, or 40 per minute');
    }

    const row = await this.getHostRow(hostId);
    if (row.host_status === 'available') {
      throw new BadRequestException('Go offline or turn Busy before changing your rate');
    }

    await this.db.query('UPDATE female_hosts SET rate_per_minute = ? WHERE user_id = ?', [
      earningRate,
      hostId,
    ]);

    return this.getRateProfile(hostId);
  }

  async resolveBillingRate(hostId: number): Promise<{
    boyRatePerMinute: number;
    earningRate: CreatorEarningRate;
    isPromoted: boolean;
    commissionPct: number;
    creatorTier: ReturnType<typeof hostTierFromDurationSeconds>;
    hostSharePct: number;
  }> {
    const row = await this.getHostRow(hostId);
    const boyRate = normalizeStoredBoyRate(row.rate_per_minute);
    const tier = creatorEarningFromBoyRate(boyRate);
    const earningRate: CreatorEarningRate = tier ?? BOY_RATES_PER_MINUTE[0];
    const creatorTier = hostTierFromDurationSeconds(Number(row.total_duration_seconds ?? 0));
    const hostSharePct = hostSharePercentageForTier(creatorTier);

    return {
      boyRatePerMinute: boyRate,
      earningRate,
      isPromoted: !!row.is_featured,
      commissionPct: platformCommissionForTier(creatorTier),
      creatorTier,
      hostSharePct,
    };
  }

  earningPerMinute(boyRate: number, hostSharePct: number): number {
    return hostEarningPerMinute(boyRate, hostSharePct);
  }

  private async getHostRow(hostId: number) {
    const rows = await this.db.query<any[]>(
      `SELECT fh.rate_per_minute, fh.host_status, fh.is_featured, fh.total_duration_seconds
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
