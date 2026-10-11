import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin } from "./guard";
import { broadcastSchema, segmentSchema } from "./segment";

/** Aperçu : nombre de destinataires par canal, avant l'envoi. */
export const previewBroadcast = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ segment: segmentSchema, channels: z.array(z.enum(["whatsapp", "email"])).min(1) })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { segmentAudience } = await import("./broadcast.server");
    const audience = await segmentAudience(data.segment, data.channels);
    return { total: audience.total, whatsapp: audience.whatsapp, email: audience.email };
  });

export const sendBroadcastFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => broadcastSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { sendBroadcast } = await import("./broadcast.server");
    return sendBroadcast(data, context.userId);
  });

export const listBroadcasts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: broadcasts } = await supabaseAdmin
      .from("broadcasts")
      .select("id, title, channels, segment, recipients_count, created_at")
      .order("created_at", { ascending: false })
      .limit(30);
    const ids = (broadcasts ?? []).map((b) => b.id);
    const stats = new Map<string, { sent: number; pending: number; failed: number }>();
    if (ids.length > 0) {
      const { data: rows } = await supabaseAdmin
        .from("notifications")
        .select("broadcast_id, status")
        .in("broadcast_id", ids)
        .limit(20_000);
      for (const r of rows ?? []) {
        const s = stats.get(r.broadcast_id!) ?? { sent: 0, pending: 0, failed: 0 };
        if (r.status === "sent") s.sent += 1;
        else if (r.status === "failed") s.failed += 1;
        else s.pending += 1;
        stats.set(r.broadcast_id!, s);
      }
    }
    return (broadcasts ?? []).map((b) => ({
      ...b,
      stats: stats.get(b.id) ?? { sent: 0, pending: 0, failed: 0 },
    }));
  });
