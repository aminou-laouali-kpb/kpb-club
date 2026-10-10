import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getCart, type CartInfo } from "./maketou.server";
import { queueNotifications, dispatchPending } from "./notifications.server";
import { settlePayment } from "./subscriptions.server";
import { formatFcfa } from "./pricing";
import { formatDateFr } from "./matching";

export type ReconcileResult =
  | { status: "success"; activated: boolean }
  | { status: "pending" }
  | { status: "failed"; reason?: string }
  | { status: "not_found" };

/**
 * Rapproche un paiement Maketou de l'état réel du panier, interrogé auprès de l'API.
 * Utilisé par le webhook, la page de retour et le filet de sécurité du cron.
 */
export async function reconcilePayment(
  paymentId: string,
  knownCart?: CartInfo,
): Promise<ReconcileResult> {
  const { data: payment } = await supabaseAdmin
    .from("payments")
    .select("*")
    .eq("id", paymentId)
    .maybeSingle();
  if (!payment) return { status: "not_found" };
  if (payment.status === "success") return { status: "success", activated: false };
  if (payment.provider !== "maketou" || !payment.external_id) return { status: "pending" };

  // On ne se fie jamais au seul payload reçu : l'état est relu auprès de Maketou.
  const cart = await getCart(payment.external_id).catch(() => knownCart ?? null);
  if (!cart) return { status: "pending" };

  if (cart.status === "failed") {
    await supabaseAdmin
      .from("payments")
      .update({ status: "failed" })
      .eq("id", payment.id)
      .eq("status", "pending");
    return { status: "failed" };
  }
  if (cart.status !== "paid") return { status: "pending" };

  if (cart.amount !== null && cart.amount < payment.amount) {
    await supabaseAdmin
      .from("payments")
      .update({
        metadata: {
          ...((payment.metadata as Record<string, unknown>) ?? {}),
          amount_mismatch: cart.amount,
        },
      })
      .eq("id", payment.id);
    return { status: "failed", reason: "amount_mismatch" };
  }

  // Maketou a encaissé plus que prévu (montant libre ignoré) : on accepte et on le signale
  if (cart.amount !== null && cart.amount > payment.amount) {
    await supabaseAdmin
      .from("payments")
      .update({
        metadata: {
          ...((payment.metadata as Record<string, unknown>) ?? {}),
          overpaid: cart.amount - payment.amount,
        },
      })
      .eq("id", payment.id);
  }

  const settled = await settlePayment(payment.id, cart.transactionRef ?? cart.externalId);
  if (settled.activated) await notifyPaymentSuccess(settled.payment.profile_id, settled);
  return { status: "success", activated: settled.activated };
}

async function notifyPaymentSuccess(
  profileId: string,
  settled: {
    kind: "subscription" | "engagement";
    description: string;
    endsAt?: string;
    payment: { id: string; amount: number };
  },
) {
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("email, full_name")
    .eq("id", profileId)
    .maybeSingle();
  if (!profile?.email) return;
  const appUrl = (process.env["APP_URL"] ?? "").replace(/\/$/, "");
  const detail =
    settled.kind === "subscription" && settled.endsAt
      ? `Votre accès au Club Boursier est actif jusqu'au ${formatDateFr(settled.endsAt)}.`
      : "Votre accompagnement est enregistré : un agent KPB vous contacte sous 48 heures.";
  await queueNotifications([
    {
      profile_id: profileId,
      recipient: profile.email,
      kind: "payment_success",
      subject:
        settled.kind === "subscription"
          ? "Paiement reçu — votre accès au Club Boursier est actif"
          : "Paiement reçu — votre accompagnement KPB",
      body: `Bonjour ${profile.full_name || "cher membre"},\n\nNous avons bien reçu votre paiement de ${formatFcfa(settled.payment.amount)} (${settled.description}).\n${detail}\n\nVotre reçu est téléchargeable dans votre espace${appUrl ? ` : ${appUrl}/compte` : ", rubrique Compte"}.\n\nL'équipe KPB Education`,
      dedupe_key: `pay:${settled.payment.id}`,
    },
  ]);
  await dispatchPending(10).catch(() => undefined);
}
