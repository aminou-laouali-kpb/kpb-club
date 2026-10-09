import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import { getMember } from "./applications.functions";

const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();

const baseSchema = z.object({
  full_name: z.string().trim().min(1).max(120),
  title: optionalText(60),
  institution: optionalText(160),
  email: z
    .union([z.string().trim().email().max(160), z.literal("")])
    .nullable()
    .optional(),
  phone: optionalText(24),
  relation: optionalText(120),
  strengths: optionalText(1_500),
  notes: optionalText(1_500),
});

type RecommenderUpdate = Database["public"]["Tables"]["recommenders"]["Update"];
const TEXT_KEYS = [
  "title",
  "institution",
  "email",
  "phone",
  "relation",
  "strengths",
  "notes",
] as const;

/** Ne garde que les champs fournis ; une chaîne vide devient null. */
type RecommenderInput = z.infer<typeof baseSchema>;
function toPatch(data: {
  [K in keyof RecommenderInput]?: RecommenderInput[K] | undefined;
}): RecommenderUpdate {
  const patch: RecommenderUpdate = {};
  if (data.full_name !== undefined) patch.full_name = data.full_name;
  for (const key of TEXT_KEYS) {
    const value = data[key];
    if (value !== undefined) patch[key] = value === "" ? null : value;
  }
  return patch;
}

export const listRecommenders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ applicationId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const member = await getMember(context.supabase, context.userId);
    const { data: rows, error } = await context.supabase
      .from("recommenders")
      .select("*")
      .eq("profile_id", member.profileId)
      .eq("application_id", data.applicationId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const createRecommender = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    baseSchema.extend({ applicationId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const member = await getMember(context.supabase, context.userId);
    const { data: app } = await context.supabase
      .from("applications")
      .select("id")
      .eq("id", data.applicationId)
      .eq("profile_id", member.profileId)
      .maybeSingle();
    if (!app) throw new Error("Candidature introuvable");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("recommenders")
      .insert({
        ...toPatch(data),
        full_name: data.full_name,
        profile_id: member.profileId,
        application_id: data.applicationId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const updateRecommender = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    baseSchema
      .partial()
      .extend({
        id: z.string().uuid(),
        status: z.enum(["to_contact", "requested", "reminded", "received", "declined"]).optional(),
        auto_remind: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const member = await getMember(context.supabase, context.userId);
    const patch = toPatch(data);
    if (data.status !== undefined) patch.status = data.status;
    if (data.auto_remind !== undefined) patch.auto_remind = data.auto_remind;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("recommenders")
      .update(patch)
      .eq("id", data.id)
      .eq("profile_id", member.profileId)
      .select("application_id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (row?.application_id && "status" in patch) {
      const { syncRecommendationItems } = await import("./documents.server");
      await syncRecommendationItems(row.application_id);
    }
    return { ok: true };
  });

/** La demande a été envoyée par l'étudiant (WhatsApp, email ou copie du texte). */
export const markRequested = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), autoRemind: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const member = await getMember(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("recommenders")
      .update({
        status: "requested",
        requested_at: new Date().toISOString(),
        reminded_at: null,
        auto_remind: data.autoRemind,
      })
      .eq("id", data.id)
      .eq("profile_id", member.profileId)
      .in("status", ["to_contact", "requested", "reminded"]);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteRecommender = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const member = await getMember(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("recommenders")
      .delete()
      .eq("id", data.id)
      .eq("profile_id", member.profileId)
      .select("application_id")
      .maybeSingle();
    if (row?.application_id) {
      const { syncRecommendationItems } = await import("./documents.server");
      await syncRecommendationItems(row.application_id);
    }
    return { ok: true };
  });
