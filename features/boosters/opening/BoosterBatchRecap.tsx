"use client";

import { getCardDefinition } from "@/game";
import { RARITY_ORDER } from "@/game/boosters";
import { CARD_RARITY_LABELS, CARD_TYPE_LABELS } from "@/features/match/cardDisplay";
import { cardIllustrationUrl } from "@/features/decks/nameplateArt";
import { Dialog } from "@/features/shell/Dialog";
import game from "@/features/shell/GameScreen.module.css";
import styles from "@/features/boosters/opening/BoosterBatch.module.css";
import type { BoosterOpeningCard } from "@/features/boosters/opening/types";

export interface BoosterBatchLine {
  cardId: string;
  /** Exemplaires obtenus dans le lot, doublons compris. */
  count: number;
  /** Au moins un exemplaire complétait la collection. */
  isNew: boolean;
  rarity: BoosterOpeningCard["rarity"];
}

interface BoosterBatchRecapProps {
  packs: number;
  lines: readonly BoosterBatchLine[];
  onClose: () => void;
}

/**
 * Toutes les cartes d'un lot, EN LISTE (retour de test du 17/09) : une
 * ligne par carte, nom, type, rareté et nombre d'exemplaires alignés en
 * colonnes.
 *
 * Une mosaïque de vignettes est faite pour parcourir un contenu qu'on
 * découvre ; ici le joueur vérifie ce qu'il a reçu, donc il lit — et une
 * liste se lit, se compte et se scanne verticalement. Les nouveautés
 * passent en tête, c'est ce qu'on vient vérifier en premier.
 */
export function BoosterBatchRecap({ packs, lines, onClose }: BoosterBatchRecapProps) {
  const total = lines.reduce((sum, line) => sum + line.count, 0);
  const newCount = lines.filter((line) => line.isNew).length;
  const rank = (line: BoosterBatchLine) => RARITY_ORDER.indexOf(line.rarity);
  const sorted = [...lines].sort((a, b) => {
    if (a.isNew !== b.isNew) return a.isNew ? -1 : 1;
    if (rank(a) !== rank(b)) return rank(b) - rank(a);
    return getCardDefinition(a.cardId).name.localeCompare(getCardDefinition(b.cardId).name, "fr");
  });

  return (
    <Dialog
      title={`${packs} boosters ouverts`}
      description={
        <>
          <b>{total}</b> carte{total > 1 ? "s" : ""} récupérée{total > 1 ? "s" : ""}, dont <b>{newCount}</b> nouvelle
          {newCount > 1 ? "s" : ""} pour la collection.
        </>
      }
      onClose={onClose}
      width={620}
      actions={
        <button type="button" className={game.primary} onClick={onClose}>
          Fermer
        </button>
      }
    >
      <ul className={styles.list}>
        {sorted.map((line) => {
          const def = getCardDefinition(line.cardId);
          return (
            <li key={line.cardId} className={styles.line} data-new={line.isNew || undefined}>
              <span
                className={styles.lineArt}
                style={{ backgroundImage: `url("${cardIllustrationUrl(line.cardId)}")` }}
                aria-hidden
              />
              <span className={styles.lineName}>
                {def.name}
                {line.isNew && <span className={styles.lineNew}>Nouveau</span>}
              </span>
              <span className={styles.lineType}>{CARD_TYPE_LABELS[def.type]}</span>
              <span className={styles.lineRarity} data-rarity={line.rarity}>
                {CARD_RARITY_LABELS[line.rarity]}
              </span>
              <span className={styles.lineCount}>×{line.count}</span>
            </li>
          );
        })}
      </ul>
    </Dialog>
  );
}
