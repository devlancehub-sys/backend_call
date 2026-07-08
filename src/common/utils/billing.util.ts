export const DEFAULT_COMMISSION_PERCENTAGE = 50;
export const FREE_CALL_MAX_SECONDS = 60;

export interface TierRevenueShare {
  hostShare: number;
  platformShare: number;
}

export interface BillingResult {
  billableMinutes: number;
  totalAmount: number;
  hostEarning: number;
  platformCommission: number;
  isNight: boolean;
}

/**
 * Bill by full minutes (ceil). Any connected call bills at least 1 minute.
 * Uses tier-based revenue sharing with day/night bonus.
 */
export const calculateBilling = (
  durationSeconds: number,
  ratePerMinute: number,
  tierRevenueShare: TierRevenueShare,
  isNight: boolean,
): BillingResult => {
  const safeDuration = Number.isFinite(durationSeconds) ? durationSeconds : 0;
  const safeRate = Number.isFinite(ratePerMinute) ? ratePerMinute : 0;
  const seconds = Math.max(0, Math.floor(safeDuration));
  const billableMinutes = seconds <= 0 ? 1 : Math.ceil(seconds / 60);
  const totalAmount = billableMinutes * safeRate;
  const hostEarning = (totalAmount * tierRevenueShare.hostShare) / 100;
  const platformCommission = totalAmount - hostEarning;

  return {
    billableMinutes,
    totalAmount: parseFloat(totalAmount.toFixed(2)),
    hostEarning: parseFloat(hostEarning.toFixed(2)),
    platformCommission: parseFloat(platformCommission.toFixed(2)),
    isNight,
  };
};

/**
 * Legacy billing function for backward compatibility.
 * Platform takes commissionPct%; host gets the remainder.
 */
export const calculateLegacyBilling = (
  durationSeconds: number,
  ratePerMinute: number,
  commissionPct = DEFAULT_COMMISSION_PERCENTAGE,
) => {
  const safeDuration = Number.isFinite(durationSeconds) ? durationSeconds : 0;
  const safeRate = Number.isFinite(ratePerMinute) ? ratePerMinute : 0;
  const safeCommission = Number.isFinite(commissionPct) ? commissionPct : DEFAULT_COMMISSION_PERCENTAGE;
  const seconds = Math.max(0, Math.floor(safeDuration));
  const billableMinutes = seconds <= 0 ? 1 : Math.ceil(seconds / 60);
  const totalAmount = billableMinutes * safeRate;
  const platformCommission = (totalAmount * safeCommission) / 100;
  const hostEarning = totalAmount - platformCommission;

  return {
    billableMinutes,
    totalAmount: parseFloat(totalAmount.toFixed(2)),
    hostEarning: parseFloat(hostEarning.toFixed(2)),
    platformCommission: parseFloat(platformCommission.toFixed(2)),
  };
};

export type BillingBreakdown = {
  billableMinutes: number;
  freeMinutes: number;
  paidMinutes: number;
  totalAmount: number;
  paidAmount: number;
  hostEarning: number;
  platformCommission: number;
};

/**
 * First minute is free for the boy — host earns ₹0 on the free minute.
 * Additional time is billed normally from the boy wallet with tier-based revenue sharing.
 */
export const calculateFreeCallBilling = (
  durationSeconds: number,
  ratePerMinute: number,
  tierRevenueShare: TierRevenueShare,
  isNight: boolean,
): BillingBreakdown => {
  const seconds = Math.max(0, Math.floor(Number.isFinite(durationSeconds) ? durationSeconds : 0));
  const freeSeconds = Math.min(seconds, FREE_CALL_MAX_SECONDS);
  const paidSeconds = Math.max(0, seconds - FREE_CALL_MAX_SECONDS);

  const freeMinutes = freeSeconds > 0 ? 1 : 0;

  const paidPortion =
    paidSeconds > 0
      ? calculateBilling(paidSeconds, ratePerMinute, tierRevenueShare, isNight)
      : {
          billableMinutes: 0,
          totalAmount: 0,
          hostEarning: 0,
          platformCommission: 0,
          isNight,
        };

  return {
    billableMinutes: freeMinutes + paidPortion.billableMinutes,
    freeMinutes,
    paidMinutes: paidPortion.billableMinutes,
    totalAmount: paidPortion.totalAmount,
    paidAmount: paidPortion.totalAmount,
    hostEarning: paidPortion.hostEarning,
    platformCommission: paidPortion.platformCommission,
  };
};
