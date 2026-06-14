export const calculateBilling = (durationSeconds: number, ratePerMinute: number, commissionPct = 30) => {
  const minutes = Math.ceil(durationSeconds / 60);
  const totalAmount = minutes * ratePerMinute;
  const platformCommission = (totalAmount * commissionPct) / 100;
  const hostEarning = totalAmount - platformCommission;

  return {
    minutes,
    totalAmount: parseFloat(totalAmount.toFixed(2)),
    hostEarning: parseFloat(hostEarning.toFixed(2)),
    platformCommission: parseFloat(platformCommission.toFixed(2)),
  };
};
