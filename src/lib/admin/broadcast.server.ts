import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { queueNotifications, type QueuedNotification } from "../notifications.server";
import { channelsFor, type Prefs } from "../notification-prefs";
import { nextSendTime } from "../relance/window";
import { fetchAll } from "./fetch-all";
import {
  broadcastEmail,
  matchesSegment,
  memberStatus,
  type BroadcastInput,
  type Segment,
  type SegmentMember,
} from "./segment";

const PREF_FIELDS =
  "id, full_name, email, timezone, nationality, residence, deletion_requested_at, phone_e164, phone_verified_at, email_optin, notif_email, whatsapp_optin, notif_whatsapp_alerts, notif_whatsapp_reminders, notif_whatsapp_content";

type Member = SegmentMember & {
  full_name: string;
  email: string | null;
  timezone: string;
  prefs: Prefs;
};

async function loadMembers(): Promise<Member[]> {
  const [profiles, subs, apps] = await Promise.all([
    fetchAll((from, to) =>
      supabaseAdmin.from("profiles").select(PREF_FIELDS).order("id").range(from, to),
    ),
    fetchAll((from, to) =>
      supabaseAdmin
        .from("subscriptions")
        .select("profile_id, ends_at, grace_ends_at")
        .neq("status", "cancelled")
        .order("id")
        .range(from, to),
    ),
    fetchAll((from, to) =>
      supabaseAdmin
        .from("applications")
        .select("profile_id, bourse_id")
        .not("status", "in", "(abandoned,rejected)")
        .order("id")
        .range(from, to),
    ),
  ]);
  const accessEnd = new Map<string, string>();
  for (const s of subs) {
    const end = s.grace_ends_at ?? s.ends_at;
    if (s.profile_id && end > (accessEnd.get(s.profile_id) ?? "")) accessEnd.set(s.profile_id, end);
  }
  const bourses = new Map<string, string[]>();
  for (const a of apps)
    bourses.set(a.profile_id, [...(bourses.get(a.profile_id) ?? []), a.bourse_id]);
  return profiles.map((p) => ({
    id: p.id,
    full_name: p.full_name,
    email: p.email,
    timezone: p.timezone,
    nationality: p.nationality,
    residence: p.residence,
    status: memberStatus(accessEnd.get(p.id) ?? null),
    bourseIds: bourses.get(p.id) ?? [],
    deletionRequested: Boolean(p.deletion_requested_at),
    prefs: p as unknown as Prefs,
  }));
}

/** Destinataires d'un segment, avec les canaux réellement joignables. */
export async function segmentAudience(segment: Segment, channels: ("email" | "whatsapp")[]) {
  const members = (await loadMembers()).filter((m) => matchesSegment(m, segment));
  let whatsapp = 0;
  let email = 0;
  for (const m of members) {
    const c = channelsFor("content_broadcast", m.prefs);
    if (c.whatsapp && channels.includes("whatsapp")) whatsapp += 1;
    if (c.email && channels.includes("email")) email += 1;
  }
  return { members, total: members.length, whatsapp, email };
}

async function queueInChunks(items: QueuedNotification[]) {
  let queued = 0;
  for (let i = 0; i < items.length; i += 300) {
    queued += await queueNotifications(items.slice(i, i + 300));
  }
  return queued;
}

/** Diffusion : une ligne par membre et par canal, envoyée dans sa fenêtre 8 h – 20 h. */
export async function sendBroadcast(input: BroadcastInput, createdBy: string) {
  const audience = await segmentAudience(input.segment, input.channels);
  const { data: broadcast, error } = await supabaseAdmin
    .from("broadcasts")
    .insert({
      segment: input.segment,
      channels: input.channels,
      title: input.title,
      body: input.body,
      link: input.link,
      created_by: createdBy,
      recipients_count: audience.total,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  const now = new Date();
  const appUrl = process.env["APP_URL"] ?? "https://kpb-education.com";
  const queued = await queueInChunks(
    audience.members.map((m) => ({
      profile_id: m.id,
      recipient: m.email,
      kind: "content_broadcast",
      subject: input.title,
      body: broadcastEmail(input, m.full_name),
      dedupe_key: `broadcast:${broadcast.id}:${m.id}`,
      send_after: nextSendTime(now, m.timezone).toISOString(),
      broadcast_id: broadcast.id,
      wa_text: input.body,
      wa_link: input.link ?? `${appUrl}/dashboard`,
      allow_channels: input.channels,
    })),
  );
  await supabaseAdmin.from("broadcasts").update({ status: "sent" }).eq("id", broadcast.id);
  return { id: broadcast.id, recipients: audience.total, queued };
}

const POST_KIND_LABEL = {
  bourse: "Nouvelle bourse",
  video: "Nouvelle vidéo",
  method: "Nouvelle méthode",
  news: "Actualité",
} as const;

/** Nouveau post de la bibliothèque : prévient les membres (préférence « nouveaux contenus »). */
export async function notifyNewPost(post: {
  id: string;
  title: string;
  kind: keyof typeof POST_KIND_LABEL;
}) {
  const members = (await loadMembers()).filter((m) => !m.deletionRequested);
  const now = new Date();
  const link = `${process.env["APP_URL"] ?? "https://kpb-education.com"}/bibliotheque`;
  const label = POST_KIND_LABEL[post.kind];
  return queueInChunks(
    members.map((m) => ({
      profile_id: m.id,
      recipient: m.email,
      kind: "content_post",
      subject: `${label} : ${post.title}`.slice(0, 60),
      body: `Bonjour ${m.full_name || ""},\n\n${label} dans la bibliothèque KPB : « ${post.title} ».\n\n${link}\n\nL'équipe KPB Education`,
      dedupe_key: `post:${post.id}:${m.id}`,
      send_after: nextSendTime(now, m.timezone).toISOString(),
      wa_text: `${label} dans ta bibliothèque : ${post.title}`,
      wa_link: link,
    })),
  );
}
