import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getMember } from "./applications.functions";
import { DOCUMENT_TYPES, checkQuota, exportFileName, uniqueNames } from "./documents";
import { isActiveStatus, type ApplicationStatus } from "./applications";

const documentTypeEnum = z.enum(
  DOCUMENT_TYPES.map((t) => t.value) as [string, ...string[]],
) as z.ZodType<(typeof DOCUMENT_TYPES)[number]["value"]>;
const SIGNED_URL_SECONDS = 600;

async function usage(profileId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("documents")
    .select("size_bytes")
    .eq("profile_id", profileId);
  return {
    documentCount: data?.length ?? 0,
    usedBytes: (data ?? []).reduce((n, d) => n + (d.size_bytes ?? 0), 0),
  };
}

/** Contrôle le quota et renvoie une URL d'envoi signée (envoi direct vers le stockage). */
export const prepareUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        sizeBytes: z.number().int().positive(),
        mimeType: z.enum(["application/pdf", "image/jpeg", "image/png", "image/webp"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const member = await getMember(context.supabase, context.userId);
    const quota = checkQuota({
      hasAccess: member.hasAccess,
      ...(await usage(member.profileId)),
      newBytes: data.sizeBytes,
    });
    if (!quota.ok) return { ok: false as const, error: quota.reason };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const ext = data.mimeType === "application/pdf" ? "pdf" : data.mimeType.split("/")[1];
    const path = `${member.profileId}/${crypto.randomUUID()}.${ext}`;
    const { data: signed, error } = await supabaseAdmin.storage
      .from("documents")
      .createSignedUploadUrl(path);
    if (error || !signed) throw new Error(error?.message ?? "Envoi impossible");
    return { ok: true as const, path: signed.path, token: signed.token };
  });

/** Enregistre le document envoyé, puis le relie aux candidatures qui l'attendent. */
export const confirmUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        path: z.string().max(200),
        type: documentTypeEnum,
        label: z.string().trim().min(1).max(120),
        pages: z.number().int().min(1).max(50).optional(),
        source: z.enum(["upload", "camera"]),
        expiresAt: z.string().date().nullable().optional(),
        itemId: z.string().uuid().nullable().optional(),
        recommenderId: z.string().uuid().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const member = await getMember(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const prefix = `${member.profileId}/`;
    if (!data.path.startsWith(prefix) || data.path.includes("..")) {
      throw new Error("Chemin invalide");
    }

    // Taille et type relus dans le stockage, pas sur la parole du navigateur
    const fileName = data.path.slice(prefix.length);
    const { data: listed } = await supabaseAdmin.storage
      .from("documents")
      .list(member.profileId, { search: fileName, limit: 1 });
    const object = listed?.find((o) => o.name === fileName);
    if (!object) throw new Error("Fichier non reçu. Réessayez l'envoi.");
    const meta = (object.metadata ?? {}) as { size?: number; mimetype?: string };
    const size = meta.size ?? 0;

    const current = await usage(member.profileId);
    const quota = checkQuota({ hasAccess: member.hasAccess, ...current, newBytes: size });
    if (!quota.ok) {
      await supabaseAdmin.storage.from("documents").remove([data.path]);
      return { ok: false as const, error: quota.reason };
    }

    const { data: doc, error } = await supabaseAdmin
      .from("documents")
      .insert({
        profile_id: member.profileId,
        type: data.type,
        label: data.label,
        storage_path: data.path,
        mime_type: meta.mimetype ?? "application/pdf",
        size_bytes: size,
        pages: data.pages ?? null,
        source: data.source,
        processed: data.source === "camera",
        expires_at: data.expiresAt ?? null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    const docs = await import("./documents.server");
    const linked = await docs.linkDocumentToItems(member.profileId, doc.id, data.type, data.itemId);
    if (data.recommenderId) {
      await docs.markRecommendationReceived(member.profileId, data.recommenderId, doc.id);
    }
    const { track } = await import("./analytics.server");
    await track(member.profileId, "doc_uploaded", { type: data.type, source: data.source });
    return { ok: true as const, id: doc.id, linked };
  });

export const listDocuments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const member = await getMember(context.supabase, context.userId);
    const [{ data: documents }, { data: apps }] = await Promise.all([
      context.supabase
        .from("documents")
        .select("*")
        .eq("profile_id", member.profileId)
        .order("created_at", { ascending: false }),
      context.supabase
        .from("applications")
        .select(
          "id, status, bourses ( university_name ), application_items ( id, label, kind, status, document_type, document_id, due_date )",
        )
        .eq("profile_id", member.profileId),
    ]);

    // Pièces attendues par les candidatures actives et pas encore fournies
    const missing = (apps ?? [])
      .filter((a) => isActiveStatus(a.status as ApplicationStatus))
      .flatMap((a) =>
        (a.application_items ?? [])
          .filter(
            (i) =>
              i.kind === "document" && !i.document_id && i.status !== "na" && i.status !== "done",
          )
          .map((i) => ({
            itemId: i.id,
            applicationId: a.id,
            label: i.label,
            documentType: i.document_type,
            dueDate: i.due_date,
            bourse: (a.bourses as { university_name: string } | null)?.university_name ?? "",
          })),
      )
      .sort((x, y) => (x.dueDate ?? "9999").localeCompare(y.dueDate ?? "9999"));

    const used = (documents ?? []).reduce((n, d) => n + (d.size_bytes ?? 0), 0);
    return { documents: documents ?? [], missing, usedBytes: used, hasAccess: member.hasAccess };
  });

