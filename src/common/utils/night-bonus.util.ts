export function isNightTime(): boolean {
  const now = new Date();
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const currentTime = hours * 60 + minutes;

  const nightStart = 20 * 60;
  const nightEnd = 9 * 60;

  if (nightStart <= currentTime || currentTime < nightEnd) {
    return true;
  }
  return false;
}

export function getRevenueShare(tier: string, isNight: boolean): { hostShare: number; platformShare: number } {
  const dayShares: Record<string, { hostShare: number; platformShare: number }> = {
    iron: { hostShare: 45, platformShare: 55 },
    silver: { hostShare: 45, platformShare: 55 },
    gold: { hostShare: 55, platformShare: 45 },
    diamond: { hostShare: 65, platformShare: 35 },
  };

  const nightShares: Record<string, { hostShare: number; platformShare: number }> = {
    iron: { hostShare: 50, platformShare: 50 },
    silver: { hostShare: 50, platformShare: 50 },
    gold: { hostShare: 60, platformShare: 40 },
    diamond: { hostShare: 70, platformShare: 30 },
  };

  return isNight ? nightShares[tier] : dayShares[tier];
}
