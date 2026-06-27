/** Creator picks earning tier; boy is billed at the mapped per-minute rate. */
export const CREATOR_EARNING_RATES = [6, 12, 18, 24] as const;

export type CreatorEarningRate = (typeof CREATOR_EARNING_RATES)[number];

const BOY_RATE_BY_EARNING: Record<CreatorEarningRate, number> = {
  6: 10,
  12: 20,
  18: 30,
  24: 40,
};

const EARNING_BY_BOY_RATE = new Map<number, CreatorEarningRate>(
  CREATOR_EARNING_RATES.map((earning) => [BOY_RATE_BY_EARNING[earning], earning]),
);

export function isCreatorEarningRate(value: number): value is CreatorEarningRate {
  return CREATOR_EARNING_RATES.includes(value as CreatorEarningRate);
}

export function boyRateFromCreatorEarning(earning: CreatorEarningRate): number {
  return BOY_RATE_BY_EARNING[earning];
}

export function creatorEarningFromBoyRate(boyRate: number): CreatorEarningRate | null {
  const normalized = Math.round(Number(boyRate));
  return EARNING_BY_BOY_RATE.get(normalized) ?? null;
}

export function resolveBoyRatePerMinute(storedRate: number): number {
  const parsed = Number(storedRate);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return BOY_RATE_BY_EARNING[6];
  }
  if (EARNING_BY_BOY_RATE.has(Math.round(parsed))) {
    return Math.round(parsed);
  }
  if (isCreatorEarningRate(Math.round(parsed))) {
    return boyRateFromCreatorEarning(Math.round(parsed) as CreatorEarningRate);
  }
  return BOY_RATE_BY_EARNING[6];
}

export function normalizeStoredBoyRate(raw: unknown): number {
  return resolveBoyRatePerMinute(parseFloat(String(raw ?? BOY_RATE_BY_EARNING[6])));
}

export function listCreatorRateOptions(
  isPromoted: boolean,
  promotedHostSharePct = 60,
  standardHostSharePct = 50,
) {
  const hostSharePct = isPromoted ? promotedHostSharePct : standardHostSharePct;
  return CREATOR_EARNING_RATES.map((earning) => {
    const boyRate = boyRateFromCreatorEarning(earning);
    const hostEarningPerMinute = parseFloat(((boyRate * hostSharePct) / 100).toFixed(2));
    return {
      earning_rate: earning,
      boy_rate_per_minute: boyRate,
      host_earning_per_minute: hostEarningPerMinute,
      host_share_percentage: hostSharePct,
    };
  });
}
