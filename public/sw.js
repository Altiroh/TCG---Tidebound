// Service worker de l'app shell Tidebound.
//
// Stratégie volontairement simple, adaptée à une PWA de jeu EN LIGNE :
//  - à l'installation, met en cache la coquille (offline.html + manifest) ;
//  - pour une navigation (requête HTML), réseau d'abord, avec repli sur le
//    cache puis sur `offline.html` si le réseau est indisponible ;
//  - pour les assets statiques (`/assets/`, `/icons/`), cache d'abord, mais
//    rangés sous l'EMPREINTE de leur contenu (`/asset-versions.json`,
//    fabriqué au build par `scripts/assetVersions.mjs`) : un visuel repeint
//    sous le même nom change d'empreinte, et le worker va chercher le
//    nouveau au lieu de resservir l'ancien. Sans empreinte connue (fichier
//    absent du manifeste, dev), la copie est revalidée en arrière-plan une
//    fois vieille d'un jour ;
//  - ne touche jamais aux requêtes vers Supabase ou toute autre origine :
//    l'état de partie ne doit jamais être servi depuis un cache.
//
// MISES À JOUR — ce worker ne prend PAS la main tout seul (`skipWaiting` a
// été retiré de l'installation). Une nouvelle version s'installe, reste en
// attente, et `components/ServiceWorkerRegister.tsx` propose au joueur de
// recharger : couper l'app sous une partie en cours pour changer de version
// serait le pire moment possible. Le client répond en postant
// `{ type: "SKIP_WAITING" }`, et c'est seulement là que la relève a lieu.
// v4 (13/10/2026) : nouveau logo — les icônes gardent leur nom, seul un
// nouveau cache les fait relire aux appareils déjà installés.
// v5 (19/10/2026) : assets rangés par empreinte de contenu — le nouveau
// cache fait aussi oublier aux appareils les visuels périmés qu'ils gardaient.
const CACHE_VERSION = "tidebound-shell-v5";
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

/**
 * EMPREINTES DES ASSETS — `{ "/assets/…": "<empreinte>" }`, relues sur le
 * réseau au plus toutes les `VERSIONS_TTL_MS` (une partie ouverte longtemps
 * voit donc passer un déploiement), gardées en mémoire et dans le cache pour
 * un worker qui se réveille hors ligne.
 */
const VERSIONS_URL = "/asset-versions.json";
const VERSIONS_TTL_MS = 5 * 60 * 1000;
let versions = null;
let versionsAt = 0;
let versionsLoading = null;

function refreshVersions(cache) {
  if (!versionsLoading) {
    versionsLoading = fetch(VERSIONS_URL, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return;
        const fresh = await response.clone().json();
        await cache.put(VERSIONS_URL, response);
        const changed = JSON.stringify(fresh) !== JSON.stringify(versions);
        versions = fresh;
        if (changed) await pruneOutdated(cache);
      })
      .catch(() => undefined)
      .finally(() => {
        versionsAt = Date.now();
        versionsLoading = null;
      });
  }
  return versionsLoading;
}

/** Les empreintes connues : en mémoire, sinon la copie en cache, sinon le réseau (une fois). */
async function assetVersions(cache) {
  if (!versions) {
    const stored = await cache.match(VERSIONS_URL);
    if (stored) versions = await stored.json().catch(() => null);
    if (!versions) await refreshVersions(cache);
  }
  if (Date.now() - versionsAt > VERSIONS_TTL_MS) refreshVersions(cache);
  return versions;
}

/** Clé de cache d'un asset : son chemin et l'empreinte de son contenu. */
function versionedKey(pathname, version) {
  return `${pathname}?tbv=${version}`;
}

/** Retire du cache les copies dont l'empreinte n'est plus la bonne (visuel remplacé ou supprimé). */
async function pruneOutdated(cache) {
  if (!versions) return;
  for (const request of await cache.keys()) {
    const url = new URL(request.url);
    const stored = url.searchParams.get("tbv");
    if (stored && versions[decodeURIComponent(url.pathname)] !== stored) await cache.delete(request);
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    // Une page s'ouvre : les empreintes se relisent pendant qu'elle charge,
    // avant que ses images ne soient demandées.
    event.waitUntil(caches.open(CACHE_VERSION).then(refreshVersions));
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
        // Empreinte connue : la copie rangée sous CETTE empreinte, ou le réseau.
        // Un visuel repeint a une autre empreinte : l'ancienne copie n'est plus servie.
        const version = cacheable ? (await assetVersions(cache))?.[decodeURIComponent(url.pathname)] : undefined;
        if (version) {
          const key = versionedKey(url.pathname, version);
          const hit = await cache.match(key);
          if (hit) return hit;
          const response = await fetch(request, { cache: "no-cache" }).catch(() => undefined);
          if (response?.status === 200) {
            event.waitUntil(cache.put(key, response.clone()).then(() => cache.delete(request)));
            return response;
          }
          // Hors ligne : mieux vaut l'ancienne copie que rien.
          return response ?? (await cache.match(request)) ?? Response.error();
        }

        const cached = await cache.match(request);
        // `no-cache` : le worker a SON cache, qui ne garde que les succès ; il
        // demande donc toujours au serveur plutôt qu'au cache HTTP du
        // navigateur. Celui-ci garde aussi les 404 — l'en-tête `Cache-Control`
        // de `/assets` (next.config.mjs) vaut pour toute réponse —, et une
        // illustration livrée après avoir été demandée y restait introuvable
        // malgré un rechargement (retour du 24/09/2026).
        const refresh = () =>
          fetch(request, { cache: "no-cache" })
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
