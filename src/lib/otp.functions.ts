import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { normalizePhone, syntheticEmail } from "./phone";

const phoneInput = z.object({
  phone: z.string().trim().min(6).max(24),
  country: z.string().length(2).default("NE"),
});

function invalidPhone() {
  return { ok: false as const, error: "Numéro invalide. Vérifie l'indicatif du pays." };
}

/** Envoie un code de connexion (WhatsApp par défaut, SMS en secours). Sans session. */
export const requestOtp = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    phoneInput.extend({ channel: z.enum(["whatsapp", "sms"]).default("whatsapp") }).parse(input),
  )
  .handler(async ({ data }) => {
    const phone = normalizePhone(data.phone, data.country);
    if (!phone) return invalidPhone();
    const { sendCode } = await import("./otp.server");
    const { clientIp } = await import("./request.server");
    const result = await sendCode({
      phone,
      channel: data.channel,
      purpose: "login",
      ip: clientIp(),
    });
    return result.ok ? { ...result, phone } : result;
  });

/** Statut de livraison du dernier code : l'écran passe au SMS si WhatsApp n'a pas livré. */
export const otpDeliveryStatus = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ phone: z.string().max(20) }).parse(input))
  .handler(async ({ data }) => {
    const { latestDeliveryStatus } = await import("./otp.server");
    const row = await latestDeliveryStatus(data.phone);
    return {
      channel: row?.channel ?? null,
      delivered: row ? ["delivered", "read"].includes(row.delivery_status ?? "") : false,
      failed: row?.delivery_status === "failed",
    };
  });

/**
 * Vérifie le code puis prépare l'ouverture de session : le navigateur finit la connexion
 * avec `supabase.auth.verifyOtp({ token_hash, type: "magiclink" })`. Aucun email n'est envoyé.
 */
export const verifyOtp = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ phone: z.string().max(20), code: z.string().trim().min(6).max(8) }).parse(input),
  )
  .handler(async ({ data }) => {
    const phone = normalizePhone(data.phone);
    if (!phone) return invalidPhone();
    const { checkCode } = await import("./otp.server");
    const check = await checkCode(phone, data.code, "login");
    if (!check.ok) return check;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { timezoneForCountry } = await import("./relance/window");
    const { DIAL_CODES } = await import("./phone");

    // Compte déjà relié à ce numéro (créé par WhatsApp ou compte email qui l'a vérifié)
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("auth_user_id")
      .eq("phone_e164", phone)
      .not("phone_verified_at", "is", null)
      .maybeSingle();

    let email: string;
    let created = false;
    if (profile) {
      const { data: user, error } = await supabaseAdmin.auth.admin.getUserById(
        profile.auth_user_id,
      );
      if (error || !user.user?.email) throw new Error("Compte introuvable");
      email = user.user.email;
    } else {
      email = syntheticEmail(phone);
      const { data: user, error } = await supabaseAdmin.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: { phone },
      });
      // Compte technique déjà créé lors d'une tentative précédente : on le réutilise
      if (error && !/already|registered|exists/i.test(error.message))
        throw new Error(error.message);
      created = Boolean(user?.user);
      const country = DIAL_CODES.find((d) => phone.startsWith(`+${d.code}`))?.country;
      const authId =
        user?.user?.id ??
        (
          await supabaseAdmin
            .from("profiles")
            .select("auth_user_id")
            .eq("phone_e164", phone)
            .maybeSingle()
        ).data?.auth_user_id;
      if (authId) {
        await supabaseAdmin
          .from("profiles")
          .update({
            phone,
            phone_e164: phone,
            phone_verified_at: new Date().toISOString(),
            whatsapp_optin: true,
            ...(country ? { residence: country, timezone: timezoneForCountry(country) } : {}),
          })
          .eq("auth_user_id", authId);
      }
    }

    const { data: link, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });
    if (linkError || !link.properties?.hashed_token) {
      throw new Error(linkError?.message ?? "Connexion impossible");
    }
    return { ok: true as const, tokenHash: link.properties.hashed_token, created };
  });

/** Membre connecté : relier un numéro WhatsApp à son compte (étape 1, envoi du code). */
export const linkPhone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    phoneInput.extend({ channel: z.enum(["whatsapp", "sms"]).default("whatsapp") }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const phone = normalizePhone(data.phone, data.country);
    if (!phone) return invalidPhone();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: me } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("auth_user_id", context.userId)
      .single();
    const { data: other } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("phone_e164", phone)
      .neq("id", me!.id)
      .maybeSingle();
    if (other)
      return { ok: false as const, error: "Ce numéro est déjà relié à un autre compte KPB." };
    const { sendCode } = await import("./otp.server");
    const { clientIp } = await import("./request.server");
    const result = await sendCode({
      phone,
      channel: data.channel,
      purpose: "link",
      profileId: me!.id,
      ip: clientIp(),
    });
    return result.ok ? { ...result, phone } : result;
  });

/** Étape 2 : le code confirme que le numéro appartient bien au membre. */
export const confirmLinkPhone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ phone: z.string().max(20), code: z.string().trim().min(6).max(8) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const phone = normalizePhone(data.phone);
    if (!phone) return invalidPhone();
    const { checkCode } = await import("./otp.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: me } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("auth_user_id", context.userId)
      .single();
    const check = await checkCode(phone, data.code, "link");
    if (!check.ok) return check;
    if (check.profileId !== me!.id)
      return { ok: false as const, error: "Code invalide pour ce compte." };
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({
        phone,
        phone_e164: phone,
        phone_verified_at: new Date().toISOString(),
        whatsapp_optin: true,
      })
      .eq("id", me!.id);
    if (error) {
      return { ok: false as const, error: "Ce numéro est déjà relié à un autre compte KPB." };
    }
    return { ok: true as const, phone };
  });
