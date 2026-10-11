import { safeEqual } from "../otp";

/** Vérifie l'en-tête `X-Hub-Signature-256` de Meta (HMAC-SHA256 du corps brut). */
export async function verifyMetaSignature(
  rawBody: string,
  header: string | null,
  appSecret: string,
) {
  if (!header?.startsWith("sha256=")) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const expected = Array.from(new Uint8Array(mac), (b) => b.toString(16).padStart(2, "0")).join("");
  return safeEqual(expected, header.slice(7).toLowerCase());
}
