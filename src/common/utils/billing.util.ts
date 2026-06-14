export const DEFAULT_COMMISSION_PERCENTAGE = 40;

/**
 * Bill by full minutes (ceil). Any connected call bills at least 1 minute.
 * Platform takes commissionPct%; host gets the remainder.
 */
export const calculateBilling = (
  durationSeconds: number,
  ratePerMinute: number,
  commissionPct = DEFAULT_COMMISSION_PERCENTAGE,
) => {
  const seconds = Math.max(0, Math.floor(durationSeconds));
  const billableMinutes = seconds <= 0 ? 1 : Math.ceil(seconds / 60);
  const totalAmount = billableMinutes * ratePerMinute;
  const platformCommission = (totalAmount * commissionPct) / 100;
  const hostEarning = totalAmount - platformCommission;

  return {
    billableMinutes,
    totalAmount: parseFloat(totalAmount.toFixed(2)),
    hostEarning: parseFloat(hostEarning.toFixed(2)),
    platformCommission: parseFloat(platformCommission.toFixed(2)),
  };
};
