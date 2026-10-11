import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { type ClubPlan } from "./pricing";
import { assertAdmin } from "./admin/guard";

export const getAdminData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: payments }, { data: subs }, { data: profiles }, { data: notifications }] =
      await Promise.all([
        supabaseAdmin
          .from("payments")
          .select("*, profiles ( id, full_name, email, phone, member_code )")
          .order("created_at", { ascending: false })
          .limit(100),
        supabaseAdmin
          .from("subscriptions")
          .select("*, profiles ( id, full_name, member_code )")
          .order("ends_at", { ascending: false })
          .limit(100),
        supabaseAdmin
          .from("profiles")
          .select(
            "id, full_name, email, phone, member_code, credit_balance, created_at, is_ambassador",
          )
          .order("created_at", { ascending: false })
          .limit(200),
        supabaseAdmin
          .from("notifications")
          .select("id, kind, subject, status, created_at, recipient")
          .order("created_at", { ascending: false })
          .limit(50),
      ]);

    return {
      payments: payments ?? [],
      subscriptions: subs ?? [],
      profiles: profiles ?? [],
      notifications: notifications ?? [],
    };
  });

const activateSchema = z.object({ paymentId: z.string().uuid() });

/** Confirme un paiement à la main et active (ou prolonge) l'abonnement. */
export const activatePayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => activateSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { settlePayment } = await import("./subscriptions.server");
    const result = await settlePayment(data.paymentId);
    if (!result.activated) return { ok: true, already: true };
    return { ok: true, ends_at: result.endsAt };
  });

/** Relit l'état d'un paiement Maketou (webhook manquant ou en retard). */
export const recheckPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => activateSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { reconcilePayment } = await import("./payments.server");
    return reconcilePayment(data.paymentId);
  });

export const rejectPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => activateSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("payments")
      .update({ status: "failed" })
      .eq("id", data.paymentId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Active un abonnement sans paiement enregistré (offert, régularisation). */
export const grantSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ profileId: z.string().uuid(), plan: z.enum(["monthly", "quarterly"]) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { activateClubAccess } = await import("./subscriptions.server");
    const result = await activateClubAccess({
      profileId: data.profileId,
      plan: data.plan as ClubPlan,
      amount: 0,
      source: "grant",
    });
    return { ok: true, ends_at: result.endsAt };
  });

/** Liste des codes d'accès, avec les membres qui les ont utilisés. */
export const listAccessCodes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("access_codes")
      .select("*, access_code_redemptions ( redeemed_at, profiles ( full_name, member_code ) )")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const generateSchema = z.object({
  count: z.number().int().min(1).max(500),
  durationDays: z.number().int().min(1).max(730),
  maxUses: z.number().int().min(1).max(10_000),
  expiresAt: z.string().date().optional().nullable(),
  batchLabel: z.string().trim().max(80).optional().nullable(),
});

/** Génère un lot de codes de 16 caractères. */
export const generateAccessCodes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => generateSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { generateAccessCode } = await import("./access-codes");

    const codes = new Set<string>();
    while (codes.size < data.count) codes.add(generateAccessCode());
    const rows = [...codes].map((code) => ({
      code,
      duration_days: data.durationDays,
      max_uses: data.maxUses,
      expires_at: data.expiresAt ? new Date(`${data.expiresAt}T23:59:59Z`).toISOString() : null,
      batch_label: data.batchLabel || null,
      created_by: context.userId,
    }));
    const { data: inserted, error } = await supabaseAdmin
      .from("access_codes")
      .insert(rows)
      .select("code");
    if (error) throw new Error(error.message);
    return { codes: (inserted ?? []).map((r) => r.code) };
  });

export const setAccessCodeActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), active: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("access_codes")
      .update({ active: data.active })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setAmbassador = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ profileId: z.string().uuid(), value: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ is_ambassador: data.value })
      .eq("id", data.profileId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Accompagnements en cours, avec ce qui reste à payer et les trop-perçus à rembourser. */
export const listAdminEngagements = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: engagements }, { data: overpaid }] = await Promise.all([
      supabaseAdmin
        .from("engagements")
        .select("*, profiles ( full_name, member_code, phone, email )")
        .neq("status", "cancelled")
        .or("status.neq.pending_payment,paid_amount.gt.0")
        .order("created_at", { ascending: false })
        .limit(200),
      supabaseAdmin
        .from("payments")
        .select("id, amount, metadata, paid_at, profiles ( full_name, member_code )")
        .eq("status", "success")
        .not("metadata->overpaid", "is", null)
        .order("paid_at", { ascending: false })
        .limit(100),
    ]);
    return { engagements: engagements ?? [], overpaid: overpaid ?? [] };
  });

const ENGAGEMENT_STATUSES = [
  "pending_payment",
  "active",
  "documents_review",
  "submitted",
  "completed",
  "cancelled",
] as const;

export const setEngagementStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), status: z.enum(ENGAGEMENT_STATUSES) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: engagement } = await supabaseAdmin
      .from("engagements")
      .select("amount, paid_amount")
      .eq("id", data.id)
      .single();
    if (!engagement) throw new Error("Accompagnement introuvable");
    // Le dépôt final attend le solde complet (2e tranche comprise)
    if (
      (data.status === "submitted" || data.status === "completed") &&
      engagement.paid_amount < engagement.amount
    ) {
      return {
        ok: false as const,
        error: "Le dépôt final attend le règlement de la 2e tranche.",
      };
    }
    const { error } = await supabaseAdmin
      .from("engagements")
      .update({ status: data.status })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
