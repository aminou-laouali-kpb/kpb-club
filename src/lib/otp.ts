/** Codes de connexion à usage unique. */

export const OTP_TTL_MS = 10 * 60_000;
export const OTP_MAX_SENDS_PER_HOUR = 5;
export const OTP_MAX_ATTEMPTS = 5;
export const SMS_FALLBACK_AFTER_MS = 20_000;

/** 6 chiffres tirés sans biais (rejet des valeurs au-delà du dernier multiple de 10⁶). */
export function generateCode(): string {
  const limit = Math.floor(0xffffffff / 1_000_000) * 1_000_000;
  const buf = new Uint32Array(1);
  do crypto.getRandomValues(buf);
  while ((buf[0] ?? 0) >= limit);
  return String((buf[0] ?? 0) % 1_000_000).padStart(6, "0");
}

export async function hashCode(code: string, phone: string, secret: string) {
  const data = new TextEncoder().encode(`${secret}:${phone}:${code}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function canSend(sendsInLastHour: number) {
  return sendsInLastHour < OTP_MAX_SENDS_PER_HOUR;
}

export function canVerify(attempts: number) {
  return attempts < OTP_MAX_ATTEMPTS;
}

/** Comparaison à temps constant de deux empreintes hexadécimales. */
export function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
