/** Per-minute rates boys pay — creator picks one before going available. */
export const BOY_RATES_PER_MINUTE = [6, 12, 18, 24, 40] as const;

export type BoyRatePerMinute = (typeof BOY_RATES_PER_MINUTE)[number];

/** Alias kept for existing imports. */
export const CREATOR_EARNING_RATES = BOY_RATES_PER_MINUTE;
export type CreatorEarningRate = BoyRatePerMinute;

/** Default host share for Iron (new creators). */
export const HOST_SHARE_PERCENTAGE = 50;
export const PLATFORM_COMMISSION_PERCENTAGE = 50;

export function isBoyRatePerMinute(value: number): value is BoyRatePerMinute {
  return BOY_RATES_PER_MINUTE.includes(value as BoyRatePerMinute);
}

export function isCreatorEarningRate(value: number): value is CreatorEarningRate {
  return isBoyRatePerMinute(value);
}

export function boyRateFromCreatorEarning(earning: CreatorEarningRate): number {
  return earning;
}

export function creatorEarningFromBoyRate(boyRate: number): CreatorEarningRate | null {
  const normalized = Math.round(Number(boyRate));
  return isBoyRatePerMinute(normalized) ? normalized : null;
}

export function hostEarningPerMinute(
  boyRatePerMinute: number,
  hostSharePct = HOST_SHARE_PERCENTAGE,
): number {
  const rate = resolveBoyRatePerMinute(boyRatePerMinute);
  const share = Number.isFinite(hostSharePct) ? hostSharePct : HOST_SHARE_PERCENTAGE;
  return parseFloat(((rate * share) / 100).toFixed(2));
}

export function resolveBoyRatePerMinute(storedRate: number): number {
  const parsed = Math.round(Number(storedRate));
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return BOY_RATES_PER_MINUTE[0];
  }
  if (isBoyRatePerMinute(parsed)) return parsed;
  return BOY_RATES_PER_MINUTE[0];
}

export function normalizeStoredBoyRate(raw: unknown): number {
  return resolveBoyRatePerMinute(parseFloat(String(raw ?? BOY_RATES_PER_MINUTE[0])));
}

export function listCreatorRateOptions(hostSharePct = HOST_SHARE_PERCENTAGE) {
  const share = Number.isFinite(hostSharePct) ? hostSharePct : HOST_SHARE_PERCENTAGE;
  return BOY_RATES_PER_MINUTE.map((boyRate) => ({
    earning_rate: boyRate,
    boy_rate_per_minute: boyRate,
    host_earning_per_minute: hostEarningPerMinute(boyRate, share),
    host_share_percentage: share,
  }));
}
