export type RechargePack = {
  pay_amount: number;
  credit_amount: number;
  bonus_amount: number;
};

export const RECHARGE_PACKS: RechargePack[] = [
  { pay_amount: 36, credit_amount: 36, bonus_amount: 0 },
  { pay_amount: 60, credit_amount: 60, bonus_amount: 0 },
  { pay_amount: 300, credit_amount: 312, bonus_amount: 12 },
  { pay_amount: 600, credit_amount: 636, bonus_amount: 36 },
  { pay_amount: 1200, credit_amount: 1260, bonus_amount: 60 },
  { pay_amount: 1800, credit_amount: 1896, bonus_amount: 96 },
  { pay_amount: 2400, credit_amount: 2556, bonus_amount: 156 },
];

export function getRechargePack(payAmount: number): RechargePack | null {
  const normalized = Math.round(Number(payAmount));
  return RECHARGE_PACKS.find((pack) => pack.pay_amount === normalized) ?? null;
}

export function listRechargePacks() {
  return RECHARGE_PACKS.map((pack) => ({
    pay_amount: pack.pay_amount,
    credit_amount: pack.credit_amount,
    bonus_amount: pack.bonus_amount,
    label:
      pack.bonus_amount > 0
        ? `₹${pack.pay_amount} → ₹${pack.credit_amount} (+₹${pack.bonus_amount} bonus)`
        : `₹${pack.pay_amount}`,
  }));
}
