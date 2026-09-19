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
   * nom), d'où une journée de fraîcheur puis une semaine de
   * `stale-while-revalidate` plutôt qu'un `immutable` : l'image en cache
   * s'affiche tout de suite, et la nouvelle version arrive en arrière-plan.
   */
  async headers() {
    return [
      {
        source: "/assets/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" }],
      },
    ];
  },
};

export default nextConfig;
