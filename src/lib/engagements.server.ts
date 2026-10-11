import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database } from "@/integrations/supabase/types";
import { PRICING, SECOND_INSTALLMENT_DELAY_DAYS, type PackageType } from "./pricing";
import { shiftDate } from "./applications";

type Payment = Database["public"]["Tables"]["payments"]["Row"];

export type EngagementMeta = {
  package?: PackageType;
  installment?: 1 | 2;
  credit?: number;
  engagementId?: string;
};

export function engagementDescription(meta: EngagementMeta, installments: number) {
  const label = meta.package ? PRICING.accompaniment[meta.package].label : "Accompagnement";
  if (installments === 2) {
    return `Accompagnement — ${label} (${meta.installment === 2 ? "2e" : "1re"} tranche sur 2)`;
  }
  return `Accompagnement — ${label}`;
}

/** Paiement d'une tranche réussi : l'engagement s'active, le crédit est consommé. */
export async function settleEngagementPayment(payment: Payment) {
  const meta = (payment.metadata ?? {}) as EngagementMeta;
  const engagementId = payment.payable_id ?? meta.engagementId;
  if (!engagementId) throw new Error("Paiement d'accompagnement sans engagement");

  const { data: engagement } = await supabaseAdmin
    .from("engagements")
    .select("*")
    .eq("id", engagementId)
    .single();
  if (!engagement) throw new Error("Engagement introuvable");

  const paidAmount = engagement.paid_amount + payment.amount + (meta.credit ?? 0);
  const patch: Database["public"]["Tables"]["engagements"]["Update"] = { paid_amount: paidAmount };
  if (meta.installment !== 2) {
    if (engagement.status === "pending_payment") patch.status = "active";
    if (engagement.installments === 2) {
      patch.second_due_at = shiftDate(
        new Date().toISOString().slice(0, 10),
        SECOND_INSTALLMENT_DELAY_DAYS,
      );
    }
    patch.credit_applied = meta.credit ?? 0;
  }
  const { error } = await supabaseAdmin.from("engagements").update(patch).eq("id", engagement.id);
  if (error) throw new Error(error.message);

  // Le crédit Club imputé sur la 1re tranche est retiré du solde du membre
  if (meta.installment !== 2 && (meta.credit ?? 0) > 0 && payment.profile_id) {
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("credit_balance")
      .eq("id", payment.profile_id)
      .single();
    await supabaseAdmin
      .from("profiles")
      .update({ credit_balance: Math.max(0, (profile?.credit_balance ?? 0) - (meta.credit ?? 0)) })
      .eq("id", payment.profile_id);
  }

  return {
    description: engagementDescription(meta, engagement.installments),
    fullyPaid: paidAmount >= engagement.amount,
  };
}

/** Reste à payer sur un engagement (pour la 2e tranche). */
export function remainingForEngagement(e: { amount: number; paid_amount: number }) {
  return Math.max(0, e.amount - e.paid_amount);
}
