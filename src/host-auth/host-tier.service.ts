import { Injectable, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import {
  buildHostTierProfile,
  hostTierFromDurationSeconds,
  HostTier,
  dayHostSharePercentageForTier,
  dayPlatformSharePercentageForTier,
  nightHostSharePercentageForTier,
  nightPlatformSharePercentageForTier,
  callRateForTier,
  hostTierLabel,
  HOST_TIER_THRESHOLDS,
} from '../common/utils/host-tier.util';
import { ChangeTierDto, TierInfoDto, TierProgressDto } from './dto/tier.dto';

@Injectable()
export class HostTierService {
  constructor(private db: DatabaseService) {}

  async getTierProfile(hostId: number) {
    const seconds = await this.getTotalDurationSeconds(hostId);
    return { success: true, data: buildHostTierProfile(seconds) };
  }

  async getHostTier(hostId: number): Promise<HostTier> {
    const seconds = await this.getTotalDurationSeconds(hostId);
    return hostTierFromDurationSeconds(seconds);
  }

  async getTierInfo(userId: number): Promise<TierInfoDto> {
    const host = await this.db.query(
      `SELECT active_tier, lifetime_talk_minutes, rate_per_minute,
              day_host_share, day_platform_share, night_host_share, night_platform_share,
              is_content_creator, is_diamond_approved
       FROM female_hosts WHERE user_id = ?`,
      [userId],
    );

    if (!host || host.length === 0) {
      throw new BadRequestException('Host not found');
    }

    const h = host[0];
    return {
      active_tier: h.active_tier as HostTier,
      lifetime_talk_minutes: h.lifetime_talk_minutes,
      call_rate: h.rate_per_minute,
      day_host_share: h.day_host_share,
      day_platform_share: h.day_platform_share,
      night_host_share: h.night_host_share,
      night_platform_share: h.night_platform_share,
      is_content_creator: !!h.is_content_creator,
      is_diamond_approved: !!h.is_diamond_approved,
    };
  }

  async getTierProgress(userId: number): Promise<TierProgressDto> {
    const host = await this.db.query(
      `SELECT active_tier, lifetime_talk_minutes, is_diamond_approved
       FROM female_hosts WHERE user_id = ?`,
      [userId],
    );

    if (!host || host.length === 0) {
      throw new BadRequestException('Host not found');
    }

    const h = host[0];
    const currentTier = h.active_tier as HostTier;
    const lifetimeMinutes = h.lifetime_talk_minutes;
    const isDiamondApproved = !!h.is_diamond_approved;

    const unlockedTiers: HostTier[] = [HostTier.IRON];
    const lockedTiers: HostTier[] = [];

    if (lifetimeMinutes >= HOST_TIER_THRESHOLDS.silver) {
      unlockedTiers.push(HostTier.SILVER);
    } else {
      lockedTiers.push(HostTier.SILVER);
    }

    if (lifetimeMinutes >= HOST_TIER_THRESHOLDS.gold) {
      unlockedTiers.push(HostTier.GOLD);
    } else {
      lockedTiers.push(HostTier.GOLD);
    }

    if (lifetimeMinutes >= HOST_TIER_THRESHOLDS.diamond && isDiamondApproved) {
      unlockedTiers.push(HostTier.DIAMOND);
    } else {
      lockedTiers.push(HostTier.DIAMOND);
    }

    let nextTier: HostTier | null = null;
    let minutesToNext = 0;

    if (currentTier === HostTier.IRON) {
      nextTier = HostTier.SILVER;
      minutesToNext = HOST_TIER_THRESHOLDS.silver - lifetimeMinutes;
    } else if (currentTier === HostTier.SILVER) {
      nextTier = HostTier.GOLD;
      minutesToNext = HOST_TIER_THRESHOLDS.gold - lifetimeMinutes;
    } else if (currentTier === HostTier.GOLD) {
      nextTier = HostTier.DIAMOND;
      minutesToNext = HOST_TIER_THRESHOLDS.diamond - lifetimeMinutes;
    }

    return {
      current_tier: currentTier,
      current_tier_label: hostTierLabel(currentTier),
      lifetime_talk_minutes: lifetimeMinutes,
      next_tier: nextTier,
      next_tier_label: nextTier ? hostTierLabel(nextTier) : null,
      minutes_to_next_tier: Math.max(0, minutesToNext),
      unlocked_tiers: unlockedTiers,
      locked_tiers: lockedTiers,
    };
  }

  async changeTier(userId: number, dto: ChangeTierDto): Promise<void> {
    const host = await this.db.query(
      `SELECT active_tier, lifetime_talk_minutes, is_diamond_approved
       FROM female_hosts WHERE user_id = ?`,
      [userId],
    );

    if (!host || host.length === 0) {
      throw new BadRequestException('Host not found');
    }

    const h = host[0];
    const requestedTier = dto.tier;
    const lifetimeMinutes = h.lifetime_talk_minutes;
    const isDiamondApproved = !!h.is_diamond_approved;

    let isUnlocked = false;

    switch (requestedTier) {
      case HostTier.IRON:
        isUnlocked = true;
        break;
      case HostTier.SILVER:
        isUnlocked = lifetimeMinutes >= HOST_TIER_THRESHOLDS.silver;
        break;
      case HostTier.GOLD:
        isUnlocked = lifetimeMinutes >= HOST_TIER_THRESHOLDS.gold;
        break;
      case HostTier.DIAMOND:
        isUnlocked = lifetimeMinutes >= HOST_TIER_THRESHOLDS.diamond && isDiamondApproved;
        break;
    }

    if (!isUnlocked) {
      throw new BadRequestException('Tier is not unlocked yet');
    }

    const callRate = callRateForTier(requestedTier);
    const dayHostShare = dayHostSharePercentageForTier(requestedTier);
    const dayPlatformShare = dayPlatformSharePercentageForTier(requestedTier);
    const nightHostShare = nightHostSharePercentageForTier(requestedTier);
    const nightPlatformShare = nightPlatformSharePercentageForTier(requestedTier);

    await this.db.query(
      `UPDATE female_hosts
       SET active_tier = ?, rate_per_minute = ?,
           day_host_share = ?, day_platform_share = ?,
           night_host_share = ?, night_platform_share = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE user_id = ?`,
      [
        requestedTier,
        callRate,
        dayHostShare,
        dayPlatformShare,
        nightHostShare,
        nightPlatformShare,
        userId,
      ],
    );
  }

  /** Recompute lifetime talk seconds from ended calls — used by nightly cron. */
  async reconcileAllHostTalkTotals(): Promise<{ hosts_updated: number }> {
    const result = await this.db.query<any>(
      `UPDATE female_hosts fh
       LEFT JOIN (
         SELECT host_id, COALESCE(SUM(duration_seconds), 0) AS total_secs
         FROM calls
         WHERE status = 'ended'
         GROUP BY host_id
       ) agg ON agg.host_id = fh.user_id
       SET fh.total_duration_seconds = COALESCE(agg.total_secs, 0)`,
    );

    const hostsUpdated = Number((result as { affectedRows?: number })?.affectedRows ?? 0);
    return { hosts_updated: hostsUpdated };
  }

  private async getTotalDurationSeconds(hostId: number): Promise<number> {
    const rows = await this.db.query<{ total_duration_seconds: number }[]>(
      `SELECT total_duration_seconds FROM female_hosts WHERE user_id = ? LIMIT 1`,
      [hostId],
    );
    return Number(rows[0]?.total_duration_seconds ?? 0);
  }
}
