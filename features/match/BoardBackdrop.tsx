/**
 * Toile de fond immersive du plateau (`public/assets/board/board.png`),
 * fixée au viewport derrière tout le contenu (voir l'usage dans
 * `MatchBoard.tsx`/`OnlineBoard.tsx` : le contenu passe en `relative z-10`
 * pour rester au-dessus).
 *
 * Rendue via une vraie balise `<img>` (`object-fit: cover`) plutôt qu'un
 * `background-image` CSS : ce dernier restait invisible en pratique ici —
 * peint plat malgré un DOM/CSS strictement correct (position, z-index,
 * absence de tout `transform`/`filter`/`opacity` parasite, tous vérifiés).
 * La piste la plus probable est un bug de repaint de Chromium headless
 * quand le chargement de l'image se termine APRÈS le premier paint de
 * l'élément : un `background-image` chargé en asynchrone n'y déclenchait
 * pas toujours de repaint fiable, alors qu'un `<img>` déclenche toujours
 * son propre paint à l'événement `load` — ce qui a résolu le problème de
 * façon reproductible.
 */
export function BoardBackdrop({ variant = "fixed" }: { variant?: "fixed" | "absolute" }) {
  return (
    <div aria-hidden className={`${variant === "fixed" ? "fixed" : "absolute"} inset-0 overflow-hidden`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- calque de fond plein écran, jamais responsive au sens Next/Image */}
      <img src="/assets/board/board.png" alt="" draggable={false} className="h-full w-full select-none object-cover" />
      <div
        className="absolute inset-0"
        style={{
          background:
            variant === "fixed"
              ? "linear-gradient(180deg, rgba(6,10,18,0.55), rgba(6,10,18,0.82))"
              : "linear-gradient(180deg, rgba(6,10,18,0.15), rgba(6,10,18,0.3))",
        }}
      />
    </div>
  );
}
