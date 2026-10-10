import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { subscriptionStateFor } from "./member.functions";
import { isActiveStatus, type ApplicationStatus } from "./applications";

/** Nombre de candidatures actives autorisées sans abonnement Club. */
export const FREE_APPLICATION_LIMIT = 1;
export const FREE_LIMIT_MESSAGE =
  "Le compte gratuit permet de suivre une candidature. Rejoignez le Club pour en suivre autant que vous voulez.";

export async function getMember(supabase: SupabaseClient<Database>, userId: string) {
  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("auth_user_id", userId)
    .maybeSingle();
  if (!profile) throw new Error("Profil introuvable");
  const { data: sub } = await supabase
    .from("subscriptions")
    .select("ends_at, grace_ends_at")
    .eq("profile_id", profile.id)
    .neq("status", "cancelled")
    .order("ends_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { state } = subscriptionStateFor(sub ?? null);
  return { profileId: profile.id, hasAccess: state === "active" || state === "grace" };
}

async function countActiveApplications(supabase: SupabaseClient<Database>, profileId: string) {
  const { data } = await supabase.from("applications").select("status").eq("profile_id", profileId);
  return (data ?? []).filter((a) => isActiveStatus(a.status as ApplicationStatus)).length;
}

/** Vérifie que l'item appartient bien au membre (lecture sous RLS). */
async function getOwnItem(supabase: SupabaseClient<Database>, itemId: string) {
  const { data: item } = await supabase
    .from("application_items")
    .select("id, application_id, status, essay_draft_saved_at")
    .eq("id", itemId)
    .maybeSingle();
  if (!item) throw new Error("Élément introuvable");
  return item;
}

export const listApplications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const member = await getMember(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("applications")
      .select(
        "id, bourse_id, status, deadline, readiness, next_action, next_item_id, bourses ( university_name, country )",
      )
      .eq("profile_id", member.profileId)
      .order("deadline", { ascending: true, nullsFirst: false });
    if (error) throw new Error(error.message);
    const applications = data ?? [];
    const active = applications.filter((a) => isActiveStatus(a.status as ApplicationStatus)).length;
    return {
      applications,
      hasAccess: member.hasAccess,
      canAdd: member.hasAccess || active < FREE_APPLICATION_LIMIT,
    };
  });

export const getApplication = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const member = await getMember(context.supabase, context.userId);
    const { data: app } = await context.supabase
      .from("applications")
      .select("*")
      .eq("id", data.id)
      .eq("profile_id", member.profileId)
      .maybeSingle();
    if (!app) throw new Error("Candidature introuvable");

    const [{ data: items }, { data: bourse }, { data: profile }, { data: engagement }] =
      await Promise.all([
        context.supabase
          .from("application_items")
          .select("*")
          .eq("application_id", app.id)
          .order("sort_order", { ascending: true }),
        context.supabase
          .from("bourses")
          .select(
            "id, university_name, country, program_url, window_opens, window_closes, operations_order, video_url, whatsapp_group_url",
          )
          .eq("id", app.bourse_id)
          .maybeSingle(),
        context.supabase.from("profiles").select("full_name").eq("id", member.profileId).single(),
        context.supabase
          .from("engagements")
          .select("id, amount, paid_amount, installments, second_due_at, status")
          .eq("application_id", app.id)
          .not("status", "in", "(pending_payment,cancelled)")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

    return {
      application: app,
      items: items ?? [],
      bourse: bourse
        ? {
            ...bourse,
            // Sous-groupe communautaire réservé aux membres du Club
            whatsapp_group_url: member.hasAccess ? bourse.whatsapp_group_url : null,
          }
        : null,
      hasAccess: member.hasAccess,
      studentName: profile?.full_name ?? "",
      engagement: engagement ?? null,
    };
  });

export const createApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ bourseId: z.string().min(1).max(120) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const member = await getMember(context.supabase, context.userId);
    const { data: existing } = await context.supabase
      .from("applications")
      .select("id")
      .eq("profile_id", member.profileId)
      .eq("bourse_id", data.bourseId)
      .maybeSingle();
    if (existing) return { ok: true as const, id: existing.id };

    if (!member.hasAccess) {
      const active = await countActiveApplications(context.supabase, member.profileId);
      if (active >= FREE_APPLICATION_LIMIT) {
        return { ok: false as const, error: FREE_LIMIT_MESSAGE, needsClub: true };
      }
    }
    const { createApplicationFor } = await import("./applications.server");
    const created = await createApplicationFor(member.profileId, data.bourseId);
    return { ok: true as const, id: created.id };
  });

