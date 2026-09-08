/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // `typedRoutes` désactivé : nécessite que `.next/types` soit régénéré par
  // `next dev`/`next build`, ce que notre script `typecheck` (tsc --noEmit
  // seul) ne fait pas — source de faux positifs sur des routes valides.
};

export default nextConfig;
