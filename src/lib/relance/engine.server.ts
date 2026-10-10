/**
 * Moteur de relance, appelé chaque jour par le cron.
 * Chaque règle met des messages en file avec un `send_after` dans la fenêtre
 * 8 h – 20 h du membre ; le dispatch horaire les envoie quand ils sont dus.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { queueNotifications, type QueuedNotification } from "../notifications.server";
import { PRICING, formatFcfa, type PackageType } from "../pricing";
import { formatDateFr } from "../matching";
import { nextSendTime } from "./window";
import {
  SECOND_INSTALLMENT_FLAGS,
  engagementNudgeDue,
  inactivityDue,
  isoWeek,
  secondInstallmentReminder,
  type SecondInstallmentKind,
} from "./rules";

const DAY = 86_400_000;

type Profile = {
  id: string;
  email: string | null;
  full_name: string | null;
  email_optin: boolean;
  timezone: string | null;
};
const PROFILE_FIELDS = "id, email, full_name, email_optin, timezone";

function appUrl(path = "") {
  return `${(process.env["APP_URL"] ?? "").replace(/\/$/, "")}${path}`;
}

function hello(p: Profile) {
  return `Bonjour ${p.full_name?.split(" ")[0] || "cher membre"},`;
}

function message(
  p: Profile,
  now: Date,
  m: Omit<QueuedNotification, "profile_id" | "recipient" | "send_after">,
): QueuedNotification {
  return {
    ...m,
    profile_id: p.id,
    recipient: p.email,
    send_after: nextSendTime(now, p.timezone).toISOString(),
  };
}

// 1. Abonnement Club : J-7, J-2, J0, grâce, J+7, J+30

type SubKind = "j7" | "j2" | "j0" | "grace" | "j+7" | "j+30";

const SUB_MESSAGES: Record<SubKind, { subject: string; line: string }> = {
  j7: {
    subject: "Votre abonnement Club Boursier expire dans 7 jours",
    line: "Votre accès au guide, aux modèles et aux alertes se termine dans 7 jours.",
  },
  j2: {
    subject: "Plus que 2 jours d'abonnement Club Boursier",
    line: "Votre accès se termine dans 2 jours. Renouvelez pour ne rien interrompre.",
  },
  j0: {
    subject: "Votre abonnement Club Boursier se termine aujourd'hui",
    line: "Votre accès se termine aujourd'hui. Une période de grâce de 3 jours démarre ensuite.",
  },
  grace: {
    subject: "Période de grâce : 3 jours pour renouveler",
    line: "Votre abonnement est expiré. Vous gardez l'accès pendant 3 jours seulement.",
  },
  "j+7": {
    subject: "Votre accès au Club Boursier est suspendu",
    line: "Votre accès est suspendu depuis une semaine. Les fenêtres de bourses continuent, elles.",
  },
  "j+30": {
    subject: "Un mois sans le Club Boursier",
    line: "Cela fait un mois que votre accès est suspendu. Revenez quand vous le souhaitez.",
  },
};

async function subscriptionReminders(now: Date) {
  const { data: subs, error } = await supabaseAdmin
    .from("subscriptions")
    .select(
      `id, profile_id, plan, amount, ends_at, grace_ends_at, status, reminder_j7_sent, reminder_j2_sent, reminder_j0_sent, reminder_grace_sent, profiles ( ${PROFILE_FIELDS} )`,
    )
    .neq("status", "cancelled");
  if (error) throw new Error(error.message);

  const t = now.getTime();
  const queue: QueuedNotification[] = [];
  const updates: { id: string; patch: Record<string, boolean | string> }[] = [];

  // Un membre qui renouvelle a plusieurs lignes : seule la plus lointaine compte pour les relances
  const latestEnd = new Map<string, number>();
  for (const sub of subs ?? []) {
    const end = new Date(sub.ends_at).getTime();
    latestEnd.set(sub.profile_id, Math.max(latestEnd.get(sub.profile_id) ?? 0, end));
  }

  for (const sub of subs ?? []) {
    const ends = new Date(sub.ends_at).getTime();
    const grace = sub.grace_ends_at ? new Date(sub.grace_ends_at).getTime() : ends;

    // Statut tenu à jour
    const nextStatus = t <= ends ? "active" : t <= grace ? "grace" : "expired";
    if (sub.status !== nextStatus) updates.push({ id: sub.id, patch: { status: nextStatus } });

    const profile = sub.profiles as unknown as Profile | null;
    if (!profile) continue;
    if (ends < (latestEnd.get(sub.profile_id) ?? 0)) continue;

    const daysToEnd = Math.ceil((ends - t) / DAY);
    const daysSinceEnd = Math.floor((t - ends) / DAY);
    let kind: SubKind | null = null;
    let flag: string | null = null;
    if (daysToEnd === 7 && !sub.reminder_j7_sent) [kind, flag] = ["j7", "reminder_j7_sent"];
    else if (daysToEnd === 2 && !sub.reminder_j2_sent) [kind, flag] = ["j2", "reminder_j2_sent"];
    else if (daysToEnd === 0 && !sub.reminder_j0_sent) [kind, flag] = ["j0", "reminder_j0_sent"];
    else if (t > ends && t <= grace && !sub.reminder_grace_sent)
      [kind, flag] = ["grace", "reminder_grace_sent"];
    else if (daysSinceEnd === 7) kind = "j+7";
    else if (daysSinceEnd === 30) kind = "j+30";
    if (!kind) continue;

    const m = SUB_MESSAGES[kind];
    queue.push(
      message(profile, now, {
        kind: `subscription_${kind}`,
        subject: m.subject,
        body: `${hello(profile)}\n\n${m.line}\n\nRenouvellement : ${formatFcfa(PRICING.club[sub.plan].amount)} (formule ${sub.plan === "quarterly" ? "trimestrielle" : "mensuelle"}).\n${appUrl("/offre")}\n\nL'équipe KPB Education`,
        dedupe_key: `sub:${sub.id}:${kind}`,
      }),
    );
    if (flag) updates.push({ id: sub.id, patch: { [flag]: true } });
  }

  const queued = await queueNotifications(queue);
  for (const u of updates) {
    await supabaseAdmin
      .from("subscriptions")
      .update(u.patch as never)
      .eq("id", u.id);
  }
  return queued;
}

// 2. Accompagnement : 2e tranche à J-5, J-1, J0, J+3

const T2_LINES: Record<SecondInstallmentKind, { subject: string; line: string }> = {
  t2_j5: {
    subject: "Votre 2e tranche d'accompagnement arrive dans 5 jours",
    line: "La seconde tranche de votre accompagnement est à régler dans 5 jours.",
  },
  t2_j1: {
    subject: "2e tranche d'accompagnement : demain",
    line: "La seconde tranche de votre accompagnement est à régler demain.",
  },
  t2_j0: {
    subject: "2e tranche d'accompagnement : aujourd'hui",
    line: "La seconde tranche de votre accompagnement est à régler aujourd'hui.",
  },
  t2_jp3: {
    subject: "Votre 2e tranche d'accompagnement est en attente",
    line: "La seconde tranche de votre accompagnement est en retard. Le dépôt final de votre dossier attend ce règlement.",
  },
};

async function secondInstallmentReminders(now: Date) {
  const { data: rows } = await supabaseAdmin
    .from("engagements")
    .select(
      `id, amount, paid_amount, package_type, second_due_at, reminder_t2_j5_sent, reminder_t2_j1_sent, reminder_t2_j0_sent, reminder_t2_jp3_sent, profiles ( ${PROFILE_FIELDS} )`,
    )
    .eq("installments", 2)
    .not("second_due_at", "is", null)
    .not("status", "in", "(pending_payment,cancelled)");

  const queue: QueuedNotification[] = [];
  const updates: { id: string; flag: string }[] = [];
  for (const e of rows ?? []) {
    if (e.paid_amount >= e.amount) continue;
    const profile = e.profiles as unknown as Profile | null;
    if (!profile) continue;
    const kind = secondInstallmentReminder(e.second_due_at, now, {
      reminder_t2_j5_sent: e.reminder_t2_j5_sent,
      reminder_t2_j1_sent: e.reminder_t2_j1_sent,
      reminder_t2_j0_sent: e.reminder_t2_j0_sent,
      reminder_t2_jp3_sent: e.reminder_t2_jp3_sent,
    });
    if (!kind) continue;
    const label = PRICING.accompaniment[(e.package_type ?? "single") as PackageType]?.label ?? "";
    queue.push(
      message(profile, now, {
        kind: `engagement_${kind}`,
        subject: T2_LINES[kind].subject,
        body: `${hello(profile)}\n\n${T2_LINES[kind].line}\n\nAccompagnement ${label} : ${formatFcfa(e.amount - e.paid_amount)} à régler avant le ${formatDateFr(e.second_due_at)}.\n${appUrl("/accompagnement")}\n\nL'équipe KPB Education`,
        dedupe_key: `eng:${e.id}:${kind}`,
      }),
    );
    updates.push({ id: e.id, flag: SECOND_INSTALLMENT_FLAGS[kind] });
  }
  const queued = await queueNotifications(queue);
  for (const u of updates) {
    await supabaseAdmin
      .from("engagements")
      .update({ [u.flag]: true } as never)
      .eq("id", u.id);
  }
  return queued;
}

// 3. Engagement : une échéance approche et rien n'a bougé

async function engagementNudges(now: Date) {
  const horizon = new Date(now.getTime() + 7 * DAY).toISOString().slice(0, 10);
  const today = now.toISOString().slice(0, 10);
  const { data: items } = await supabaseAdmin
    .from("application_items")
    .select(
      `id, label, status, due_date, applications!inner ( id, status, last_activity_at, profile_id, bourses ( university_name ), profiles ( ${PROFILE_FIELDS} ) )`,
    )
    .in("status", ["todo", "in_progress"])
    .gte("due_date", today)
    .lte("due_date", horizon)
    .order("due_date", { ascending: true });

  const week = isoWeek(now);
  const seen = new Set<string>();
  const queue: QueuedNotification[] = [];
  for (const item of items ?? []) {
    const app = item.applications as unknown as {
      id: string;
      status: string;
      last_activity_at: string | null;
      bourses: { university_name: string } | null;
      profiles: Profile | null;
    };
    if (seen.has(app.id)) continue; // une seule relance par candidature, l'item le plus urgent
    if (["submitted", "interview", "accepted", "rejected", "abandoned"].includes(app.status))
      continue;
    const profile = app.profiles;
    if (!profile) continue;
    if (!engagementNudgeDue(item, app.last_activity_at, now)) continue;
    seen.add(app.id);
    const days = Math.round(
      (Date.parse(`${item.due_date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY,
    );
    queue.push(
      message(profile, now, {
        kind: "engagement_nudge",
        subject: `Il te reste ${days} jour${days > 1 ? "s" : ""} pour : ${item.label}`,
        body: `${hello(profile)}\n\nIl te reste ${days} jour${days > 1 ? "s" : ""} pour « ${item.label} » (${app.bourses?.university_name ?? "ta candidature"}). Ouvre ton tracker pour avancer :\n${appUrl(`/candidatures/${app.id}`)}\n\nL'équipe KPB Education`,
        dedupe_key: `nudge:${app.id}:${week}`,
      }),
    );
  }
  return queueNotifications(queue);
}

// 4. Inactivité : membre payant sans connexion depuis 14 jours

async function inactivityReminders(now: Date) {
  const { data: subs } = await supabaseAdmin
    .from("subscriptions")
    .select(`profile_id, profiles ( ${PROFILE_FIELDS} )`)
    .gte("ends_at", now.toISOString())
    .neq("status", "cancelled");
  const profiles = new Map<string, Profile>();
  for (const s of subs ?? []) {
    const p = s.profiles as unknown as Profile | null;
    if (p) profiles.set(p.id, p);
  }
  if (profiles.size === 0) return 0;
  const ids = [...profiles.keys()];

  const [{ data: sessions }, { data: apps }] = await Promise.all([
    supabaseAdmin
      .from("member_sessions")
      .select("profile_id, last_seen_at")
      .in("profile_id", ids)
      .order("last_seen_at", { ascending: false }),
    supabaseAdmin
      .from("applications")
      .select("id, profile_id, next_action, deadline, status")
      .in("profile_id", ids)
      .not("status", "in", "(accepted,rejected,abandoned)")
      .order("deadline", { ascending: true, nullsFirst: false }),
  ]);
  const lastSeen = new Map<string, string>();
  for (const s of sessions ?? [])
    if (!lastSeen.has(s.profile_id)) lastSeen.set(s.profile_id, s.last_seen_at);

  const queue: QueuedNotification[] = [];
  for (const [id, profile] of profiles) {
    const period = inactivityDue(lastSeen.get(id) ?? null, now);
    if (!period) continue;
    const app = (apps ?? []).find((a) => a.profile_id === id && a.next_action);
    const action = app
      ? `Ta prochaine action : ${app.next_action}.\n${appUrl(`/candidatures/${app.id}`)}`
      : `Choisis une bourse et obtiens ta checklist :\n${appUrl("/candidatures")}`;
    queue.push(
      message(profile, now, {
        kind: "inactivity",
        subject: "On ne t'a pas vu depuis deux semaines",
        body: `${hello(profile)}\n\nLes dates limites, elles, continuent d'avancer. ${action}\n\nL'équipe KPB Education`,
        dedupe_key: `inactive:${id}:${period}`,
      }),
    );
  }
  return queueNotifications(queue);
}

// 5. Recommandateurs : relance unique à J+7

async function recommenderReminders(now: Date) {
  const { isReminderDue, buildReminderMessage, REMIND_AFTER_DAYS } =
    await import("../recommenders");
  const { data: recs } = await supabaseAdmin
    .from("recommenders")
    .select(
      `id, full_name, title, email, status, auto_remind, requested_at, reminded_at, profiles ( ${PROFILE_FIELDS} ), applications ( deadline, bourses ( university_name ) )`,
    )
    .eq("status", "requested")
    .is("reminded_at", null)
    .lte("requested_at", new Date(now.getTime() - REMIND_AFTER_DAYS * DAY).toISOString())
    .limit(200);

  const queue: QueuedNotification[] = [];
  const remindedIds: string[] = [];
  for (const rec of recs ?? []) {
    if (!isReminderDue(rec, now.getTime())) continue;
    const student = rec.profiles as unknown as Profile | null;
    if (!student) continue;
    const app = rec.applications as unknown as {
      deadline: string | null;
      bourses: { university_name: string } | null;
    } | null;
    const m = buildReminderMessage({
      studentName: student.full_name || "Un étudiant KPB",
      recommender: { full_name: rec.full_name, title: rec.title },
      bourseName: app?.bourses?.university_name ?? "ma candidature",
      deadline: app?.deadline ?? null,
    });
    if (rec.auto_remind && rec.email) {
      // L'étudiant a accepté que KPB relance le professeur à sa place
      queue.push({
        ...message(student, now, {
          kind: "recommender_reminder",
          subject: m.subject,
          body: `${m.body}\n\n—\nMessage envoyé via KPB Education à la demande de ${student.full_name || "l'étudiant"}.`,
          dedupe_key: `reco:${rec.id}:j7`,
        }),
        recipient: rec.email,
      });
    } else {
      queue.push(
        message(student, now, {
          kind: "recommender_reminder_student",
          subject: `Pensez à relancer ${rec.full_name}`,
          body: `${hello(student)}\n\nVotre demande de lettre de recommandation à ${rec.full_name} date d'une semaine. Voici un message de relance prêt à envoyer :\n\n${m.body}\n\nL'équipe KPB Education`,
          dedupe_key: `reco:${rec.id}:j7`,
        }),
      );
    }
    remindedIds.push(rec.id);
  }
  const queued = await queueNotifications(queue);
  if (remindedIds.length > 0) {
    await supabaseAdmin
      .from("recommenders")
      .update({ status: "reminded", reminded_at: now.toISOString() })
      .in("id", remindedIds);
  }
  return queued;
}

// 6. Paiements Maketou récents dont le webhook n'est pas arrivé

async function reconcilePendingPayments(now: Date) {
  const { reconcilePayment } = await import("../payments.server");
  const { data: stale } = await supabaseAdmin
    .from("payments")
    .select("id")
    .eq("provider", "maketou")
    .eq("status", "pending")
    .not("external_id", "is", null)
    .gte("created_at", new Date(now.getTime() - 2 * DAY).toISOString())
    .limit(50);
  let reconciled = 0;
  for (const p of stale ?? []) {
    const result = await reconcilePayment(p.id).catch(() => null);
    if (result?.status === "success") reconciled += 1;
  }
  return reconciled;
}

/** Exécute toutes les règles ; une règle en échec n'empêche pas les autres. */
export async function runDailyRelance(now = new Date()) {
  const steps = {
    subscriptions: subscriptionReminders,
    secondInstallments: secondInstallmentReminders,
    engagement: engagementNudges,
    inactivity: inactivityReminders,
    recommenders: recommenderReminders,
    reconciledPayments: reconcilePendingPayments,
  };
  const results: Record<string, number | string> = {};
  for (const [name, step] of Object.entries(steps)) {
    try {
      results[name] = await step(now);
    } catch (e) {
      console.error(`relance ${name}`, e);
      results[name] = `erreur : ${e instanceof Error ? e.message : "inconnue"}`;
    }
  }
  return results;
}
