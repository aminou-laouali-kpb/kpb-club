export const PRICING = {
  club: {
    monthly: { amount: 15_000, duration_days: 30, label: "Mensuel" },
    quarterly: { amount: 30_000, duration_days: 90, label: "Trimestriel" },
  },
  accompaniment: {
    single: { amount: 90_000, label: "Une fenêtre" },
    three_windows: { amount: 250_000, label: "Trois fenêtres" },
    all_windows: { amount: 300_000, label: "Toutes les fenêtres" },
    concierge: { amount: 690_000, label: "Conciergerie" },
  },
} as const;

export type ClubPlan = keyof typeof PRICING.club;
export type PackageType = keyof typeof PRICING.accompaniment;

export const CREDIT_PER_MONTH = 5_000;
export const CREDIT_CAP = 15_000;

export function creditForPlan(plan: ClubPlan): number {
  return plan === "quarterly" ? CREDIT_PER_MONTH * 3 : CREDIT_PER_MONTH;
}

export function applyCredit(balance: number, amount: number) {
  const discount = Math.min(balance, amount);
  return { discount, finalAmount: amount - discount, remaining: balance - discount };
}

export function formatFcfa(amount: number): string {
  return `${amount.toLocaleString("fr-FR").replace(/\u202f|\u00a0/g, " ")} FCFA`;
}

export const PROVIDERS = [
  { id: "wave", label: "Wave" },
  { id: "orange_money", label: "Orange Money" },
  { id: "mtn_momo", label: "MTN MoMo" },
  { id: "moov_money", label: "Moov Money" },
] as const;

export type ProviderId = (typeof PROVIDERS)[number]["id"];
