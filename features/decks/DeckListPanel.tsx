"use client";

import { useEffect, useState, type ReactNode } from "react";
import { isAbyssalVariant, RULES, type CardType } from "@/game";
import { CARD_TYPE_LABELS, typeGlyphUrl } from "@/features/match/cardDisplay";
import {
  CURVE_BUCKETS,
  CURVE_OVERFLOW,
  costCurve,
  groupDeck,
  typeBreakdown,
} from "@/features/decks/deckComposition";
import styles from "@/features/decks/DeckBuilder.module.css";
import book from "@/features/decks/DeckEditorBook.module.css";
import game from "@/features/shell/GameScreen.module.css";
import { playButtonClick } from "@/lib/sound";
import { cardIllustrationThumbUrl } from "@/features/decks/cardArtUrl";

const DRAG_MIME = "text/tidebound-card-id";

interface DeckListPanelProps {
  cardIds: string[];
  /** Plaque du nom du deck (`DeckNamePlate`), posée en tête de ce panneau : elle porte aussi l'effectif et le statut. */
  namePlate: ReactNode;
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

/** Libellés au PLURIEL du tableau des types (maquette : « Créatures 18 »), dans l'ordre FIXE du tableau. */
const TYPE_PLURALS: Record<CardType, string> = {
  marin: "Marins",
  creature: "Créatures",
  equipement: "Équipements",
  structure: "Structures",
  objet: "Objets",
  anomalie: "Anomalies",
  lande: "Landes",
};

/**
 * Colonne de droite du Deck Builder : la composition du deck, lisible en
 * quelques secondes — la maquette « sur le livre » (26/09/2026).
 *
 * De haut en bas : l'en-tête (`DeckNamePlate` : nom, effectif, statut), le
 * résumé (courbe de Raison et tableau des types à icônes), la liste
 * « Cartes (n / 50) » REGROUPÉE — une ligne par carte distincte avec sa quantité,
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
      {namePlate}

      {/* Le résumé est TOUJOURS là — barres à plat et zéros compris : le
          panneau garde sa masse quand le deck est vide. */}
      <div className={styles.summary}>
        <p className={styles.summaryTitle}>Résumé du deck</p>
        <div className={book.summaryBody}>
          <div className={book.summaryCurve}>
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
          </div>
          {/* Le tableau sombre de la maquette : icône, type au pluriel, effectif. */}
          <ul className={book.typeTable}>
            {(Object.keys(TYPE_PLURALS) as CardType[]).map((type) => {
              const typeCount = types.find((entry) => entry.type === type)?.count ?? 0;
              return (
                <li key={type} data-empty={typeCount === 0 || undefined}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- icône locale de type */}
                  <img src={typeGlyphUrl(type)} alt="" />
                  <span>{TYPE_PLURALS[type] ?? CARD_TYPE_LABELS[type]}</span>
                  <strong>{typeCount}</strong>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      <p className={book.listTitle}>
        Cartes ({count} / {RULES.DECK_SIZE_MAX})
      </p>

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
            <div key={entry.cardId} className={`${styles.row} ${isAbyssalVariant(entry.def) ? styles.rowAbyssal : ""}`}>
              <span className={styles.rowCost} title="Raison">
                {entry.def.cost}
              </span>
              <button
                type="button"
                className={styles.rowName}
                style={{ background: "none", border: "none", padding: 0, color: "inherit", font: "inherit", textAlign: "left", cursor: "var(--tb-cursor-pointer)" }}
                onClick={() => onShowCard(entry.cardId)}
                title="Voir la carte"
              >
                {entry.def.name}
              </button>
              <span className={styles.rowThumb} aria-hidden>
                {/* eslint-disable-next-line @next/next/no-img-element -- vignette de liste */}
                <img src={cardIllustrationThumbUrl(entry.cardId)} alt="" loading="lazy" decoding="async" />
              </span>
              <span className={styles.rowQty}>×{entry.count}</span>
              <button
                type="button"
                className={styles.rowRemove}
                onClick={() => onRemove(entry.cardId)}
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
          {!isSaving && !savedFlash && !isDirty && isPersisted && (
            // Maquette : « ✓ À jour », la coche cerclée devant.
            <svg className={book.saveCheck} viewBox="0 0 24 24" fill="none" aria-hidden>
              <circle cx="12" cy="12" r="9.5" stroke="currentColor" strokeWidth={1.6} />
              <path d="M7.5 12.3l3 3 6-6.3" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
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
