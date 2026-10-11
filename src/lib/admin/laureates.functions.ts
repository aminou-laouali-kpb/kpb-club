import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin } from "./guard";

export const listAdminLaureates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("laureates")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const laureateSchema = z.object({
  id: z.string().uuid().optional(),
  first_name: z.string().trim().min(1).max(60),
  country: z
    .string()
    .regex(/^[A-Z]{2}$/)
    .nullable(),
  bourse_id: z.string().max(120).nullable(),
  bourse_name: z.string().max(200).nullable(),
  year: z.number().int().min(2000).max(2100).nullable(),
  quote: z.string().max(600).nullable(),
  video_url: z.string().url().max(500).nullable(),
  verified: z.boolean(),
  /** Accord écrit reçu : obligatoire pour publier. */
  consent: z.boolean(),
  is_demo: z.boolean(),
});

export const saveLaureate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => laureateSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { id, consent, ...fields } = data;
    if (fields.verified && !consent) {
      return { ok: false as const, error: "Un témoignage publié exige l'accord écrit du lauréat." };
    }
    let consentAt: string | null = null;
    if (consent) {
      const { data: current } = id
        ? await supabaseAdmin.from("laureates").select("consent_at").eq("id", id).maybeSingle()
        : { data: null };
      consentAt = current?.consent_at ?? new Date().toISOString();
    }
    const row = { ...fields, consent_at: consentAt };
    const { error } = id
      ? await supabaseAdmin.from("laureates").update(row).eq("id", id)
      : await supabaseAdmin.from("laureates").insert(row);
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });

export const deleteLaureate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("laureates").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
