"use client";

import { useEffect, useState, type ReactNode } from "react";
import { RULES } from "@/game";
import { CARD_TYPE_LABELS } from "@/features/match/cardDisplay";
import {
  CURVE_BUCKETS,
  CURVE_OVERFLOW,
  costCurve,
  deckSizeStatus,
  groupDeck,
  typeBreakdown,
} from "@/features/decks/deckComposition";
import styles from "@/features/decks/DeckBuilder.module.css";
import game from "@/features/shell/GameScreen.module.css";
import { playButtonClick } from "@/lib/sound";

const DRAG_MIME = "text/tidebound-card-id";

interface DeckListPanelProps {
  cardIds: string[];
  /** Plaque du nom du deck, posée en tête de ce panneau — juste au-dessus de la liste qu'elle nomme. */
  namePlate?: ReactNode;
  onRemove: (cardId: string) => void;
  onAdd: (cardId: string) => void;
  onShowCard: (cardId: string) => void;
  /** Message de règle (`deckRuleIssue`), `null` si le deck est jouable. */
  issue: string | null;
  saveError: string | null;
  isSaving: boolean;
  savedFlash: boolean;
  isDirty: boolean;
  /** `false` tant que le deck n'a jamais été sauvegardé : dupliquer/supprimer n'ont alors rien à viser. */
  isPersisted: boolean;
  onSave: () => void;
  onNewDeck: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

/**
 * Colonne de droite du Deck Builder : la composition du deck, lisible en
 * quelques secondes.
 *
 * De haut en bas : effectif et jauge de taille légale, résumé (courbe de
 * Raison et types),
 * la liste REGROUPÉE — une ligne par carte distincte avec sa quantité,
 * jamais un exemplaire par ligne — puis les règles enfreintes et les
 * actions. Aucune donnée de règle n'est décidée ici : `RULES` et
 * `deckComposition` font foi.
 */
export function DeckListPanel({
  cardIds,
  namePlate,
  onRemove,
  onAdd,
  onShowCard,
  issue,
  saveError,
  isSaving,
  savedFlash,
  isDirty,
  isPersisted,
  onSave,
  onNewDeck,
  onDuplicate,
  onDelete,
}: DeckListPanelProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [isDropping, setIsDropping] = useState(false);

  const entries = groupDeck(cardIds);
  const count = cardIds.length;
  const status = deckSizeStatus(count);
  const curve = costCurve(cardIds);
  const curveMax = Math.max(1, ...curve);
  const types = typeBreakdown(cardIds);

  useEffect(() => {
    if (!menuOpen) return;
    const close = () => setMenuOpen(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [menuOpen]);

  return (
    <div className={styles.deckInner}>
      {namePlate ?? <p className={styles.deckHeading}>Deck</p>}

      <div className={styles.capacity}>
        <div className={styles.capacityRow}>
          <span>
            <span className={styles.capacityCount}>{count}</span> / {RULES.DECK_SIZE_MAX} cartes
          </span>
          <span
            className={`${styles.capacityStatus} ${
              status === "valid" ? styles.statusValid : status === "over" ? styles.statusOver : styles.statusShort
            }`}
          >
            {status === "valid" ? "Jouable" : status === "over" ? "Trop de cartes" : `Minimum ${RULES.DECK_SIZE_MIN}`}
          </span>
        </div>
        <div
          className={styles.gaugeTrack}
          role="progressbar"
          aria-valuenow={count}
          aria-valuemin={0}
          aria-valuemax={RULES.DECK_SIZE_MAX}
          aria-label="Taille du deck"
        >
          <span
            className={`${styles.gaugeFill} ${status === "valid" ? styles.gaugeFillValid : status === "over" ? styles.gaugeFillOver : ""}`}
            style={{ width: `${Math.min(1, count / RULES.DECK_SIZE_MAX) * 100}%` }}
          />
          {status === "short" && (
            <span className={styles.gaugeMark} style={{ left: `${(RULES.DECK_SIZE_MIN / RULES.DECK_SIZE_MAX) * 100}%` }} />
          )}
        </div>
      </div>

      {count > 0 && (
        <div className={styles.summary}>
          <p className={styles.summaryTitle}>Résumé du deck</p>
          <div className={styles.curve} aria-label="Répartition par Raison">
            {curve.map((value, index) => (
              <div key={index} className={styles.curveBar} title={`Raison ${index === CURVE_OVERFLOW ? `${index}+` : index} : ${value}`}>
                <span className={styles.curveValue}>{value > 0 ? value : ""}</span>
                <span
                  className={`${styles.curveFill} ${value === 0 ? styles.curveFillEmpty : ""}`}
                  style={{ height: `${Math.max(4, (value / curveMax) * 100)}%` }}
                />
              </div>
            ))}
          </div>
          <div className={styles.curveLabels} aria-hidden>
            {CURVE_BUCKETS.map((bucket) => (
              <span key={bucket}>{bucket === CURVE_OVERFLOW ? `${bucket}+` : bucket}</span>
            ))}
          </div>
          <div className={styles.types}>
            {types.map(({ type, count: typeCount }) => (
              <span key={type}>
                <span className={styles.typeCount}>{typeCount}</span> {CARD_TYPE_LABELS[type]}
              </span>
            ))}
          </div>
        </div>
      )}

      <div
        className={`${styles.list} ${isDropping ? styles.listDropping : ""}`}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDropping(true);
        }}
        onDragLeave={() => setIsDropping(false)}
        onDrop={(event) => {
          event.preventDefault();
          setIsDropping(false);
          const cardId = event.dataTransfer.getData(DRAG_MIME);
          if (cardId) onAdd(cardId);
        }}
      >
        {entries.length === 0 ? (
          <p className={styles.listEmpty}>Clique une carte de la grille pour l&apos;ajouter — ou glisse-la ici.</p>
        ) : (
          entries.map((entry) => (
            <div key={entry.cardId} className={`${styles.row} ${entry.def.subtype === "abyssal" ? styles.rowAbyssal : ""}`}>
              <span className={styles.rowCost} title="Raison">
                {entry.def.cost}
              </span>
              <button
                type="button"
                className={styles.rowName}
                style={{ background: "none", border: "none", padding: 0, color: "inherit", font: "inherit", textAlign: "left", cursor: "pointer" }}
                onClick={() => onShowCard(entry.cardId)}
                title="Voir la carte"
              >
                {entry.def.name}
              </button>
              <span className={styles.rowThumb} aria-hidden>
                {/* eslint-disable-next-line @next/next/no-img-element -- vignette de liste */}
                <img src={`/assets/cards/illustrations/${entry.cardId}.webp`} alt="" loading="lazy" decoding="async" />
              </span>
              <span className={styles.rowQty}>×{entry.count}</span>
              <button
                type="button"
                className={styles.rowRemove}
                onClick={() => {
                  playButtonClick();
                  onRemove(entry.cardId);
                }}
                aria-label={`Retirer un exemplaire de ${entry.def.name}`}
              >
                <svg viewBox="0 0 24 24" fill="none" width="12" height="12" aria-hidden>
                  <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" />
                </svg>
              </button>
            </div>
          ))
        )}
      </div>

      {issue && count > 0 && <p className={game.error}>{issue}</p>}
      {saveError && <p className={game.error}>{saveError}</p>}

      <div className={styles.actions}>
        <button
          type="button"
          className={`${game.primary} ${styles.save} ${savedFlash ? styles.saveDone : ""}`}
          onClick={() => {
            playButtonClick();
            onSave();
          }}
          disabled={isSaving || (!isDirty && isPersisted)}
        >
          {isSaving ? "Sauvegarde…" : savedFlash ? "Enregistré ✓" : isDirty || !isPersisted ? "Sauvegarder" : "À jour"}
        </button>

        {/* `stopPropagation` : le listener global de fermeture refermerait
            le menu dans le même clic que celui qui l'ouvre. */}
        <div className={styles.menuAnchor} onClick={(event) => event.stopPropagation()}>
          <button
            type="button"
            className={game.iconButton}
            onClick={() => setMenuOpen((open) => !open)}
            aria-label="Plus d'options"
            aria-expanded={menuOpen}
          >
            <svg viewBox="0 0 24 24" fill="none" width="16" height="16" aria-hidden>
              <circle cx="5" cy="12" r="1.7" fill="currentColor" />
              <circle cx="12" cy="12" r="1.7" fill="currentColor" />
              <circle cx="19" cy="12" r="1.7" fill="currentColor" />
            </svg>
          </button>
          {menuOpen && (
            <div className={`${game.menu} ${styles.menuUp}`} role="menu">
              <button type="button" className={game.menuItem} role="menuitem" onClick={() => { setMenuOpen(false); onNewDeck(); }}>
                Nouveau deck
              </button>
              <button type="button" className={game.menuItem} role="menuitem" disabled={!isPersisted} onClick={() => { setMenuOpen(false); onDuplicate(); }}>
                Dupliquer
              </button>
              <div className={game.menuSeparator} role="separator" />
              <button
                type="button"
                className={game.menuItemDanger}
                role="menuitem"
                disabled={!isPersisted}
                onClick={() => { setMenuOpen(false); onDelete(); }}
              >
                Supprimer
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
