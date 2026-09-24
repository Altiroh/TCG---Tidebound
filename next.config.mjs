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
      {
        source: "/assets/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=300, stale-while-revalidate=604800" }],
      },
    ];
  },
};

export default nextConfig;
