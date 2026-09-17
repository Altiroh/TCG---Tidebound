import type { CSSProperties } from "react";
import type { PlayerId } from "@/game";
import styles from "@/features/match/table/Table.module.css";
import { useCardBackSrcFor } from "@/features/cosmetics/MatchCosmeticsProvider";

interface PreviewOpponentHandProps {
  count: number;
  /** Clés `opp-hand-<index>` des cartes encore en vol depuis la pioche (masquées). */
  hidden?: ReadonlySet<string>;
  /** Propriétaire de la main : c'est SON dos de carte qui s'affiche, pas celui du joueur local. Absent (labo) : le dos local. */
  ownerId?: PlayerId;
}

/**
 * Main adverse : dos de cartes, jamais interactifs, en éventail inversé qui
 * dépasse du bord HAUT de l'écran (emplacement de `OpponentHandFan` sur
 * l'ancien board). Reflet exact de `TableHand` : même variables d'arc,
 * rotation de sens opposé, seule la partie basse des cartes est visible.
 */
export function TableOpponentHand({ count, hidden, ownerId }: PreviewOpponentHandProps) {
  const cardBack = useCardBackSrcFor(ownerId);
  const center = (count - 1) / 2;

  return (
    <div className={styles.opponentHand} data-zone="OpponentHand" aria-label={`Main adverse : ${count} cartes`}>
      <div className={styles.opponentHandRow}>
        {Array.from({ length: count }, (_, index) => (
          <div
            key={index}
            className={styles.opponentHandSlot}
            style={{ zIndex: index + 1, "--fan-offset": index - center, "--fan-dist": Math.abs(index - center) } as CSSProperties}
          >
            <div
              className={`${styles.cardBack} ${hidden?.has(`opp-hand-${index}`) ? styles.motionHidden : ""}`}
              data-opp-hand-index={index}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- dos de carte standard */}
              <img src={cardBack} alt="" aria-hidden draggable={false} className={styles.fillCover} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
