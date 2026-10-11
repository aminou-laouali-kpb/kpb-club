/** Envoi et vérification des codes de connexion (WhatsApp, SMS en secours). */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { OTP_TTL_MS, canSend, canVerify, generateCode, hashCode, safeEqual } from "./otp";

const secret = () =>
  process.env["OTP_HASH_SECRET"] ?? process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "kpb";
const IP_MAX_SENDS_PER_HOUR = 20;

export type SendResult = { ok: true; channel: "whatsapp" | "sms" } | { ok: false; error: string };

export async function sendCode(input: {
  phone: string;
  channel: "whatsapp" | "sms";
  purpose: "login" | "link";
  profileId?: string | null;
  ip: string | null;
}): Promise<SendResult> {
  const since = new Date(Date.now() - 3_600_000).toISOString();
  const [{ count: byPhone }, { count: byIp }] = await Promise.all([
    supabaseAdmin
      .from("otp_codes")
      .select("id", { count: "exact", head: true })
      .eq("phone_e164", input.phone)
      .gte("created_at", since),
    input.ip
      ? supabaseAdmin
          .from("otp_codes")
          .select("id", { count: "exact", head: true })
          .eq("ip", input.ip)
          .gte("created_at", since)
      : Promise.resolve({ count: 0 }),
  ]);
  if (!canSend(byPhone ?? 0) || (byIp ?? 0) >= IP_MAX_SENDS_PER_HOUR) {
    return { ok: false, error: "Trop de codes demandés. Réessaie dans une heure." };
  }

  const code = generateCode();
  let waMessageId: string | null = null;
  try {
    if (input.channel === "whatsapp") {
      const { sendOtpTemplate } = await import("./whatsapp/client.server");
      waMessageId = await sendOtpTemplate(input.phone, code);
    } else {
      const { sendSms } = await import("./sms.server");
      await sendSms(
        input.phone,
        `KPB Education : ton code de connexion est ${code}. Il expire dans 10 minutes. Ne le partage avec personne.`,
      );
    }
  } catch (e) {
    console.error(`OTP ${input.channel}`, e);
    return {
      ok: false,
      error:
        input.channel === "whatsapp"
          ? "Envoi WhatsApp impossible. Essaie de recevoir le code par SMS."
          : "Envoi du SMS impossible. Vérifie le numéro et réessaie.",
    };
  }

  // Un nouveau code annule les précédents
  await supabaseAdmin
    .from("otp_codes")
    .update({ consumed_at: new Date().toISOString() })
    .eq("phone_e164", input.phone)
    .is("consumed_at", null);
  const { error } = await supabaseAdmin.from("otp_codes").insert({
    phone_e164: input.phone,
    code_hash: await hashCode(code, input.phone, secret()),
    purpose: input.purpose,
    profile_id: input.profileId ?? null,
    channel: input.channel,
    wa_message_id: waMessageId,
    delivery_status: input.channel === "sms" ? "sent" : "accepted",
    expires_at: new Date(Date.now() + OTP_TTL_MS).toISOString(),
    ip: input.ip,
  });
  if (error) throw new Error(error.message);
  return { ok: true, channel: input.channel };
}

/** Vérifie le dernier code envoyé au numéro. Consommé en cas de succès. */
export async function checkCode(phone: string, code: string, purpose: "login" | "link") {
  const { data: row } = await supabaseAdmin
    .from("otp_codes")
    .select("id, code_hash, attempts, expires_at, profile_id")
    .eq("phone_e164", phone)
    .eq("purpose", purpose)
    .is("consumed_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!row || Date.parse(row.expires_at) < Date.now()) {
    return { ok: false as const, error: "Code expiré. Demande un nouveau code." };
  }
  if (!canVerify(row.attempts)) {
    return { ok: false as const, error: "Trop d'essais. Demande un nouveau code." };
  }
  const expected = await hashCode(code.replace(/\D/g, ""), phone, secret());
  if (!safeEqual(expected, row.code_hash)) {
    await supabaseAdmin
      .from("otp_codes")
      .update({ attempts: row.attempts + 1 })
      .eq("id", row.id);
    return { ok: false as const, error: "Code incorrect." };
  }
  // Consommation conditionnelle : un code ne sert qu'une fois, même en cas de double envoi
  const { data: consumed } = await supabaseAdmin
    .from("otp_codes")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", row.id)
    .is("consumed_at", null)
    .select("id")
    .maybeSingle();
  if (!consumed) return { ok: false as const, error: "Code déjà utilisé." };
  return { ok: true as const, profileId: row.profile_id };
}

export async function latestDeliveryStatus(phone: string) {
  const { data } = await supabaseAdmin
    .from("otp_codes")
    .select("channel, delivery_status, created_at")
    .eq("phone_e164", phone)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}
