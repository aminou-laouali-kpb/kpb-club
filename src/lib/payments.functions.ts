import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { PRICING, type ClubPlan } from "./pricing";
import { isValidAccessCodeFormat, normalizeAccessCode } from "./access-codes";

async function getProfile(supabase: SupabaseClient<Database>, userId: string) {
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, email, phone")
    .eq("auth_user_id", userId)
    .maybeSingle();
  if (!profile) throw new Error("Profil introuvable");
  return profile;
}

/** Crée le paiement en attente puis le panier Maketou, et renvoie l'URL de paiement. */
export const startCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ plan: z.enum(["monthly", "quarterly"]) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { createCheckout, productIdForPlan } = await import("./maketou.server");
    const { appOrigin } = await import("./app-origin.server");
    const profile = await getProfile(context.supabase, context.userId);
    const plan = data.plan as ClubPlan;

    const { data: payment, error } = await supabaseAdmin
      .from("payments")
      .insert({
        profile_id: profile.id,
        payable_type: "subscription",
        amount: PRICING.club[plan].amount,
        provider: "maketou",
        status: "pending",
        metadata: { plan, source: "web" },
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    try {
      const checkout = await createCheckout({
        productId: productIdForPlan(plan),
        meta: { plan },
        paymentId: payment.id,
        customer: { name: profile.full_name, email: profile.email, phone: profile.phone },
        returnUrl: `${appOrigin()}/paiement/retour?payment=${payment.id}`,
      });
      await supabaseAdmin
        .from("payments")
        .update({ external_id: checkout.externalId, checkout_url: checkout.checkoutUrl })
        .eq("id", payment.id);
      return { paymentId: payment.id, checkoutUrl: checkout.checkoutUrl };
    } catch (e) {
      await supabaseAdmin
        .from("payments")
        .update({
          status: "failed",
          metadata: { plan, source: "web", error: e instanceof Error ? e.message : "checkout" },
        })
        .eq("id", payment.id);
      console.error("Maketou checkout", e);
      throw new Error("Le paiement en ligne est momentanément indisponible. Réessayez plus tard.");
    }
  });

/** État d'un paiement du membre ; `recheck` interroge Maketou si le webhook n'est pas arrivé. */
export const getPaymentStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ paymentId: z.string().uuid(), recheck: z.boolean().optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const profile = await getProfile(context.supabase, context.userId);
    const { data: payment } = await context.supabase
      .from("payments")
      .select("id, status, amount, profile_id, payable_type")
      .eq("id", data.paymentId)
      .eq("profile_id", profile.id)
      .maybeSingle();
    if (!payment) throw new Error("Paiement introuvable");
    if (payment.status === "success" || !data.recheck) {
      return {
        status: payment.status as string,
        amount: payment.amount,
        kind: payment.payable_type,
      };
    }
    const { reconcilePayment } = await import("./payments.server");
    const result = await reconcilePayment(payment.id).catch(() => ({ status: "pending" as const }));
    return {
      status: result.status === "not_found" ? "pending" : result.status,
      amount: payment.amount,
      kind: payment.payable_type,
    };
  });

const MAX_FAILED_ATTEMPTS_PER_HOUR = 5;

const REDEEM_ERRORS: Record<string, string> = {
  code_invalid: "Ce code n'existe pas. Vérifiez la saisie.",
  code_inactive: "Ce code a été désactivé.",
  code_expired: "Ce code a expiré.",
  code_exhausted: "Ce code a déjà été utilisé.",
  code_already_used: "Vous avez déjà utilisé ce code.",
};

