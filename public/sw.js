/*
 * Service worker KPB : l'application s'ouvre et se lit sans réseau.
 * - Fichiers de l'application (/assets/*, versionnés) : cache d'abord.
 * - Pages : réseau d'abord, copie en cache en secours.
 * - API, fonctions serveur et webhooks : jamais mis en cache (données fraîches et privées).
 */
const VERSION = "kpb-v1";
const SHELL = ["/", "/dashboard", "/manifest.webmanifest", "/icon-192.png", "/favicon.ico"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => Promise.all(SHELL.map((url) => cache.add(url).catch(() => undefined))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

/** Un navigateur refuse une réponse « redirigée » servie à une navigation : on la recopie. */
function clean(response) {
  if (!response || !response.redirected) return response;
  return new Response(response.body, { status: response.status, headers: response.headers });
}

function neverCache(url) {
  return (
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/_serverFn") ||
    url.pathname.startsWith("/_server")
  );
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (neverCache(url)) return;

  // Fichiers versionnés : le contenu ne change jamais pour une même URL
  if (url.pathname.startsWith("/assets/") || /\.(png|ico|svg|woff2?)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(VERSION).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
    return;
  }

  // Pages : réseau d'abord, puis la copie de la page, puis l'accueil de l'espace membre
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(VERSION).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(async () => {
          const cache = await caches.open(VERSION);
          return (
            clean(await cache.match(request)) ||
            clean(await cache.match("/dashboard")) ||
            clean(await cache.match("/")) ||
            new Response("Hors ligne", {
              status: 503,
              headers: { "Content-Type": "text/plain; charset=utf-8" },
            })
          );
        }),
    );
  }
});
