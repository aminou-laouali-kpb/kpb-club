import { getRequest } from "@tanstack/react-start/server";

/** Adresse IP du client (Cloudflare), pour les limites anti-abus. */
export function clientIp() {
  const headers = getRequest().headers;
  return (
    headers.get("cf-connecting-ip") ?? headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null
  );
}
