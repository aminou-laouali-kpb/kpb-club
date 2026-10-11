/**
 * En-têtes de sécurité ajoutés à chaque réponse (spec §20).
 *
 * `script-src` garde 'unsafe-inline' : l'hydratation de TanStack Start injecte des
 * scripts en ligne sans nonce. Tout le reste est fermé : pas de script tiers, pas
 * d'objet, connexions limitées à Supabase (et PostHog s'il est activé).
 * L'application reste affichable dans l'éditeur Lovable (frame-ancestors).
 */
export type CspOptions = {
  supabaseUrl?: string | null;
  posthogHost?: string | null;
};

function origin(url?: string | null) {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

export function buildCsp(opts: CspOptions = {}) {
  const supabase = origin(opts.supabaseUrl);
  const supabaseHttp = supabase ?? "https://*.supabase.co";
  const supabaseWs = supabase ? supabase.replace(/^http/, "ws") : "wss://*.supabase.co";
  const posthog = origin(opts.posthogHost);

  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'", "'unsafe-inline'"],
    "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
    "font-src": ["'self'", "data:", "https://fonts.gstatic.com"],
    "img-src": ["'self'", "data:", "blob:", supabaseHttp],
    "media-src": ["'self'", "blob:"],
    "connect-src": ["'self'", supabaseHttp, supabaseWs, ...(posthog ? [posthog] : [])],
    "frame-src": ["'self'", "https://oauth.lovable.app", "https://lovable.dev"],
    "worker-src": ["'self'"],
    "manifest-src": ["'self'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": [
      "'self'",
      "https://lovable.dev",
      "https://*.lovable.dev",
      "https://*.lovable.app",
    ],
  };
  return [
    ...Object.entries(directives).map(([k, v]) => `${k} ${v.join(" ")}`),
    "upgrade-insecure-requests",
  ].join("; ");
}

export function securityHeaders(opts: CspOptions = {}): Record<string, string> {
  return {
    "Content-Security-Policy": buildCsp(opts),
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    // Micro pour la dictée, caméra pour la photo de documents
    "Permissions-Policy": "camera=(self), microphone=(self), geolocation=(), payment=()",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  };
}

/** Copie la réponse en y ajoutant les en-têtes (sans écraser ceux déjà posés). */
export function withSecurityHeaders(response: Response, opts: CspOptions = {}): Response {
  const headers = new Headers(response.headers);
  const isHtml = (headers.get("content-type") ?? "").includes("text/html");
  for (const [key, value] of Object.entries(securityHeaders(opts))) {
    if (key === "Content-Security-Policy" && !isHtml) continue;
    if (!headers.has(key)) headers.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
