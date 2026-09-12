"use client";

import type { CardDefinition, CardInstance } from "@/game";
import shell from "@/features/shell/ScreenShell.module.css";
import styles from "@/features/decks/DeckScreens.module.css";
import { CardTile } from "@/features/match/CardTile";

const DRAG_MIME = "text/tidebound-card-id";

/** Instance factice, pour afficher une carte hors de toute partie (stats de base, aucun état vivant). */
function displayInstance(cardId: string): CardInstance {
  return {
    instanceId: cardId,
    cardId,
    ownerId: "collection",
    damageMarked: 0,
    modifiers: [],
    summoningSick: false,
    hasAttackedThisTurn: false,
  };
}

interface DeckCardPickerProps {
  /** Déjà filtrées/triées par l'éditeur — les contrôles vivent dans la barre du bas, pas ici. */
  cards: CardDefinition[];
  onPick: (cardId: string) => void;
  /** Le joueur possède-t-il au moins une carte (indépendamment des filtres) ? */
  hasAnyCards: boolean;
}

/**
 * Colonne de gauche de l'éditeur : les cartes possédées, posées sur le
 * papier. Clic ou glisser-déposer ajoute l'exemplaire au deck.
 *
 * Même langage que la grille de la Collection — cartes plus petites (la
 * colonne est plus étroite), même ombre de contact, même survol
 * (`liftOnHover` : soulèvement, légère inclinaison, ombre profonde, aucune
 * lueur bleue), même dissolution haut/bas de la zone défilante.
 *
 * Les filtres/recherche/tri sont pilotés par l'éditeur et rendus dans la
 * barre utilitaire : un seul jeu de contrôles par écran, toujours au même
 * endroit.
 */
export function DeckCardPicker({ cards, onPick, hasAnyCards }: DeckCardPickerProps) {
  return (
    <div className={`${shell.paperScroll} ${styles.pickerScroll}`}>
      {cards.length === 0 ? (
        <div className={shell.emptyState}>
          <svg viewBox="0 0 24 24" width="30" height="30" fill="none" className={shell.emptyStateMark} aria-hidden>
            <path
              d="M12 3v12m0 0l-3-3m3 3l3-3M6 8h12M12 15v4a3 3 0 0 1-3 3m3-3a3 3 0 0 0 3 3"
              stroke="currentColor"
              strokeWidth={1.3}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <p>
            {hasAnyCards
              ? "Aucune carte ne correspond à ces filtres."
              : "Tu ne possèdes encore aucune carte : joue avec un deck préconstruit en attendant d'ouvrir des boosters."}
          </p>
        </div>
      ) : (
        <div className={styles.pickerGrid}>
          {cards.map((def) => (
            <div key={def.id} className={styles.pickerCell}>
              <CardTile
                instance={displayInstance(def.id)}
                tideState="calme"
                widthClassName="w-full"
                scaleOnHover={false}
                liftOnHover
                onClick={() => onPick(def.id)}
                draggable
                onDragStart={(event) => event.dataTransfer.setData(DRAG_MIME, def.id)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