export const getDocumentUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const member = await getMember(context.supabase, context.userId);
    const { data: doc } = await context.supabase
      .from("documents")
      .select("storage_path")
      .eq("id", data.id)
      .eq("profile_id", member.profileId)
      .maybeSingle();
    if (!doc) throw new Error("Document introuvable");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error } = await supabaseAdmin.storage
      .from("documents")
      .createSignedUrl(doc.storage_path, SIGNED_URL_SECONDS);
    if (error || !signed) throw new Error("Lien indisponible");
    return { url: signed.signedUrl };
  });

export const deleteDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const member = await getMember(context.supabase, context.userId);
    const { removeDocument } = await import("./documents.server");
    await removeDocument(member.profileId, data.id);
    return { ok: true };
  });

/** Fichiers à mettre dans le ZIP d'une candidature, avec des noms propres et des URL signées. */
export const getExportFiles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ applicationId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const member = await getMember(context.supabase, context.userId);
    const [{ data: profile }, { data: items }, { data: recs }] = await Promise.all([
      context.supabase.from("profiles").select("full_name").eq("id", member.profileId).single(),
      context.supabase
        .from("application_items")
        .select("document_id, applications!inner ( profile_id )")
        .eq("application_id", data.applicationId)
        .eq("applications.profile_id", member.profileId)
        .not("document_id", "is", null),
      context.supabase
        .from("recommenders")
        .select("document_id")
        .eq("application_id", data.applicationId)
        .eq("profile_id", member.profileId)
        .not("document_id", "is", null),
    ]);
    const ids = [
      ...new Set([...(items ?? []), ...(recs ?? [])].map((r) => r.document_id as string)),
    ];
    if (ids.length === 0) return { files: [] };

    const { data: docs } = await context.supabase
      .from("documents")
      .select("id, label, storage_path, mime_type")
      .in("id", ids);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const list = docs ?? [];
    const names = uniqueNames(
      list.map((d) =>
        exportFileName(
          profile?.full_name ?? "",
          d.label,
          d.mime_type === "application/pdf" ? "pdf" : (d.storage_path.split(".").pop() ?? "jpg"),
        ),
      ),
    );
    const files = [];
    for (const [i, d] of list.entries()) {
      const { data: signed } = await supabaseAdmin.storage
        .from("documents")
        .createSignedUrl(d.storage_path, SIGNED_URL_SECONDS);
      if (signed) files.push({ name: names[i] ?? `document_${i + 1}.pdf`, url: signed.signedUrl });
    }
    return { files };
  });
