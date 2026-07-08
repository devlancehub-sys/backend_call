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
  const dayShares: Record<string, { host: number; platform: number }> = {
    iron: { host: 45, platform: 55 },
    silver: { host: 45, platform: 55 },
    gold: { host: 55, platform: 45 },
    diamond: { host: 65, platform: 35 },
  };

  const nightShares: Record<string, { host: number; platform: number }> = {
    iron: { host: 50, platform: 50 },
    silver: { host: 50, platform: 50 },
    gold: { host: 60, platform: 40 },
    diamond: { host: 70, platform: 30 },
  };

  return isNight ? nightShares[tier] : dayShares[tier];
}
