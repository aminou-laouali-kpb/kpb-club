import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { GUIDE_CHAPTERS, TEMPLATES } from "./content";
import { embedWatermark, prefillTemplate, watermarkText } from "./watermark";

/** Accès au contenu payant (Club ou accompagnement) et filigrane du membre. */
async function contentAccess(userId: string) {
  const { getAiMember } = await import("./ai/access.server");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const member = await getAiMember(userId);
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select(
      "id, full_name, member_code, email, phone, residence, nationality, field_of_study, education",
    )
    .eq("id", member.profileId)
    .single();
  return {
    access: member.tier !== "free",
    profile: profile!,
    mark: watermarkText(profile?.full_name, profile?.member_code),
  };
}

type Item = { slug: string; title: string; summary: string | null };

async function chapters(): Promise<(Item & { body: string })[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("content_chapters")
    .select("slug, title, summary, body_md")
    .eq("published", true)
    .order("sort_order", { ascending: true });
  // Table vide (migration pas encore appliquée) : on garde le contenu livré avec l'application
  if (!data || data.length === 0) return GUIDE_CHAPTERS.map((c) => ({ ...c }));
  return data.map((c) => ({ slug: c.slug, title: c.title, summary: c.summary, body: c.body_md }));
}

async function templates(): Promise<(Item & { body: string; prefill: boolean })[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("content_templates")
    .select("slug, title, summary, body_md, prefill")
    .eq("published", true)
    .order("sort_order", { ascending: true });
  if (!data || data.length === 0) return TEMPLATES.map((t) => ({ ...t, prefill: false }));
  return data.map((t) => ({
    slug: t.slug,
    title: t.title,
    summary: t.summary,
    body: t.body_md,
    prefill: t.prefill,
  }));
}

export const listGuide = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { access } = await contentAccess(context.userId);
    const list = await chapters();
    return { access, chapters: list.map(({ slug, title, summary }) => ({ slug, title, summary })) };
  });

export const getChapter = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ slug: z.string().max(120) }).parse(input))
  .handler(async ({ data, context }) => {
    const { access, mark, profile } = await contentAccess(context.userId);
    const list = await chapters();
    const index = list.findIndex((c) => c.slug === data.slug);
    const chapter = list[index];
    if (!chapter) return { found: false as const };
    if (!access) return { found: true as const, access: false as const, title: chapter.title };
    const next = list[index + 1];
    const { track } = await import("./analytics.server");
    await track(profile.id, "chapter_read", { slug: chapter.slug });
    return {
      found: true as const,
      access: true as const,
      title: chapter.title,
      summary: chapter.summary,
      // Filigrane inscrit dans le texte lui-même : il reste dans les copies et le cache hors ligne
      body: embedWatermark(chapter.body, mark),
      watermark: mark,
      next: next ? { slug: next.slug, title: next.title } : null,
    };
  });

export const listTemplatesFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { access } = await contentAccess(context.userId);
    const list = await templates();
    return {
      access,
      templates: list.map(({ slug, title, summary }) => ({ slug, title, summary })),
    };
  });

export const getTemplate = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ slug: z.string().max(120) }).parse(input))
  .handler(async ({ data, context }) => {
    const { access, mark, profile } = await contentAccess(context.userId);
    const template = (await templates()).find((t) => t.slug === data.slug);
    if (!template) return { found: false as const };
    if (!access) return { found: true as const, access: false as const, title: template.title };
    const { countryName } = await import("./countries");
    const body = template.prefill
      ? prefillTemplate(template.body, {
          full_name: profile.full_name,
          email: profile.email,
          phone: profile.phone,
          residence: profile.residence ? countryName(profile.residence) : null,
          nationality: profile.nationality ? countryName(profile.nationality) : null,
          field_of_study: profile.field_of_study,
          education: profile.education,
        })
      : template.body;
    return {
      found: true as const,
      access: true as const,
      title: template.title,
      summary: template.summary,
      body: embedWatermark(body, mark),
      watermark: mark,
    };
  });

/** Bibliothèque : publications (bourses, vidéos, méthodes, actualités) et non-lus. */
export const listPosts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { access, profile } = await contentAccess(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: posts }, { data: reads }] = await Promise.all([
      supabaseAdmin
        .from("content_posts")
        .select("id, kind, title, body_md, url, bourse_id, published_at")
        .not("published_at", "is", null)
        .lte("published_at", new Date().toISOString())
        .order("published_at", { ascending: false })
        .limit(100),
      supabaseAdmin.from("content_post_reads").select("post_id").eq("profile_id", profile.id),
    ]);
    const read = new Set((reads ?? []).map((r) => r.post_id));
    return {
      access,
      posts: (posts ?? []).map((p) => ({ ...p, unread: !read.has(p.id) })),
    };
  });

export const markPostRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ postId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { profile } = await contentAccess(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("content_post_reads")
      .upsert(
        { post_id: data.postId, profile_id: profile.id },
        { onConflict: "post_id,profile_id", ignoreDuplicates: true },
      );
    return { ok: true };
  });
