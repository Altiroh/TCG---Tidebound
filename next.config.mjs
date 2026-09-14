/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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
