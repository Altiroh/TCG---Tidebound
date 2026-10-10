interface PhaseBannerProps {
  /** `null` = rien à afficher. Une nouvelle occurrence (même texte) doit passer une `bannerKey` différente pour rejouer l'animation. */
  text: string | null;
  bannerKey: number | null;
}

/** Bannière peinte (parchemin, sceau, sabres croisés — lot du 10/10/2026), sans texte : le jeu écrit par-dessus. */
const BANNER_SRC = "/assets/ui/bandeaux/banniere-tour.webp";
const BANNER_RATIO = 1945 / 809;

/**
 * Bannière plein écran centrée, brève (voir `usePhaseBannerEvent`), pour
 * annoncer clairement un changement de tour/phase — demandé explicitement :
 * l'utilisateur doit voir "Phase de combat" / "Tour de ..." apparaître au
 * milieu de l'écran plutôt que de devoir remarquer un bouton qui change
 * discrètement d'icône. `pointer-events-none` : ne bloque jamais le jeu
 * en dessous.
 *
 * Le texte est posé au milieu du parchemin, sur un bandeau d'ombre qui le
 * détache des sabres croisés peints derrière lui.
 */
export function PhaseBanner({ text, bannerKey }: PhaseBannerProps) {
  if (!text) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center">
      <div
        key={bannerKey}
        className="animate-phase-banner relative"
        style={{ width: "min(640px, 78vw)", aspectRatio: String(BANNER_RATIO), filter: "drop-shadow(0 18px 24px rgba(0,0,0,0.55))" }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- décor peint, posé tel quel sous le texte */}
        <img src={BANNER_SRC} alt="" aria-hidden draggable={false} className="absolute inset-0 h-full w-full select-none object-contain" />
        <div className="absolute inset-x-[12%] top-1/2 flex -translate-y-1/2 justify-center">
          <span
            className="whitespace-nowrap px-6 py-1 text-center font-bold uppercase"
            style={{
              fontFamily: "var(--font-card-title), Georgia, serif",
              fontSize: "clamp(18px, 3.6vw, 34px)",
              letterSpacing: "0.12em",
              color: "#fff7e6",
              background: "radial-gradient(ellipse at center, rgba(20,12,4,0.78) 0%, rgba(20,12,4,0.55) 55%, rgba(20,12,4,0) 78%)",
              textShadow: "0 0 6px rgba(0,0,0,1), 0 2px 4px rgba(0,0,0,0.9), 0 0 14px rgba(120,53,15,0.8)",
            }}
          >
            {text}
          </span>
        </div>
      </div>
    </div>
  );
}
