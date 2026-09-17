// Service worker de l'app shell Tidebound.
//
// Stratégie volontairement simple, adaptée à une PWA de jeu EN LIGNE :
//  - à l'installation, met en cache la coquille (offline.html + manifest) ;
//  - pour une navigation (requête HTML), réseau d'abord, avec repli sur le
//    cache puis sur `offline.html` si le réseau est indisponible ;
//  - pour les assets statiques (`/assets/`, `/icons/`), cache d'abord ; la
//    copie n'est revalidée en arrière-plan qu'une fois vieille d'un jour ;
//  - ne touche jamais aux requêtes vers Supabase ou toute autre origine :
//    l'état de partie ne doit jamais être servi depuis un cache.
//
// MISES À JOUR — ce worker ne prend PAS la main tout seul (`skipWaiting` a
// été retiré de l'installation). Une nouvelle version s'installe, reste en
// attente, et `components/ServiceWorkerRegister.tsx` propose au joueur de
// recharger : couper l'app sous une partie en cours pour changer de version
// serait le pire moment possible. Le client répond en postant
// `{ type: "SKIP_WAITING" }`, et c'est seulement là que la relève a lieu.
const CACHE_VERSION = "tidebound-shell-v2";
const APP_SHELL_URLS = ["/offline.html", "/manifest.webmanifest"];

/** Préfixes servis depuis le cache (assets versionnés par leur contenu ou remplacés sous le même nom). */
const CACHED_PREFIXES = ["/assets/", "/icons/"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL_URLS)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

// Relève demandée par le client (bouton « Recharger » du bandeau de mise à
// jour) : le worker en attente devient actif, et la page se recharge sur
// `controllerchange`.
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(
        () => caches.match(request).then((cached) => cached ?? caches.match("/offline.html"))
      )
    );
    return;
  }

  const cacheable = CACHED_PREFIXES.some((prefix) => url.pathname.startsWith(prefix));
  if (cacheable || url.pathname === "/manifest.webmanifest") {
    event.respondWith(
      caches.open(CACHE_VERSION).then(async (cache) => {
        const cached = await cache.match(request);
        const refresh = () =>
          fetch(request)
            .then((response) => {
              // 200 uniquement : une réponse partielle (206, lecture d'un son
              // par plages) ne peut pas être mise en cache.
              if (response.status === 200) cache.put(request, response.clone());
              return response;
            })
            .catch(() => undefined);

        if (!cached) return (await refresh()) ?? Response.error();

        // En cache : servi tout de suite. On ne revalide en arrière-plan que
        // si la copie a plus d'un jour — auparavant, CHAQUE affichage d'une
        // image relançait aussi sa requête réseau, pour rien.
        if (isStale(cached)) event.waitUntil(refresh());
        return cached;
      })
    );
  }
});

/** Copie en cache de plus de `ASSET_MAX_AGE_MS` (d'après son en-tête `Date`), ou non datée. */
const ASSET_MAX_AGE_MS = 24 * 60 * 60 * 1000;
function isStale(response) {
  const date = Date.parse(response.headers.get("date") ?? "");
  return Number.isNaN(date) || Date.now() - date > ASSET_MAX_AGE_MS;
}
