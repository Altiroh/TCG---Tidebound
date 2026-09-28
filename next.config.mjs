import { createRequire } from "node:module";

const { version } = createRequire(import.meta.url)("./package.json");

/**
 * LA VERSION, figée à la construction.
 *
 * Lue une fois ici plutôt qu'importée depuis `package.json` dans un
 * composant : un `import` du manifeste embarquerait tout le fichier —
 * dépendances et scripts compris — dans le bundle client, pour en afficher
 * un champ.
 *
 * Le commit vient de Vercel (`VERCEL_GIT_COMMIT_SHA`), et n'existe donc
 * qu'en déploiement : en local il n'y a que la version, et c'est très bien
 * — ce numéro sert à savoir CE QUI TOURNE quand un joueur signale quelque
 * chose, pas à dater une session de développement.
 */
const commit = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "";

const isDev = process.env.NODE_ENV !== "production";

/**
 * Origine Supabase autorisée par la CSP (REST, Auth, Realtime). Celle du
 * projet si elle est connue à la construction, sinon tout `*.supabase.co`.
 */
function supabaseOrigins() {
  try {
    const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
    return [url.origin, `wss://${url.host}`];
  } catch {
    return ["https://*.supabase.co", "wss://*.supabase.co"];
  }
}

/**
 * EN-TÊTES DE SÉCURITÉ, sur toutes les réponses (audit du 28/09/2026).
 *
 *   - `frame-ancestors 'none'` / `X-Frame-Options` : le site ne s'affiche
 *     dans le cadre d'aucun autre. Sans eux, une page tierce pouvait poser
 *     l'appli sous un faux bouton et faire cliquer « acheter », « revendre »
 *     ou « tout réclamer » à son insu (clickjacking).
 *   - CSP : tout vient du site lui-même (polices `next/font` auto-hébergées,
 *     images et sons de `public/`), plus Supabase pour les données.
 *     `'unsafe-inline'` reste nécessaire aux scripts d'hydratation de Next 14
 *     sans nonce, et aux styles en ligne ; `'unsafe-eval'` et `ws:` ne
 *     servent qu'au rechargement à chaud du développement.
 */
function securityHeaders() {
  const connect = ["'self'", ...supabaseOrigins(), ...(isDev ? ["ws:"] : [])];
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "media-src 'self' data: blob:",
    `connect-src ${connect.join(" ")}`,
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");

  return [
    { key: "Content-Security-Policy", value: csp },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  ];
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_APP_VERSION: version,
    NEXT_PUBLIC_APP_COMMIT: commit,
  },
  // `typedRoutes` désactivé : nécessite que `.next/types` soit régénéré par
  // `next dev`/`next build`, ce que notre script `typecheck` (tsc --noEmit
  // seul) ne fait pas — source de faux positifs sur des routes valides.

  /**
   * Cache HTTP des fichiers de `public/assets`. Par défaut, Vercel les sert
   * en `max-age=0, must-revalidate` : chaque visite revérifiait chaque
   * image. Les noms ne sont PAS versionnés (un visuel remplacé garde son
   * nom), d'où un `stale-while-revalidate` d'une semaine plutôt qu'un
   * `immutable` : l'image en cache s'affiche tout de suite, et la nouvelle
   * version arrive en arrière-plan.
   *
   * CINQ MINUTES de fraîcheur, et non plus une journée (24/09/2026). Cet
   * en-tête vaut pour TOUTE réponse sous `/assets`, 404 compris — Next ne
   * sait pas le conditionner au statut. Une illustration demandée avant
   * d'être déployée restait donc introuvable un jour entier dans le
   * navigateur de chaque joueur, rechargement ordinaire ou non. Le
   * service worker garde de toute façon les images réussies dans son
   * propre cache (`public/sw.js`) : la fraîcheur HTTP ne sert plus qu'aux
   * pages qu'il ne contrôle pas encore.
   */
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders() },
      {
        source: "/assets/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=300, stale-while-revalidate=604800" }],
      },
    ];
  },
};

export default nextConfig;
