import type { TideStateName } from "@/game";
import styles from "@/features/board-preview/BoardPreview.module.css";

/** Mer et ciel propres à chaque état de Marée (1672×941, même cadrage). */
const TIDE_BACKGROUNDS: Record<TideStateName, string> = {
  calme: "/assets/board/tide-states/calme.webp",
  houle: "/assets/board/tide-states/houle.webp",
  tempete: "/assets/board/tide-states/tempete.webp",
  abysses: "/assets/board/tide-states/abysses.webp",
};

/**
 * Pont du navire, découpé dans l'ancien fond et fondu vers le haut (alpha
 * progressif au niveau du bastingage). Même format et même cadrage que les
 * fonds de Marée : posé par-dessus avec le même `object-fit`, il tombe
 * exactement au même endroit quel que soit le format d'écran.
 */
const DECK_SRC = "/assets/board/board-deck.webp";

/**
 * Décor de la scène : la mer de l'état de Marée courant, et le pont devant.
 * Les quatre mers sont montées en permanence et se relaient en fondu
 * enchaîné au changement d'état — pas de chargement ni de flash à ce
 * moment-là. Recadré en `object-fit: cover` selon le format d'écran SANS
 * jamais déplacer le gameplay, qui vit dans un calque séparé au-dessus.
 *
 * De vraies balises `<img>` plutôt qu'un `background-image` : même raison
 * que `BoardBackdrop` (repaint peu fiable d'un fond CSS chargé tard).
 */
export function BackgroundLayer({ tideState }: { tideState: TideStateName }) {
  return (
    <div aria-hidden className={styles.background}>
      {(Object.keys(TIDE_BACKGROUNDS) as TideStateName[]).map((state) => (
        // eslint-disable-next-line @next/next/no-img-element -- décor plein écran, jamais responsive au sens Next/Image
        <img
          key={state}
          src={TIDE_BACKGROUNDS[state]}
          alt=""
          draggable={false}
          className={`${styles.backgroundImage} ${styles.backgroundTide} ${state === tideState ? styles.backgroundTideActive : ""}`}
        />
      ))}
      {/* eslint-disable-next-line @next/next/no-img-element -- idem */}
      <img src={DECK_SRC} alt="" draggable={false} className={styles.backgroundImage} />
      <div className={styles.backgroundVeil} />
    </div>
  );
}
