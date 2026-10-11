import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { PRICING, engagementPlan, type PackageType } from "./pricing";

const packageEnum = z.enum(["single", "three_windows", "all_windows", "concierge"]);

async function getProfileFull(
  supabase: Parameters<typeof import("./applications.functions").getMember>[0],
  userId: string,
) {
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, email, phone, credit_balance")
    .eq("auth_user_id", userId)
    .maybeSingle();
  if (!profile) throw new Error("Profil introuvable");
  return profile;
}

/** Crée le paiement d'une tranche et le panier Maketou correspondant. */
async function checkoutInstallment(input: {
  profile: { id: string; full_name: string; email: string | null; phone: string | null };
  engagementId: string;
  pkg: PackageType;
  installments: 1 | 2;
  installment: 1 | 2;
  amount: number;
  credit: number;
}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { createCheckout, productIdForEngagement } = await import("./maketou.server");
  const { appOrigin } = await import("./app-origin.server");
  const { data: payment, error } = await supabaseAdmin
    .from("payments")
    .insert({
      profile_id: input.profile.id,
      payable_type: "engagement",
      payable_id: input.engagementId,
      amount: input.amount,
      provider: "maketou",
      status: "pending",
      metadata: {
        package: input.pkg,
        installment: input.installment,
        credit: input.credit,
        engagementId: input.engagementId,
      },
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  try {
    const checkout = await createCheckout({
      productId: productIdForEngagement(input.pkg, input.installments),
      amount: input.amount,
      meta: { package: input.pkg, installment: input.installment },
      paymentId: payment.id,
      customer: {
        name: input.profile.full_name,
        email: input.profile.email,
        phone: input.profile.phone,
      },
      returnUrl: `${appOrigin()}/paiement/retour?payment=${payment.id}`,
    });
    await supabaseAdmin
      .from("payments")
      .update({ external_id: checkout.externalId, checkout_url: checkout.checkoutUrl })
      .eq("id", payment.id);
    return { paymentId: payment.id, checkoutUrl: checkout.checkoutUrl };
  } catch (e) {
    await supabaseAdmin.from("payments").update({ status: "failed" }).eq("id", payment.id);
    console.error("Maketou checkout (accompagnement)", e);
    throw new Error("Le paiement en ligne est momentanément indisponible. Réessayez plus tard.");
  }
}

export const startEngagementCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        package: packageEnum,
        installments: z.union([z.literal(1), z.literal(2)]),
        applicationId: z.string().uuid().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const profile = await getProfileFull(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const plan = engagementPlan(data.package, data.installments, profile.credit_balance ?? 0);

    type BourseRef = { id: string; university_name: string; academic_year: number | null };
    let bourse: BourseRef | null = null;
    if (data.applicationId) {
      const { data: app } = await context.supabase
        .from("applications")
        .select("id, bourses ( id, university_name, academic_year )")
        .eq("id", data.applicationId)
        .eq("profile_id", profile.id)
        .maybeSingle();
      if (!app) throw new Error("Candidature introuvable");
      bourse = app.bourses as unknown as BourseRef | null;
    }

    const { data: engagement, error } = await supabaseAdmin
      .from("engagements")
      .insert({
        profile_id: profile.id,
        package_type: data.package,
        amount: plan.total,
        installments: data.installments,
        status: "pending_payment",
        application_id: data.applicationId ?? null,
        bourse_id: bourse?.id ?? null,
        university: bourse?.university_name ?? null,
        window_year: bourse?.academic_year ?? null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    return checkoutInstallment({
      profile,
      engagementId: engagement.id,
      pkg: data.package,
      installments: data.installments,
      installment: 1,
      amount: plan.first,
      credit: plan.credit,
    });
  });

export const payNextInstallment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ engagementId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const profile = await getProfileFull(context.supabase, context.userId);
    const { data: engagement } = await context.supabase
      .from("engagements")
      .select("*")
      .eq("id", data.engagementId)
      .eq("profile_id", profile.id)
      .maybeSingle();
    if (!engagement) throw new Error("Accompagnement introuvable");
    const { remainingForEngagement } = await import("./engagements.server");
    const remaining = remainingForEngagement(engagement);
    if (
      engagement.installments !== 2 ||
      engagement.status === "pending_payment" ||
      remaining <= 0
    ) {
      throw new Error("Aucune tranche à régler.");
    }
    return checkoutInstallment({
      profile,
      engagementId: engagement.id,
      pkg: (engagement.package_type ?? "single") as PackageType,
      installments: 2,
      installment: 2,
      amount: remaining,
      credit: 0,
    });
  });

export const listEngagements = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const profile = await getProfileFull(context.supabase, context.userId);
    const { data } = await context.supabase
      .from("engagements")
      .select("*")
      .eq("profile_id", profile.id)
      .neq("status", "cancelled")
      .order("created_at", { ascending: false });
    return {
      engagements: (data ?? []).filter((e) => e.status !== "pending_payment" || e.paid_amount > 0),
      creditBalance: profile.credit_balance ?? 0,
      packages: PRICING.accompaniment,
    };
  });
