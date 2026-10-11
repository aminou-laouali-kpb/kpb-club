import { getRequest } from "@tanstack/react-start/server";

/** URL publique du site : APP_URL si défini, sinon l'origine de la requête en cours. */
export function appOrigin() {
  const configured = process.env["APP_URL"];
  if (configured) return configured.replace(/\/$/, "");
  return new URL(getRequest().url).origin;
}
