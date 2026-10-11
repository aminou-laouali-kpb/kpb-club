export const PRICING = {
  club: {
    monthly: { amount: 15_000, duration_days: 30, label: "Mensuel" },
    quarterly: { amount: 30_000, duration_days: 90, label: "Trimestriel" },
  },
  accompaniment: {
    single: {
      amount: 90_000,
      installments: [45_000, 45_000],
      label: "Une fenêtre",
      description: "Accompagnement complet sur une candidature.",
    },
    three_windows: {
      amount: 250_000,
      installments: [125_000, 125_000],
      label: "Trois fenêtres",
      description: "Trois candidatures préparées avec un agent KPB.",
    },
    all_windows: {
      amount: 300_000,
      installments: [150_000, 150_000],
      label: "Toutes les fenêtres",
      description: "Toutes les fenêtres de l'année académique.",
    },
    concierge: {
      amount: 690_000,
      installments: [345_000, 345_000],
      label: "Conciergerie",
      description: "Prise en charge intégrale du dossier, du choix à l'admission.",
    },
  },
} as const;

export type ClubPlan = keyof typeof PRICING.club;
export type PackageType = keyof typeof PRICING.accompaniment;

export const CREDIT_PER_MONTH = 5_000;
export const CREDIT_CAP = 15_000;

export function creditForPlan(plan: ClubPlan): number {
  return plan === "quarterly" ? CREDIT_PER_MONTH * 3 : CREDIT_PER_MONTH;
}

/** Délai entre la 1re et la 2e tranche d'un accompagnement. */
export const SECOND_INSTALLMENT_DELAY_DAYS = 30;

/**
 * Échéancier d'un accompagnement. Le crédit Club est imputé sur la première
 * tranche, sans pouvoir la rendre négative.
 */
export function engagementPlan(pkg: PackageType, installments: 1 | 2, creditBalance: number) {
  const offer = PRICING.accompaniment[pkg];
  const [half1, half2] = offer.installments;
  const firstGross = installments === 2 ? half1 : offer.amount;
  const second = installments === 2 ? half2 : 0;
  const credit = Math.max(0, Math.min(creditBalance, firstGross));
  return { total: offer.amount, firstGross, first: firstGross - credit, second, credit };
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
