import type { ReactNode } from "react";
import styles from "@/features/match/table/Table.module.css";

interface PontLandeSlotProps {
  /** La carte de la Lande en jeu ; absente, l'emplacement est vide. */
  card?: ReactNode;
  /** Tours de table qui restent à la Lande. */
  turns?: number | null;
  /** Pendant qu'on pose une carte de Lande : l'emplacement s'allume (`ready`), et plus fort survolé (`over`). */
  dropState?: "idle" | "ready" | "over";
}

/**
 * L'EMPLACEMENT DE LANDE du Pont du Capitaine, entre les deux navires : une
 * planche à rose des vents tant qu'aucune Lande n'est en jeu, sa carte
 * sinon — elle s'y abat en arrivant — avec ses tours restants au milieu,
 * comme le décompte d'un hublot de Marée. C'est aussi la cible où l'on lâche
 * une carte de Lande (`data-drop="lande"`).
 */
export function PontLandeSlot({ card, turns, dropState = "idle" }: PontLandeSlotProps) {
  return (
    <div
      className={`${styles.pontLandeSlot} ${card ? styles.pontLandeSlotFilled : ""}`}
      data-drop="lande"
      data-drop-state={dropState}
      aria-label={card ? undefined : "Emplacement de Lande, vide"}
    >
      {card}
      {card && turns != null && (
        <span className={styles.pontLandeTurns} aria-label={`${turns} tour${turns > 1 ? "s" : ""} de table restant${turns > 1 ? "s" : ""}`}>
          <span className={styles.pontLandeTurnsCount}>{turns}</span>
          <span className={styles.pontLandeTurnsLabel}>{turns > 1 ? "tours" : "tour"}</span>
        </span>
      )}
    </div>
  );
}