export const updateItemStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ itemId: z.string().uuid(), status: z.enum(["todo", "in_progress", "done", "na"]) })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const item = await getOwnItem(context.supabase, data.itemId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { recomputeApplication } = await import("./applications.server");
    const { error } = await supabaseAdmin
      .from("application_items")
      .update({
        status: data.status,
        completed_at: data.status === "done" ? new Date().toISOString() : null,
      })
      .eq("id", item.id);
    if (error) throw new Error(error.message);
    return recomputeApplication(item.application_id);
  });

export const saveItemDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        itemId: z.string().uuid(),
        draft: z.string().max(20_000),
        clientSavedAt: z.string().datetime(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const item = await getOwnItem(context.supabase, data.itemId);
    // Une sauvegarde plus ancienne que celle en base (requêtes dans le désordre) est ignorée
    if (item.essay_draft_saved_at && item.essay_draft_saved_at >= data.clientSavedAt) {
      return { ok: true, savedAt: item.essay_draft_saved_at, stale: true };
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("application_items")
      .update({
        essay_draft: data.draft,
        essay_draft_saved_at: data.clientSavedAt,
        ...(item.status === "todo" && data.draft.trim() ? { status: "in_progress" as const } : {}),
      })
      .eq("id", item.id);
    if (error) throw new Error(error.message);
    if (item.status === "todo" && data.draft.trim()) {
      const { recomputeApplication } = await import("./applications.server");
      await recomputeApplication(item.application_id);
    } else {
      await supabaseAdmin
        .from("applications")
        .update({ last_activity_at: new Date().toISOString() })
        .eq("id", item.application_id);
    }
    return { ok: true, savedAt: data.clientSavedAt, stale: false };
  });

export const updateApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        status: z
          .enum([
            "targeting",
            "preparing",
            "ready",
            "submitted",
            "interview",
            "accepted",
            "rejected",
            "abandoned",
          ])
          .optional(),
        deadline: z.string().date().nullable().optional(),
        outcome_note: z.string().max(2_000).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const member = await getMember(context.supabase, context.userId);
    const { data: app } = await context.supabase
      .from("applications")
      .select("id, status, deadline")
      .eq("id", data.id)
      .eq("profile_id", member.profileId)
      .maybeSingle();
    if (!app) throw new Error("Candidature introuvable");

    // Réactiver une candidature compte dans la limite du compte gratuit
    if (
      data.status &&
      !member.hasAccess &&
      !isActiveStatus(app.status as ApplicationStatus) &&
      isActiveStatus(data.status)
    ) {
      const active = await countActiveApplications(context.supabase, member.profileId);
      if (active >= FREE_APPLICATION_LIMIT)
        return { ok: false as const, error: FREE_LIMIT_MESSAGE };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch: Database["public"]["Tables"]["applications"]["Update"] = {
      last_activity_at: new Date().toISOString(),
    };
    if (data.status) {
      // Statut automatique demandé : on repart de « ciblée » et le recalcul choisit le bon
      patch.status = ["targeting", "preparing", "ready"].includes(data.status)
        ? "targeting"
        : data.status;
      if (data.status === "submitted") patch.submitted_at = new Date().toISOString();
    }
    if (data.deadline !== undefined) patch.deadline = data.deadline;
    if (data.outcome_note !== undefined) patch.outcome_note = data.outcome_note;
    const { error } = await supabaseAdmin.from("applications").update(patch).eq("id", app.id);
    if (error) throw new Error(error.message);

    const { recomputeApplication } = await import("./applications.server");
    await recomputeApplication(app.id);
    return { ok: true as const };
  });

export const deleteApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const member = await getMember(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("applications")
      .delete()
      .eq("id", data.id)
      .eq("profile_id", member.profileId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const completeOnboarding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        bourseIds: z.array(z.string().min(1).max(120)).max(3),
        whatsapp_optin: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const member = await getMember(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { createApplicationFor } = await import("./applications.server");

    let allowed = data.bourseIds.length;
    if (!member.hasAccess) {
      const active = await countActiveApplications(context.supabase, member.profileId);
      allowed = Math.max(0, FREE_APPLICATION_LIMIT - active);
    }
    const ids: string[] = [];
    for (const bourseId of data.bourseIds.slice(0, allowed)) {
      ids.push((await createApplicationFor(member.profileId, bourseId)).id);
    }

    const { error } = await supabaseAdmin
      .from("profiles")
      .update({
        onboarding_completed: true,
        ...(data.whatsapp_optin !== undefined ? { whatsapp_optin: data.whatsapp_optin } : {}),
      })
      .eq("id", member.profileId);
    if (error) throw new Error(error.message);
    return { ok: true, applicationIds: ids };
  });
