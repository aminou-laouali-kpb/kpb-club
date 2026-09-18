import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { PRICING, CREDIT_CAP, creditForPlan, type ClubPlan } from "./pricing";

async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Accès refusé");
}

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
          .select("id, full_name, email, phone, member_code, credit_balance, created_at")
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

/** Confirme un paiement mobile money et active (ou prolonge) l'abonnement. */
export const activatePayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => activateSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: payment } = await supabaseAdmin
      .from("payments")
      .select("*")
      .eq("id", data.paymentId)
      .maybeSingle();
    if (!payment) throw new Error("Paiement introuvable");
    if (payment.status === "success") return { ok: true, already: true };

    const metadata = (payment.metadata ?? {}) as { plan?: ClubPlan };
    const plan: ClubPlan = metadata.plan === "monthly" ? "monthly" : "quarterly";
    const duration = PRICING.club[plan].duration_days;

    const { data: current } = await supabaseAdmin
      .from("subscriptions")
      .select("ends_at")
      .eq("profile_id", payment.profile_id)
      .order("ends_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const base =
      current && new Date(current.ends_at).getTime() > Date.now()
        ? new Date(current.ends_at)
        : new Date();
    const endsAt = new Date(base.getTime() + duration * 86_400_000);
    const graceEndsAt = new Date(endsAt.getTime() + 3 * 86_400_000);

    const { error: subError } = await supabaseAdmin.from("subscriptions").insert({
      profile_id: payment.profile_id,
      plan,
      amount: payment.amount,
      starts_at: new Date().toISOString(),
      ends_at: endsAt.toISOString(),
      grace_ends_at: graceEndsAt.toISOString(),
      status: "active",
    });
    if (subError) throw new Error(subError.message);

    await supabaseAdmin
      .from("payments")
      .update({ status: "success", paid_at: new Date().toISOString() })
      .eq("id", payment.id);

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("credit_balance")
      .eq("id", payment.profile_id)
      .maybeSingle();
    const credit = Math.min(CREDIT_CAP, (profile?.credit_balance ?? 0) + creditForPlan(plan));
    await supabaseAdmin
      .from("profiles")
      .update({ credit_balance: credit })
      .eq("id", payment.profile_id);

    return { ok: true, ends_at: endsAt.toISOString() };
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
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const plan = data.plan as ClubPlan;
    const duration = PRICING.club[plan].duration_days;
    const { data: current } = await supabaseAdmin
      .from("subscriptions")
      .select("ends_at")
      .eq("profile_id", data.profileId)
      .order("ends_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const base =
      current && new Date(current.ends_at).getTime() > Date.now()
        ? new Date(current.ends_at)
        : new Date();
    const endsAt = new Date(base.getTime() + duration * 86_400_000);

    const { error } = await supabaseAdmin.from("subscriptions").insert({
      profile_id: data.profileId,
      plan,
      amount: 0,
      starts_at: new Date().toISOString(),
      ends_at: endsAt.toISOString(),
      grace_ends_at: new Date(endsAt.getTime() + 3 * 86_400_000).toISOString(),
      status: "active",
    });
    if (error) throw new Error(error.message);
    return { ok: true, ends_at: endsAt.toISOString() };
  });
