/** Host level unlocks per-minute rates from ₹10 to ₹18. */
export const RATE_BY_LEVEL: Record<number, number> = {
  1: 10,
  2: 12,
  3: 14,
  4: 16,
  5: 18,
};

export const LEVEL_THRESHOLDS = [
  { level: 5, minCalls: 500 },
  { level: 4, minCalls: 200 },
  { level: 3, minCalls: 100 },
  { level: 2, minCalls: 50 },
  { level: 1, minCalls: 0 },
];

export function getHostLevel(totalCalls: number): number {
  const calls = Math.max(0, totalCalls);
  for (const tier of LEVEL_THRESHOLDS) {
    if (calls >= tier.minCalls) return tier.level;
  }
  return 1;
}

export function getRateForLevel(level: number): number {
  return RATE_BY_LEVEL[level] ?? RATE_BY_LEVEL[1];
}

/** Effective call rate based on host level (unlocked tier). */
export function resolveEffectiveRate(totalCalls: number): number {
  return getRateForLevel(getHostLevel(totalCalls));
}

export function enrichHostRates<T extends { total_calls?: number; rate_per_minute?: number }>(
  host: T,
): T & { host_level: number; rate_per_minute: number } {
  const totalCalls = parseInt(String(host.total_calls ?? 0), 10);
  const level = getHostLevel(totalCalls);
  return {
    ...host,
    host_level: level,
    rate_per_minute: getRateForLevel(level),
  };
}
