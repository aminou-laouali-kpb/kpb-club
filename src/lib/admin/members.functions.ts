import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin } from "./guard";

const searchSchema = z.object({
  q: z.string().trim().max(80).default(""),
  status: z.enum(["all", "active", "expired", "free"]).default("all"),
  country: z
    .string()
    .regex(/^[A-Z]{2}$/)
    .nullable()
    .default(null),
  bourseId: z.string().max(120).nullable().default(null),
});

/** Recherche de membres (nom, code, téléphone, email) avec filtres. */
export const searchMembers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => searchSchema.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { memberStatus } = await import("./segment");

    let query = supabaseAdmin
      .from("profiles")
      .select(
        "id, full_name, email, phone, phone_e164, member_code, nationality, residence, created_at, credit_balance, is_ambassador, deletion_requested_at, subscriptions ( ends_at, grace_ends_at, status ), applications ( bourse_id )",
      )
      .order("created_at", { ascending: false })
      .limit(100);
    if (data.q) {
      const q = data.q.replace(/[%,()]/g, " ").trim();
      query = query.or(
        `full_name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%,phone_e164.ilike.%${q}%,member_code.ilike.%${q}%`,
      );
    }
    if (data.country) {
      query = query.or(`nationality.eq.${data.country},residence.eq.${data.country}`);
    }
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    return (rows ?? [])
      .map((p) => {
        const ends = (p.subscriptions ?? [])
          .filter((s) => s.status !== "cancelled")
          .map((s) => s.grace_ends_at ?? s.ends_at)
          .sort()
          .at(-1);
        const { subscriptions: _s, applications, ...rest } = p;
        return {
          ...rest,
          accessEndsAt: ends ?? null,
          status: memberStatus(ends ?? null),
          bourseIds: (applications ?? []).map((a) => a.bourse_id),
        };
      })
      .filter((p) => data.status === "all" || p.status === data.status)
      .filter((p) => !data.bourseId || p.bourseIds.includes(data.bourseId));
  });

/** Fiche membre : candidatures, documents (métadonnées), IA, paiements, notes de l'équipe. */
export const getMemberDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ profileId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const id = data.profileId;
    const [profile, applications, documents, ai, payments, subs, notes, engagements] =
      await Promise.all([
        supabaseAdmin.from("profiles").select("*").eq("id", id).single(),
        supabaseAdmin
          .from("applications")
          .select(
            "id, bourse_id, status, readiness, deadline, next_action, bourses ( university_name )",
          )
          .eq("profile_id", id),
        supabaseAdmin
          .from("documents")
          .select("id, type, label, size_bytes, source, created_at")
          .eq("profile_id", id)
          .order("created_at", { ascending: false }),
        supabaseAdmin
          .from("ai_usage")
          .select("feature, cost_usd, created_at")
          .eq("profile_id", id)
          .order("created_at", { ascending: false })
          .limit(500),
        supabaseAdmin
          .from("payments")
          .select("id, amount, status, payable_type, provider, created_at, paid_at")
          .eq("profile_id", id)
          .order("created_at", { ascending: false }),
        supabaseAdmin
          .from("subscriptions")
          .select("id, plan, amount, source, starts_at, ends_at, status")
          .eq("profile_id", id)
          .order("ends_at", { ascending: false }),
        supabaseAdmin
          .from("admin_notes")
          .select("id, body, created_at, author")
          .eq("profile_id", id)
          .order("created_at", { ascending: false }),
        supabaseAdmin
          .from("engagements")
          .select("id, university, status, amount, paid_amount, created_at")
          .eq("profile_id", id),
      ]);
    if (profile.error) throw new Error(profile.error.message);

    const aiRows = ai.data ?? [];
    const aiByFeature: Record<string, { calls: number; cost: number }> = {};
    for (const r of aiRows) {
      const f = (aiByFeature[r.feature] ??= { calls: 0, cost: 0 });
      f.calls += 1;
      f.cost += Number(r.cost_usd ?? 0);
    }
    const p = profile.data;
    return {
      profile: {
        id: p.id,
        full_name: p.full_name,
        email: p.email,
        phone: p.phone_e164 ?? p.phone,
        member_code: p.member_code,
        nationality: p.nationality,
        residence: p.residence,
        education: p.education,
        field_of_study: p.field_of_study,
        created_at: p.created_at,
        credit_balance: p.credit_balance,
        is_ambassador: p.is_ambassador,
        deletion_requested_at: p.deletion_requested_at,
        consent_at: p.consent_at,
      },
      applications: applications.data ?? [],
      documents: documents.data ?? [],
      ai: { byFeature: aiByFeature, total: aiRows.length },
      payments: payments.data ?? [],
      subscriptions: subs.data ?? [],
      notes: notes.data ?? [],
      engagements: engagements.data ?? [],
    };
  });

export const addAdminNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ profileId: z.string().uuid(), body: z.string().trim().min(1).max(2000) })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("admin_notes")
      .insert({ profile_id: data.profileId, author: context.userId, body: data.body });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Prolonge ou offre des jours d'accès (geste commercial, régularisation). */
export const extendAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ profileId: z.string().uuid(), days: z.number().int().min(1).max(365) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { activateClubAccess } = await import("../subscriptions.server");
    const result = await activateClubAccess({
      profileId: data.profileId,
      days: data.days,
      amount: 0,
      source: "grant",
    });
    return { ok: true, ends_at: result.endsAt };
  });
