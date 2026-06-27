/** Creator level based on lifetime talk minutes on the platform. */
export type HostTier = 'iron' | 'silver' | 'gold' | 'diamond';

export const HOST_TIER_THRESHOLDS = {
  silver: 60,
  gold: 120,
  diamond: 280,
} as const;

/** Host share of per-minute call rate by creator level (remainder = platform). */
export const HOST_SHARE_BY_TIER: Record<HostTier, number> = {
  iron: 50,
  silver: 55,
  gold: 60,
  diamond: 65,
};

export interface HostTierProfile {
  creator_tier: HostTier;
  creator_tier_label: string;
  total_talk_minutes: number;
  next_tier: HostTier | null;
  next_tier_label: string | null;
  minutes_to_next_tier: number;
  host_share_percentage: number;
  platform_commission_percentage: number;
}

export function talkMinutesFromSeconds(totalDurationSeconds: number): number {
  return Math.floor(Math.max(0, totalDurationSeconds) / 60);
}

export function hostTierFromTalkMinutes(minutes: number): HostTier {
  if (minutes >= HOST_TIER_THRESHOLDS.diamond) return 'diamond';
  if (minutes >= HOST_TIER_THRESHOLDS.gold) return 'gold';
  if (minutes >= HOST_TIER_THRESHOLDS.silver) return 'silver';
  return 'iron';
}

export function hostTierFromDurationSeconds(totalDurationSeconds: number): HostTier {
  return hostTierFromTalkMinutes(talkMinutesFromSeconds(totalDurationSeconds));
}

export function hostTierLabel(tier: HostTier): string {
  switch (tier) {
    case 'iron':
      return 'Iron';
    case 'silver':
      return 'Silver';
    case 'gold':
      return 'Gold';
    case 'diamond':
      return 'Diamond';
  }
}

export function hostSharePercentageForTier(tier: HostTier): number {
  return HOST_SHARE_BY_TIER[tier];
}

export function platformCommissionForTier(tier: HostTier): number {
  return 100 - hostSharePercentageForTier(tier);
}

export function buildHostTierProfile(totalDurationSeconds: number): HostTierProfile {
  const totalTalkMinutes = talkMinutesFromSeconds(totalDurationSeconds);
  const creatorTier = hostTierFromTalkMinutes(totalTalkMinutes);

  let nextTier: HostTier | null = null;
  let minutesToNext = 0;

  switch (creatorTier) {
    case 'iron':
      nextTier = 'silver';
      minutesToNext = HOST_TIER_THRESHOLDS.silver - totalTalkMinutes;
      break;
    case 'silver':
      nextTier = 'gold';
      minutesToNext = HOST_TIER_THRESHOLDS.gold - totalTalkMinutes;
      break;
    case 'gold':
      nextTier = 'diamond';
      minutesToNext = HOST_TIER_THRESHOLDS.diamond - totalTalkMinutes;
      break;
    case 'diamond':
      break;
  }

  return {
    creator_tier: creatorTier,
    creator_tier_label: hostTierLabel(creatorTier),
    total_talk_minutes: totalTalkMinutes,
    next_tier: nextTier,
    next_tier_label: nextTier ? hostTierLabel(nextTier) : null,
    minutes_to_next_tier: Math.max(0, minutesToNext),
    host_share_percentage: hostSharePercentageForTier(creatorTier),
    platform_commission_percentage: platformCommissionForTier(creatorTier),
  };
}

export function withCreatorTierFields(host: Record<string, unknown>): Record<string, unknown> {
  const seconds = Number(host.total_duration_seconds ?? 0);
  return { ...host, ...buildHostTierProfile(seconds) };
}
