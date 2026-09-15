"use client";

import { useMemo } from "react";
import { costCurve, CURVE_BUCKETS, CURVE_OVERFLOW } from "@/features/decks/deckComposition";
import { ownershipLabel, type CatalogDeck, type DeckOwnership } from "@/game";
import { Dialog } from "@/features/shell/Dialog";
import { ShipPortrait, shipNameOf } from "@/features/ships/ShipPortrait";
import game from "@/features/shell/GameScreen.module.css";
import styles from "@/features/decks/DeckCatalog.module.css";

interface DeckSheetProps {
  deck: CatalogDeck;
  ownership: DeckOwnership;
  unlocked: boolean;
  /** Famille du deck : elle décide de l'action proposée en bas de fiche. */
  kind: "borrowed" | "precon";
  /** Jetons de Préconstruit disponibles — pour un préconstruit verrouillé. */
  tokens: number;
  /** Le joueur a-t-il déjà choisi son deck d'emprunt ? (un seul par compte) */
  borrowedAlreadyChosen: boolean;
  busy: boolean;
  error: string | null;
  onUnlock: () => void;
  /** « Essayer » : partie contre le bot, deck entièrement prêté (§4, option UX recommandée). */
  onTry: () => void;
  onClose: () => void;
}

/** Difficulté en étoiles, comme la spec l'écrit (« ★★☆☆☆ »). */
function difficultyStars(difficulty: number): string {
  return "★".repeat(difficulty) + "☆".repeat(Math.max(0, 5 - difficulty));
}

/**
 * Fiche complète d'un deck fourni par le jeu.
 *
 * Affiche exactement ce que la spec exige avant de dépenser un Jeton
 * (Notion §4) : nom, bannière (le Navire), style de jeu, difficulté,
 * mécaniques principales, courbe de coût, liste complète des cartes,
 * possédées et prêtées, et l'action de déblocage.
 *
 * Un préconstruit VERROUILLÉ montre tout cela aussi — « les préconstruits
 * verrouillés doivent rester visibles » et « consultables avant achat ».
 */
export function DeckSheet({
  deck,
  ownership,
  unlocked,
  kind,
  tokens,
  borrowedAlreadyChosen,
  busy,
  error,
  onUnlock,
  onTry,
  onClose,
}: DeckSheetProps) {
  const curve = useMemo(() => costCurve(deck.cardIds), [deck.cardIds]);
  const peak = Math.max(1, ...curve);
  const ownedRatio = ownership.total === 0 ? 0 : ownership.owned / ownership.total;

  const canUnlock = kind === "precon" ? tokens >= 1 : !borrowedAlreadyChosen;
  const unlockLabel = kind === "precon" ? "Débloquer — 1 Jeton de Préconstruit" : "Emprunter ce deck";
  const unlockHint =
    kind === "precon"
      ? tokens >= 1
        ? `${tokens} Jeton${tokens > 1 ? "s" : ""} disponible${tokens > 1 ? "s" : ""}`
        : "Aucun Jeton disponible — les gros paliers de niveau en donnent un tous les 10 niveaux."
      : borrowedAlreadyChosen
        ? "Tu as déjà choisi ton deck d'emprunt."
        : "Gratuit, une seule fois : les cartes que tu ne possèdes pas restent prêtées.";

  return (
    <Dialog
      title={deck.name}
      onClose={onClose}
      // La fiche porte deux colonnes (le Navire, puis tout le détail) : à la
      // largeur par défaut d'un dialogue de confirmation, la liste de cartes
      // et la courbe deviennent illisibles.
      width={980}
      actions={
        <>
          <button type="button" className={game.secondary} onClick={onClose}>
            Fermer
          </button>
          {!unlocked && (
            <button type="button" className={game.primary} onClick={onUnlock} disabled={busy || !canUnlock}>
              {busy ? "…" : unlockLabel}
            </button>
          )}
        </>
      }
    >
      <div className={`${styles.sheet} ${styles.sheetScroll}`}>
        <div className={styles.sheetAside}>
          <ShipPortrait shipId={deck.shipId} width="100%" showName={false} />
          <div className={styles.sheetField}>
            <span className={styles.sheetLabel}>Navire</span>
            <span className={styles.sheetValue}>{shipNameOf(deck.shipId)}</span>
          </div>
          <div className={styles.sheetField}>
            <span className={styles.sheetLabel}>Possession</span>
            <span className={styles.sheetValue}>{ownershipLabel(ownership)}</span>
            <span className={styles.ownBar} aria-hidden>
              <span className={ownership.complete ? styles.ownFillComplete : styles.ownFill} style={{ width: `${ownedRatio * 100}%` }} />
            </span>
          </div>
        </div>

        <div className={styles.sheetMain}>
          <p className={game.muted}>{deck.description}</p>

          <div className={styles.sheetRow}>
            <span className={styles.sheetField}>
              <span className={styles.sheetLabel}>Style</span>
              <span className={styles.sheetValue}>{deck.style}</span>
            </span>
            <span className={styles.sheetField}>
              <span className={styles.sheetLabel}>Difficulté</span>
              <span className={`${styles.sheetValue} ${styles.difficulty}`}>{difficultyStars(deck.difficulty)}</span>
            </span>
            <span className={styles.sheetField}>
              <span className={styles.sheetLabel}>Effectif</span>
              <span className={styles.sheetValue}>{ownership.total} cartes</span>
            </span>
          </div>

          <div className={styles.sheetField}>
            <span className={styles.sheetLabel}>Mécaniques</span>
            <ul className={styles.mechanics}>
              {deck.mechanics.map((mechanic) => (
                <li key={mechanic} className={styles.mechanic}>
                  {mechanic}
                </li>
              ))}
            </ul>
          </div>

          <div className={styles.sheetField}>
            <span className={styles.sheetLabel}>Courbe de coût</span>
            <div className={styles.curve} role="img" aria-label="Courbe de coût du deck">
              {CURVE_BUCKETS.map((bucket, index) => (
                <span key={bucket} className={styles.curveBucket}>
                  <span className={styles.curveBar} style={{ height: `${((curve[index] ?? 0) / peak) * 100}%` }} />
                  <span className={styles.curveLabel}>{bucket === CURVE_OVERFLOW ? `${bucket}+` : bucket}</span>
                </span>
              ))}
            </div>
          </div>

          <div className={styles.sheetField}>
            <span className={styles.sheetLabel}>Cartes — possédées / demandées</span>
            <ul className={styles.cardList}>
              {ownership.cards.map((card) => (
                <li key={card.cardId} className={`${styles.cardRow} ${card.owned === 0 ? styles.cardBorrowed : ""}`}>
                  <span className={styles.cardCost}>{card.cost}</span>
                  <span className={styles.cardName} title={card.name}>
                    {card.name}
                  </span>
                  <span className={card.owned === card.required ? styles.cardCountOwned : styles.cardCount}>
                    {card.owned}/{card.required}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className={styles.sheetActions}>
            {unlocked ? (
              <span className={game.tagSuccess}>{kind === "borrowed" ? "Deck d'emprunt" : "Débloqué"}</span>
            ) : (
              <span className={game.muted}>{unlockHint}</span>
            )}
            {/* « Essayer » : tester avant de dépenser son jeton (§4). */}
            {!unlocked && kind === "precon" && (
              <button type="button" className={game.link} onClick={onTry}>
                Essayer contre le bot →
              </button>
            )}
          </div>

          {error && <p className={game.error}>{error}</p>}
        </div>
      </div>
    </Dialog>
  );
}
