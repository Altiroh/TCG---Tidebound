"use client";

import { useMemo, useState } from "react";
import { getCardDefinition } from "@/game";
import { nameplateArtUrl, plateArtUrl } from "@/features/decks/nameplateArt";
import styles from "@/features/decks/DeckBuilder.module.css";
import { playButtonClick } from "@/lib/sound";

interface DeckNamePlateProps {
  name: string;
  onNameChange: (name: string) => void;
  shipId: string;
  /** Contenu du deck — sert d'illustration par défaut, et de choix possibles. */
  cardIds: readonly string[];
  /** Carte choisie explicitement, ou `null` pour laisser le deck décider. */
  artCardId: string | null;
  onPickArt: () => void;
}

/** Variantes présentes dans le deck — un deck vide se lit « Standard ». */
function deckVariants(cardIds: readonly string[]): { standard: boolean; abyssal: boolean } {
  let standard = false;
  let abyssal = false;
  for (const cardId of new Set(cardIds)) {
    try {
      if (getCardDefinition(cardId).subtype === "abyssal") abyssal = true;
      else standard = true;
    } catch {
      // Carte retirée du catalogue : elle ne dit rien de la variante.
    }
  }
  return { standard: standard || !abyssal, abyssal };
}

/**
 * ENCART D'IDENTITÉ du deck, en tête du panneau de droite : l'illustration
 * à gauche, le nom et son crayon à droite, les variantes du deck en
 * dessous. Compact, bleu nuit et liseré cyan.
 *
 * Le nombre de cartes n'y figure PAS : la jauge juste en dessous le porte
 * déjà. Toucher l'illustration ouvre le choix d'illustration ; le crayon
 * passe le nom en édition (Entrée ou sortie du champ pour valider, Échap
 * pour annuler).
 */
export function DeckNamePlate({ name, onNameChange, shipId, cardIds, artCardId, onPickArt }: DeckNamePlateProps) {
  const artUrl = artCardId ? plateArtUrl(artCardId, shipId) : nameplateArtUrl(cardIds, shipId);
  const variants = useMemo(() => deckVariants(cardIds), [cardIds]);
  const [editing, setEditing] = useState(false);
  const [before, setBefore] = useState(name);

  return (
    <div className={styles.idCard}>
      <button
        type="button"
        className={styles.idArt}
        style={artUrl ? { backgroundImage: `url("${artUrl}")` } : undefined}
        onClick={() => {
          playButtonClick();
          onPickArt();
        }}
        title="Choisir l'illustration du deck"
        aria-label="Choisir l'illustration du deck"
      />

      <div className={styles.idBody}>
        <div className={styles.idNameRow}>
          {editing ? (
            <input
              value={name}
              onChange={(event) => onNameChange(event.target.value)}
              onBlur={() => setEditing(false)}
              onKeyDown={(event) => {
                if (event.key === "Enter") setEditing(false);
                if (event.key === "Escape") {
                  event.stopPropagation();
                  onNameChange(before);
                  setEditing(false);
                }
              }}
              placeholder="Nom du deck"
              aria-label="Nom du deck"
              className={styles.idNameInput}
              maxLength={60}
              autoFocus
            />
          ) : (
            <>
              <span className={styles.idName} title={name || "Deck sans nom"}>
                {name || "Deck sans nom"}
              </span>
              <button
                type="button"
                className={styles.idPencil}
                onClick={() => {
                  playButtonClick();
                  setBefore(name);
                  setEditing(true);
                }}
                title="Renommer le deck"
                aria-label="Renommer le deck"
              >
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" aria-hidden>
                  <path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17v3z" stroke="currentColor" strokeWidth={1.9} strokeLinejoin="round" />
                </svg>
              </button>
            </>
          )}
        </div>

        <div className={styles.idBadges}>
          {variants.standard && <span className={styles.badgeStandard}>Standard</span>}
          {variants.abyssal && <span className={styles.badgeAbyssal}>Abyssal</span>}
        </div>
      </div>
    </div>
  );
}
