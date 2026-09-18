"use client";

import { useState } from "react";
import { getCardDefinition } from "@/game";
import { RARITY_ORDER } from "@/game/boosters";
import { CARD_RARITY_LABELS, CARD_TYPE_LABELS } from "@/features/match/cardDisplay";
import { cardIllustrationUrl } from "@/features/decks/nameplateArt";
import { CardDetailModal } from "@/features/collection/card-detail/CardDetailModal";
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
 *
 * Chaque ligne s'ouvre en fiche : vérifier ce qu'on a reçu, c'est aussi
 * vouloir regarder la carte — au clic comme au doigt.
 */
export function BoosterBatchRecap({ packs, lines, onClose }: BoosterBatchRecapProps) {
  /** Carte dont on lit la fiche, par-dessus la liste qui reste en place. */
  const [detailCardId, setDetailCardId] = useState<string | null>(null);
  const total = lines.reduce((sum, line) => sum + line.count, 0);
  const newCount = lines.filter((line) => line.isNew).length;
  const rank = (line: BoosterBatchLine) => RARITY_ORDER.indexOf(line.rarity);
  const sorted = [...lines].sort((a, b) => {
    if (a.isNew !== b.isNew) return a.isNew ? -1 : 1;
    if (rank(a) !== rank(b)) return rank(b) - rank(a);
    return getCardDefinition(a.cardId).name.localeCompare(getCardDefinition(b.cardId).name, "fr");
  });

  /**
   * Échap ferme la FICHE avant la liste : les deux écoutent la fenêtre, et
   * c'est la dernière ouverte qui doit partir en premier.
   */
  function handleDialogClose() {
    if (detailCardId === null) onClose();
  }

  return (
    <>
      <Dialog
        title={`${packs} boosters ouverts`}
        description={
          <>
            <b>{total}</b> carte{total > 1 ? "s" : ""} récupérée{total > 1 ? "s" : ""}, dont <b>{newCount}</b> nouvelle
            {newCount > 1 ? "s" : ""} pour la collection. Touche une ligne pour voir la carte.
          </>
        }
        onClose={handleDialogClose}
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
              <li
                key={line.cardId}
                className={styles.line}
                data-new={line.isNew || undefined}
                role="button"
                tabIndex={0}
                aria-label={`${def.name} — voir sa fiche`}
                onClick={() => setDetailCardId(line.cardId)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" && event.key !== " ") return;
                  event.preventDefault();
                  setDetailCardId(line.cardId);
                }}
              >
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

      {detailCardId && <CardDetailModal cardId={detailCardId} onClose={() => setDetailCardId(null)} />}
    </>
  );
}
