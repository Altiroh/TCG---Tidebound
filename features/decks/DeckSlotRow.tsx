"use client";

import { getCardDefinition } from "@/game";
import styles from "@/features/decks/DeckScreens.module.css";
import { useImageOk } from "@/features/match/useImageOk";

interface DeckSlotRowProps {
  index: number;
  cardId: string;
  onRemove: () => void;
}

/**
 * Une ligne du manifeste : numéro, vignette, nom, coût — clic = retire cet
 * exemplaire. Aucune surface au repos, juste un filet d'encre très pâle
 * sous chaque ligne (un registre, pas une liste de composants) ; le survol
 * annonce le retrait en encre rouge délavée.
 *
 * Pour une Abyssale, le calque de débord est superposé à l'illustration de
 * base, même principe que `CardTile` en plus simple : les deux images
 * empilées plein cadre, sans zones calées sur un cadre.
 */
export function DeckSlotRow({ index, cardId, onRemove }: DeckSlotRowProps) {
  const def = getCardDefinition(cardId);
  const isAbyssal = def.subtype === "abyssal";
  const debordUrl = `/assets/cards/illustrations/${cardId}-debord.webp`;
  const debordOk = useImageOk(isAbyssal ? debordUrl : "");

  return (
    <button type="button" onClick={onRemove} title="Retirer cet exemplaire" className={styles.slotRow}>
      <span className={styles.slotIndex}>{index}</span>

      <span className={styles.slotThumb}>
        {/* eslint-disable-next-line @next/next/no-img-element -- vignette de liste, pas une CardTile complète */}
        <img src={`/assets/cards/illustrations/${cardId}.webp`} alt="" loading="lazy" decoding="async" />
        {isAbyssal && debordOk && (
          // eslint-disable-next-line @next/next/no-img-element -- calque de débord Abyssal, cf. CardTile
          <img src={debordUrl} alt="" className={styles.slotThumbDebord} loading="lazy" decoding="async" />
        )}
      </span>

      <span className={styles.slotName}>{def.name}</span>
      <span className={styles.slotCost} title="Raison">
        {def.cost}
      </span>
      <svg viewBox="0 0 24 24" fill="none" className={styles.slotRemove} aria-hidden>
        <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
      </svg>
    </button>
  );
}
