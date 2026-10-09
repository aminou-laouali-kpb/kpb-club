import { createFileRoute } from "@tanstack/react-router";
import { PRICING, formatFcfa } from "@/lib/pricing";

const DAY = 86_400_000;

type Kind = "j7" | "j2" | "j0" | "grace" | "j+7" | "j+30";

const MESSAGES: Record<Kind, { subject: string; line: string }> = {
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

export const Route = createFileRoute("/api/public/hooks/reminders")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { guardCronRequest } = await import("@/lib/cron-guard.server");
        const denied = await guardCronRequest(request);
        if (denied) return denied;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { queueNotifications, dispatchPending } = await import("@/lib/notifications.server");

        const { data: subs, error } = await supabaseAdmin
          .from("subscriptions")
          .select(
            "id, profile_id, plan, amount, ends_at, grace_ends_at, status, reminder_j7_sent, reminder_j2_sent, reminder_j0_sent, reminder_grace_sent, profiles ( id, email, full_name, email_optin )",
          )
          .neq("status", "cancelled");
        if (error) return Response.json({ error: error.message }, { status: 500 });

        const now = Date.now();
        const queue = [];
        const flagUpdates: Array<{ id: string; patch: Record<string, boolean | string> }> = [];

        // Un membre qui renouvelle a plusieurs lignes : seule la plus lointaine compte pour les relances
        const latestEnd = new Map<string, number>();
        for (const sub of subs ?? []) {
          const end = new Date(sub.ends_at).getTime();
          latestEnd.set(sub.profile_id, Math.max(latestEnd.get(sub.profile_id) ?? 0, end));
        }

        for (const sub of subs ?? []) {
          const superseded = new Date(sub.ends_at).getTime() < (latestEnd.get(sub.profile_id) ?? 0);
          const profile = sub.profiles as unknown as {
            id: string;
            email: string | null;
            full_name: string | null;
            email_optin: boolean;
          } | null;
          if (!profile || !profile.email_optin) continue;

          const ends = new Date(sub.ends_at).getTime();
          const grace = sub.grace_ends_at ? new Date(sub.grace_ends_at).getTime() : ends;
          const daysToEnd = Math.ceil((ends - now) / DAY);
          const daysSinceEnd = Math.floor((now - ends) / DAY);

          let kind: Kind | null = null;
          let flag: string | null = null;
          if (daysToEnd === 7 && !sub.reminder_j7_sent) {
            kind = "j7";
            flag = "reminder_j7_sent";
          } else if (daysToEnd === 2 && !sub.reminder_j2_sent) {
            kind = "j2";
            flag = "reminder_j2_sent";
          } else if (daysToEnd === 0 && !sub.reminder_j0_sent) {
            kind = "j0";
            flag = "reminder_j0_sent";
          } else if (now > ends && now <= grace && !sub.reminder_grace_sent) {
            kind = "grace";
            flag = "reminder_grace_sent";
          } else if (daysSinceEnd === 7) {
            kind = "j+7";
          } else if (daysSinceEnd === 30) {
            kind = "j+30";
          }

          // Statut tenu à jour
          const nextStatus = now <= ends ? "active" : now <= grace ? "grace" : ("expired" as const);
          if (sub.status !== nextStatus) {
            flagUpdates.push({ id: sub.id, patch: { status: nextStatus } });
          }

          if (!kind || superseded) continue;
          const message = MESSAGES[kind];
          queue.push({
            profile_id: profile.id,
            recipient: profile.email,
            kind: `subscription_${kind}`,
            subject: message.subject,
            body: `Bonjour ${profile.full_name || "cher membre"},\n\n${message.line}\n\nRenouvellement : ${formatFcfa(PRICING.club[sub.plan].amount)} (formule ${sub.plan === "quarterly" ? "trimestrielle" : "mensuelle"}).\n\nL'équipe KPB Education`,
            dedupe_key: `sub:${sub.id}:${kind}`,
          });
          if (flag) flagUpdates.push({ id: sub.id, patch: { [flag]: true } });
        }

        const queued = await queueNotifications(queue);
        for (const update of flagUpdates) {
          await supabaseAdmin
            .from("subscriptions")
            .update(update.patch as never)
            .eq("id", update.id);
        }
        // Filet de sécurité : paiements Maketou récents dont le webhook n'est pas arrivé
        const { reconcilePayment } = await import("@/lib/payments.server");
        const { data: stale } = await supabaseAdmin
          .from("payments")
          .select("id")
          .eq("provider", "maketou")
          .eq("status", "pending")
          .not("external_id", "is", null)
          .gte("created_at", new Date(now - 2 * DAY).toISOString())
          .limit(50);
        let reconciled = 0;
        for (const p of stale ?? []) {
          const result = await reconcilePayment(p.id).catch(() => null);
          if (result?.status === "success") reconciled += 1;
        }

        const dispatch = await dispatchPending();

        return Response.json({ ok: true, queued, reconciled, ...dispatch });
      },
    },
  },
});