/** Active l'accès Club avec un code de 16 caractères. */
export const redeemAccessCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ code: z.string().max(40) }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { activateClubAccess } = await import("./subscriptions.server");
    const profile = await getProfile(context.supabase, context.userId);

    const since = new Date(Date.now() - 3_600_000).toISOString();
    const { count } = await supabaseAdmin
      .from("access_code_attempts")
      .select("id", { count: "exact", head: true })
      .eq("profile_id", profile.id)
      .eq("success", false)
      .gte("attempted_at", since);
    if ((count ?? 0) >= MAX_FAILED_ATTEMPTS_PER_HOUR) {
      return { ok: false as const, error: "Trop de tentatives. Réessayez dans une heure." };
    }

    const code = normalizeAccessCode(data.code);
    const fail = async (error: string) => {
      await supabaseAdmin
        .from("access_code_attempts")
        .insert({ profile_id: profile.id, success: false });
      return { ok: false as const, error };
    };
    if (!isValidAccessCodeFormat(code)) {
      return fail("Le code doit contenir 16 caractères (lettres et chiffres).");
    }

    const { data: rows, error } = await supabaseAdmin.rpc("redeem_access_code", {
      _profile_id: profile.id,
      _code: code,
    });
    if (error) {
      const known = Object.entries(REDEEM_ERRORS).find(([k]) => error.message.includes(k));
      if (!known) console.error("redeem_access_code", error);
      return fail(known ? known[1] : "Impossible d'utiliser ce code pour le moment.");
    }
    const redemption = rows?.[0];
    if (!redemption) return fail("Impossible d'utiliser ce code pour le moment.");

    const access = await activateClubAccess({
      profileId: profile.id,
      days: redemption.duration_days,
      amount: 0,
      source: "promo",
    });
    await Promise.all([
      supabaseAdmin
        .from("access_code_redemptions")
        .update({ subscription_id: access.subscriptionId })
        .eq("id", redemption.redemption_id),
      supabaseAdmin.from("access_code_attempts").insert({ profile_id: profile.id, success: true }),
    ]);
    return { ok: true as const, days: redemption.duration_days, endsAt: access.endsAt };
  });

/** Reçu PDF d'un paiement réussi du membre (renvoyé en base64). */
export const getReceipt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ paymentId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: profile } = await context.supabase
      .from("profiles")
      .select("id, full_name, email, member_code")
      .eq("auth_user_id", context.userId)
      .maybeSingle();
    if (!profile) throw new Error("Profil introuvable");
    const { data: payment } = await context.supabase
      .from("payments")
      .select("*")
      .eq("id", data.paymentId)
      .eq("profile_id", profile.id)
      .eq("status", "success")
      .maybeSingle();
    if (!payment || !payment.paid_at) throw new Error("Reçu indisponible");

    const { buildReceiptPdf, receiptNumber } = await import("./receipt");
    const { engagementDescription } = await import("./engagements.server");
    const meta = (payment.metadata ?? {}) as { plan?: ClubPlan; installment?: 1 | 2 };
    let description = "Paiement KPB Education";
    if (payment.payable_type === "engagement") {
      const { data: engagement } = await context.supabase
        .from("engagements")
        .select("installments")
        .eq("id", payment.payable_id ?? "")
        .maybeSingle();
      description = engagementDescription(meta as never, engagement?.installments ?? 1);
    } else if (meta.plan) {
      description = `Club Boursier — formule ${PRICING.club[meta.plan].label.toLowerCase()}`;
    }
    const providers: Record<string, string> = {
      maketou: "Paiement mobile (Maketou)",
      wave: "Wave",
      orange_money: "Orange Money",
      mtn_momo: "MTN MoMo",
      moov_money: "Moov Money",
      manual: "Règlement enregistré par KPB",
      promo: "Code d'accès",
    };
    const number = receiptNumber(payment.id, payment.paid_at);
    const pdf = buildReceiptPdf({
      number,
      paidAt: payment.paid_at,
      memberName: profile.full_name,
      memberCode: profile.member_code,
      email: profile.email,
      description,
      amount: payment.amount,
      provider: providers[payment.provider] ?? payment.provider,
      reference: payment.transaction_ref,
    });
    let binary = "";
    for (const b of pdf) binary += String.fromCharCode(b);
    return { fileName: `Recu_${number}.pdf`, base64: btoa(binary) };
  });
