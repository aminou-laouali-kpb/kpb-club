import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { REWARD_DAYS, rewardsDue } from "./referrals";
import { activateClubAccess } from "./subscriptions.server";
import { queueNotifications } from "./notifications.server";
import { nextSendTime } from "./relance/window";

/** Premier paiement d'un filleul : il compte pour son parrain, qui est récompensé tous les 2. */
export async function markReferralPaid(referredProfileId: string) {
  const { data: referral } = await supabaseAdmin
    .from("referrals")
    .update({ status: "paid", paid_at: new Date().toISOString() })
    .eq("referred_id", referredProfileId)
    .eq("status", "signed_up")
    .select("referrer_id")
    .maybeSingle();
  if (referral) await processReferralRewards(referral.referrer_id);
}

export async function processReferralRewards(referrerId: string) {
  const { data: paid } = await supabaseAdmin
    .from("referrals")
    .select("id, paid_at")
    .eq("referrer_id", referrerId)
    .eq("status", "paid");
  let rewarded = 0;
  for (const batch of rewardsDue(paid ?? [])) {
    // Réservation conditionnelle : un passage concurrent ne peut pas récompenser deux fois
    const { data: claimed } = await supabaseAdmin
      .from("referrals")
      .update({ status: "rewarded", rewarded_at: new Date().toISOString() })
      .in("id", batch)
      .eq("status", "paid")
      .select("id");
    if ((claimed?.length ?? 0) !== batch.length) {
      if (claimed && claimed.length > 0) {
        await supabaseAdmin
          .from("referrals")
          .update({ status: "paid", rewarded_at: null })
          .in(
            "id",
            claimed.map((c) => c.id),
          );
      }
      continue;
    }
    const access = await activateClubAccess({
      profileId: referrerId,
      days: REWARD_DAYS,
      amount: 0,
      source: "referral",
    });
    await supabaseAdmin
      .from("referrals")
      .update({ reward_subscription_id: access.subscriptionId })
      .in("id", batch);
    rewarded += 1;
  }

  if (rewarded > 0) {
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("email, full_name, email_optin, timezone")
      .eq("id", referrerId)
      .maybeSingle();
    if (profile) {
      await queueNotifications([
        {
          profile_id: referrerId,
          recipient: profile.email,
          kind: "referral_reward",
          subject: `Merci ! ${rewarded * REWARD_DAYS} jours de Club offerts`,
          body: `Bonjour ${profile.full_name || ""},\n\nDeux personnes que vous avez invitées ont rejoint le Club Boursier. Comme promis, ${rewarded * REWARD_DAYS} jours ont été ajoutés à votre abonnement.\n\nContinuez à partager votre lien : chaque nouvelle paire de filleuls vous offre un mois de plus.\n\nL'équipe KPB Education`,
          dedupe_key: `referral-reward:${referrerId}:${new Date().toISOString()}`,
          send_after: nextSendTime(new Date(), profile.timezone).toISOString(),
        },
      ]);
    }
  }
  return rewarded;
}
