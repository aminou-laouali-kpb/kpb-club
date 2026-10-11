import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin } from "./guard";

const OPEN_ENGAGEMENTS = ["active", "documents_review", "submitted"] as const;

/**
 * File de l'accompagnement : engagements en cours (par agent) et éléments terminés
 * par le membre qui attendent la relecture de l'équipe.
 */
export const getReviewQueue = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: engagements, error } = await supabaseAdmin
      .from("engagements")
      .select(
        "id, profile_id, application_id, university, status, assigned_agent, deadline, profiles ( full_name, member_code )",
      )
      .in("status", [...OPEN_ENGAGEMENTS])
      .order("deadline", { ascending: true, nullsFirst: false });
    if (error) throw new Error(error.message);

    const profileIds = [...new Set((engagements ?? []).map((e) => e.profile_id).filter(Boolean))];
    const items =
      profileIds.length === 0
        ? []
        : ((
            await supabaseAdmin
              .from("application_items")
              .select(
                "id, label, kind, status, completed_at, document_id, essay_draft_saved_at, applications!inner ( id, profile_id, bourses ( university_name ) )",
              )
              .in("applications.profile_id", profileIds as string[])
              .eq("status", "done")
              .is("reviewed_by_kpb_at", null)
              .in("kind", ["essay", "document", "recommendation"])
              .order("completed_at", { ascending: true })
              .limit(300)
          ).data ?? []);

    // Les agents sont des comptes admin : leur nom vient de leur profil
    const agentIds = [
      ...new Set((engagements ?? []).map((e) => e.assigned_agent).filter(Boolean)),
    ] as string[];
    const { data: agents } = agentIds.length
      ? await supabaseAdmin
          .from("profiles")
          .select("auth_user_id, full_name")
          .in("auth_user_id", agentIds)
      : { data: [] };
    const agentName = new Map((agents ?? []).map((a) => [a.auth_user_id, a.full_name]));
    const { data: admins } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");
    const adminIds = (admins ?? []).map((a) => a.user_id);
    const { data: adminProfiles } = adminIds.length
      ? await supabaseAdmin
          .from("profiles")
          .select("auth_user_id, full_name, email")
          .in("auth_user_id", adminIds)
      : { data: [] };

    return {
      engagements: (engagements ?? []).map((e) => ({
        ...e,
        agentName: e.assigned_agent ? (agentName.get(e.assigned_agent) ?? "Agent") : null,
      })),
      items,
      agents: (adminProfiles ?? []).map((a) => ({
        id: a.auth_user_id,
        name: a.full_name || a.email || "Admin",
      })),
    };
  });

export const markItemReviewed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ itemId: z.string().uuid(), reviewed: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("application_items")
      .update(
        data.reviewed
          ? { reviewed_by_kpb_at: new Date().toISOString(), reviewed_by: context.userId }
          : { reviewed_by_kpb_at: null, reviewed_by: null },
      )
      .eq("id", data.itemId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const assignAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ engagementId: z.string().uuid(), agentId: z.string().uuid().nullable() })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("engagements")
      .update({ assigned_agent: data.agentId })
      .eq("id", data.engagementId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
