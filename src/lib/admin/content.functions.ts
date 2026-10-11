import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin } from "./guard";

const slug = z
  .string()
  .min(2)
  .max(120)
  .regex(/^[a-z0-9-]+$/, "Identifiant : minuscules, chiffres et tirets");

export const listAdminContent = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [chapters, templates, posts] = await Promise.all([
      supabaseAdmin.from("content_chapters").select("*").order("sort_order"),
      supabaseAdmin.from("content_templates").select("*").order("sort_order"),
      supabaseAdmin
        .from("content_posts")
        .select("*")
        .order("published_at", { ascending: false, nullsFirst: true }),
    ]);
    return {
      chapters: chapters.data ?? [],
      templates: templates.data ?? [],
      posts: posts.data ?? [],
    };
  });

const chapterSchema = z.object({
  id: z.string().uuid().optional(),
  slug,
  title: z.string().trim().min(2).max(200),
  summary: z.string().max(500).nullable(),
  body_md: z.string().min(1).max(100_000),
  sort_order: z.number().int().min(0).max(999).nullable(),
  published: z.boolean(),
});

export const saveChapter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => chapterSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { id, ...row } = data;
    const { error } = id
      ? await supabaseAdmin.from("content_chapters").update(row).eq("id", id)
      : await supabaseAdmin.from("content_chapters").insert(row);
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });

const templateSchema = chapterSchema.extend({
  category: z.enum(["cv", "motivation", "essay", "recommendation", "email"]).nullable(),
  prefill: z.boolean(),
});

export const saveTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => templateSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { id, ...row } = data;
    const { error } = id
      ? await supabaseAdmin.from("content_templates").update(row).eq("id", id)
      : await supabaseAdmin.from("content_templates").insert(row);
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });

const postSchema = z.object({
  id: z.string().uuid().optional(),
  kind: z.enum(["bourse", "video", "method", "news"]),
  title: z.string().trim().min(3).max(200),
  body_md: z.string().max(20_000).nullable(),
  url: z.string().url().max(500).nullable(),
  bourse_id: z.string().max(120).nullable(),
  notify: z.boolean(),
  published: z.boolean(),
});

/**
 * Enregistre un post de la bibliothèque. À la première publication avec « notifier »,
 * les membres sont prévenus (préférences « nouveaux contenus » respectées).
 */
export const savePost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => postSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { id, published, ...fields } = data;

    let wasPublished = false;
    if (id) {
      const { data: current } = await supabaseAdmin
        .from("content_posts")
        .select("published_at")
        .eq("id", id)
        .maybeSingle();
      wasPublished = Boolean(current?.published_at);
    }
    const publishedAt = published ? (wasPublished ? undefined : new Date().toISOString()) : null;
    const row = { ...fields, ...(publishedAt !== undefined ? { published_at: publishedAt } : {}) };
    const { data: saved, error } = id
      ? await supabaseAdmin.from("content_posts").update(row).eq("id", id).select("id").single()
      : await supabaseAdmin.from("content_posts").insert(row).select("id").single();
    if (error) return { ok: false as const, error: error.message };

    let notified = 0;
    if (published && !wasPublished && data.notify) {
      const { notifyNewPost } = await import("./broadcast.server");
      notified = await notifyNewPost({ id: saved.id, title: data.title, kind: data.kind });
    }
    return { ok: true as const, id: saved.id, notified };
  });

export const deleteContent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        table: z.enum(["content_chapters", "content_templates", "content_posts"]),
        id: z.string().uuid(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from(data.table).delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
