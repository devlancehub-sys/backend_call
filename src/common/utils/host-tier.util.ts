/** Creator level based on lifetime talk minutes on the platform. */
export enum HostTier {
  IRON = 'iron',
  SILVER = 'silver',
  GOLD = 'gold',
  DIAMOND = 'diamond',
}

export const HOST_TIER_THRESHOLDS = {
  silver: 60,
  gold: 120,
  diamond: 180,
} as const;

export const HOST_TIER_CALL_RATES: Record<HostTier, number> = {
  iron: 6,
  silver: 12,
  gold: 18,
  diamond: 24,
} as const;

/** Day host share of per-minute call rate by creator level (remainder = platform). */
export const DAY_HOST_SHARE_BY_TIER: Record<HostTier, number> = {
  iron: 45,
  silver: 45,
  gold: 55,
  diamond: 65,
};

/** Night host share of per-minute call rate by creator level (remainder = platform). */
export const NIGHT_HOST_SHARE_BY_TIER: Record<HostTier, number> = {
  iron: 50,
  silver: 50,
  gold: 60,
  diamond: 70,
};

export interface HostTierProfile {
  creator_tier: HostTier;
  creator_tier_label: string;
  total_talk_minutes: number;
  next_tier: HostTier | null;
  next_tier_label: string | null;
  minutes_to_next_tier: number;
  call_rate: number;
  day_host_share_percentage: number;
  day_platform_share_percentage: number;
  night_host_share_percentage: number;
  night_platform_share_percentage: number;
}

export function talkMinutesFromSeconds(totalDurationSeconds: number): number {
  return Math.floor(Math.max(0, totalDurationSeconds) / 60);
}

export function hostTierFromTalkMinutes(minutes: number): HostTier {
  if (minutes >= HOST_TIER_THRESHOLDS.diamond) return HostTier.DIAMOND;
  if (minutes >= HOST_TIER_THRESHOLDS.gold) return HostTier.GOLD;
  if (minutes >= HOST_TIER_THRESHOLDS.silver) return HostTier.SILVER;
  return HostTier.IRON;
}

export function hostTierFromDurationSeconds(totalDurationSeconds: number): HostTier {
  return hostTierFromTalkMinutes(talkMinutesFromSeconds(totalDurationSeconds));
}

export function hostTierLabel(tier: HostTier): string {
  switch (tier) {
    case HostTier.IRON:
      return 'Iron';
    case HostTier.SILVER:
      return 'Silver';
    case HostTier.GOLD:
      return 'Gold';
    case HostTier.DIAMOND:
      return 'Diamond';
  }
}

export function dayHostSharePercentageForTier(tier: HostTier): number {
  return DAY_HOST_SHARE_BY_TIER[tier];
}

export function dayPlatformSharePercentageForTier(tier: HostTier): number {
  return 100 - dayHostSharePercentageForTier(tier);
}

export function nightHostSharePercentageForTier(tier: HostTier): number {
  return NIGHT_HOST_SHARE_BY_TIER[tier];
}

export function nightPlatformSharePercentageForTier(tier: HostTier): number {
  return 100 - nightHostSharePercentageForTier(tier);
}

export function callRateForTier(tier: HostTier): number {
  return HOST_TIER_CALL_RATES[tier];
}

export function buildHostTierProfile(totalDurationSeconds: number): HostTierProfile {
  const totalTalkMinutes = talkMinutesFromSeconds(totalDurationSeconds);
  const creatorTier = hostTierFromTalkMinutes(totalTalkMinutes);

  let nextTier: HostTier | null = null;
  let minutesToNext = 0;

  switch (creatorTier) {
    case HostTier.IRON:
      nextTier = HostTier.SILVER;
      minutesToNext = HOST_TIER_THRESHOLDS.silver - totalTalkMinutes;
      break;
    case HostTier.SILVER:
      nextTier = HostTier.GOLD;
      minutesToNext = HOST_TIER_THRESHOLDS.gold - totalTalkMinutes;
      break;
    case HostTier.GOLD:
      nextTier = HostTier.DIAMOND;
      minutesToNext = HOST_TIER_THRESHOLDS.diamond - totalTalkMinutes;
      break;
    case HostTier.DIAMOND:
      break;
  }

  return {
    creator_tier: creatorTier,
    creator_tier_label: hostTierLabel(creatorTier),
    total_talk_minutes: totalTalkMinutes,
    next_tier: nextTier,
    next_tier_label: nextTier ? hostTierLabel(nextTier) : null,
    minutes_to_next_tier: Math.max(0, minutesToNext),
    call_rate: callRateForTier(creatorTier),
    day_host_share_percentage: dayHostSharePercentageForTier(creatorTier),
    day_platform_share_percentage: dayPlatformSharePercentageForTier(creatorTier),
    night_host_share_percentage: nightHostSharePercentageForTier(creatorTier),
    night_platform_share_percentage: nightPlatformSharePercentageForTier(creatorTier),
  };
}

export function withCreatorTierFields(host: Record<string, unknown>): Record<string, unknown> {
  const seconds = Number(host.total_duration_seconds ?? 0);
  return { ...host, ...buildHostTierProfile(seconds) };
}

/**
 * @deprecated Use dayHostSharePercentageForTier or nightHostSharePercentageForTier instead.
 * This function is kept for backward compatibility and defaults to day share.
 */
export function hostSharePercentageForTier(tier: HostTier): number {
  return dayHostSharePercentageForTier(tier);
}

/**
 * @deprecated Use dayPlatformSharePercentageForTier or nightPlatformSharePercentageForTier instead.
 * This function is kept for backward compatibility and defaults to day share.
 */
export function platformCommissionForTier(tier: HostTier): number {
  return dayPlatformSharePercentageForTier(tier);
}
