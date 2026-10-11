import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";
import { assertAdmin } from "./guard";
import { bourseSchema, requirementSchema } from "./bourses";

export const listAdminBourses = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: bourses, error }, { data: requirements }] = await Promise.all([
      supabaseAdmin.from("bourses").select("*").order("window_closes", { nullsFirst: false }),
      supabaseAdmin.from("bourse_requirements").select("*").order("sort_order"),
    ]);
    if (error) throw new Error(error.message);
    return { bourses: bourses ?? [], requirements: requirements ?? [] };
  });

/** Crée ou met à jour une bourse : les alertes et le vérificateur la lisent aussitôt. */
export const saveBourse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ bourse: bourseSchema, isNew: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const b = data.bourse;
    if (b.window_opens && b.window_closes && b.window_opens > b.window_closes) {
      return { ok: false as const, error: "La fenêtre se ferme avant de s'ouvrir." };
    }
    const row = {
      ...b,
      essay_criteria: b.essay_criteria as Json,
      operations_order: b.operations_order as Json,
      english_tests: b.english_tests as Json,
      updated_at: new Date().toISOString(),
    };
    if (data.isNew) {
      const { error } = await supabaseAdmin.from("bourses").insert(row);
      if (error) {
        return {
          ok: false as const,
          error: error.code === "23505" ? "Cet identifiant existe déjà." : error.message,
        };
      }
    } else {
      const { id, ...patch } = row;
      const { error } = await supabaseAdmin.from("bourses").update(patch).eq("id", id);
      if (error) return { ok: false as const, error: error.message };
    }
    return { ok: true as const };
  });

/** « Dupliquer pour l'année suivante » : copie avec exigences, dates +1 an, à vérifier. */
export const duplicateBourseForNextYear = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().min(1).max(120) }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { duplicateBourse } = await import("./bourses");
    const [{ data: bourse }, { data: reqs }] = await Promise.all([
      supabaseAdmin.from("bourses").select("*").eq("id", data.id).single(),
      supabaseAdmin.from("bourse_requirements").select("*").eq("bourse_id", data.id),
    ]);
    if (!bourse) return { ok: false as const, error: "Bourse introuvable" };
    const copy = duplicateBourse(bourse, reqs ?? []);
    const { error } = await supabaseAdmin.from("bourses").insert(copy.bourse);
    if (error) {
      return {
        ok: false as const,
        error: error.code === "23505" ? `La bourse ${copy.bourse.id} existe déjà.` : error.message,
      };
    }
    if (copy.requirements.length > 0) {
      const { error: reqError } = await supabaseAdmin
        .from("bourse_requirements")
        .insert(copy.requirements);
      if (reqError) throw new Error(reqError.message);
    }
    return { ok: true as const, id: copy.bourse.id, year: copy.year };
  });

export const saveRequirement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => requirementSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { id, ...row } = data;
    const { error } = id
      ? await supabaseAdmin.from("bourse_requirements").update(row).eq("id", id)
      : await supabaseAdmin.from("bourse_requirements").insert(row);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Retire une exigence du modèle de la bourse. Les checklists déjà créées gardent
 * leur élément (le lien vers l'exigence passe simplement à vide).
 */
export const deleteRequirement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("bourse_requirements").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Nouvel ordre des exigences d'une bourse (liste d'identifiants). */
export const reorderRequirements = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ ids: z.array(z.string().uuid()).min(1).max(100) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    for (const [index, id] of data.ids.entries()) {
      const { error } = await supabaseAdmin
        .from("bourse_requirements")
        .update({ sort_order: index + 1 })
        .eq("id", id);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });
