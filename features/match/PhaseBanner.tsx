interface PhaseBannerProps {
  /** `null` = rien à afficher. Une nouvelle occurrence (même texte) doit passer une `bannerKey` différente pour rejouer l'animation. */
  text: string | null;
  bannerKey: number | null;
}

/**
 * Bannière plein écran centrée, brève (voir `usePhaseBannerEvent`), pour
 * annoncer clairement un changement de tour/phase — demandé explicitement :
 * l'utilisateur doit voir "Phase de combat" / "Tour de ..." apparaître au
 * milieu de l'écran plutôt que de devoir remarquer un bouton qui change
 * discrètement d'icône. `pointer-events-none` : ne bloque jamais le jeu
 * en dessous.
 */
export function PhaseBanner({ text, bannerKey }: PhaseBannerProps) {
  if (!text) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center">
      <div
        key={bannerKey}
        className="animate-phase-banner rounded-xl border border-board-accent/40 bg-black/75 px-10 py-5 text-center text-2xl font-bold uppercase tracking-widest text-white shadow-2xl backdrop-blur-sm"
      >
        {text}
      </div>
    </div>
  );
}
