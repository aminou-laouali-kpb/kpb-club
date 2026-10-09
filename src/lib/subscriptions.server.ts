import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { CREDIT_CAP, PRICING, creditForPlan, type ClubPlan } from "./pricing";
import { computeExtension } from "./subscription-period";

export type AccessSource = "payment" | "promo" | "grant" | "referral";

type ActivateInput = {
  profileId: string;
  /** Formule payée ; si absente, `days` doit être fourni (code d'accès, parrainage). */
  plan?: ClubPlan;
  days?: number;
  amount: number;
  source: AccessSource;
  paymentId?: string;
};

/**
 * Ouvre ou prolonge l'accès Club d'un membre. Point d'entrée unique pour les paiements,
 * les activations manuelles, les codes d'accès et le parrainage.
 * Seuls les paiements créditent le solde accompagnement.
 */
export async function activateClubAccess(input: ActivateInput) {
  const days = input.days ?? (input.plan ? PRICING.club[input.plan].duration_days : 0);
  if (days <= 0) throw new Error("Durée d'accès invalide");
  const plan: ClubPlan = input.plan ?? (days >= 90 ? "quarterly" : "monthly");

  const { data: current } = await supabaseAdmin
    .from("subscriptions")
    .select("ends_at")
    .eq("profile_id", input.profileId)
    .neq("status", "cancelled")
    .order("ends_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { endsAt, graceEndsAt } = computeExtension(current?.ends_at ?? null, days);

  const { data: sub, error } = await supabaseAdmin
    .from("subscriptions")
    .insert({
      profile_id: input.profileId,
      plan,
      amount: input.amount,
      starts_at: new Date().toISOString(),
      ends_at: endsAt.toISOString(),
      grace_ends_at: graceEndsAt.toISOString(),
      status: "active",
      source: input.source,
      payment_id: input.paymentId ?? null,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  if (input.source === "payment" && input.plan) {
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("credit_balance")
      .eq("id", input.profileId)
      .maybeSingle();
    const credit = Math.min(CREDIT_CAP, (profile?.credit_balance ?? 0) + creditForPlan(input.plan));
    await supabaseAdmin
      .from("profiles")
      .update({ credit_balance: credit })
      .eq("id", input.profileId);
  }

  return { subscriptionId: sub.id, endsAt: endsAt.toISOString() };
}

/**
 * Marque un paiement comme réussi et ouvre l'accès, une seule fois.
 * La mise à jour conditionnelle (statut encore non réglé) empêche une double activation
 * si le webhook et la vérification manuelle arrivent en même temps.
 */
export async function settlePayment(paymentId: string, transactionRef?: string | null) {
  const { data: claimed, error } = await supabaseAdmin
    .from("payments")
    .update({
      status: "success",
      paid_at: new Date().toISOString(),
      ...(transactionRef ? { transaction_ref: transactionRef } : {}),
    })
    .eq("id", paymentId)
    .in("status", ["pending", "failed"])
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!claimed) return { activated: false as const };

  const metadata = (claimed.metadata ?? {}) as { plan?: ClubPlan };
  const plan: ClubPlan = metadata.plan === "monthly" ? "monthly" : "quarterly";
  const result = await activateClubAccess({
    profileId: claimed.profile_id,
    plan,
    amount: claimed.amount,
    source: "payment",
    paymentId: claimed.id,
  });
  return { activated: true as const, plan, ...result, payment: claimed };
}
