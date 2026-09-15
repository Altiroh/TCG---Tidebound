"use client";

import { useCallback, useMemo, useState } from "react";
import type { CardDefinition } from "@/game";
import { CardGrid } from "@/features/collection/CardGrid";
import { CollectionSidebar } from "@/features/collection/CollectionSidebar";
import { CollectionToolbar } from "@/features/collection/CollectionToolbar";
import { BorrowedDeckPrompt } from "@/features/collection/BorrowedDeckPrompt";
import { CardDetailModal } from "@/features/collection/card-detail/CardDetailModal";
import { SurplusResaleDialog } from "@/features/collection/SurplusResaleDialog";
import { surplusPlan } from "@/features/collection/recycleValue";
import surplusStyles from "@/features/collection/SurplusResale.module.css";
import { playButtonClick } from "@/lib/sound";
import type { DeckCatalogView } from "@/features/decks/catalogService";
import { useCardBrowser } from "@/features/collection/useCardBrowser";
import { GameScreen } from "@/features/shell/GameScreen";
import { SearchLine } from "@/features/shell/SearchLine";
import styles from "@/features/collection/CardBrowser.module.css";
import game from "@/features/shell/GameScreen.module.css";

interface CollectionScreenProps {
  isSignedIn: boolean;
  /**
   * Decks fournis par le jeu + possession. Sert à l'invite de PREMIER DECK :
   * après le tutoriel, le joueur est conduit ici pour emprunter son premier
   * équipage (Notion « Progression joueur » §2, étape 5).
   */
  catalog?: DeckCatalogView;
  /** `true` tant que le joueur n'a pas choisi son deck d'emprunt. */
  needsBorrowedDeck?: boolean;
  /** Cartes possédées (`player_cards.card_id`, quantité > 0). Ignoré si `isSignedIn` est `false`. */
  ownedCardIds: string[];
  /** Exemplaires possédés par carte — affichés en pastille sous chaque carte possédée. */
  ownedCounts: Record<string, number>;
}

/**
 * Écran Collection.
 *
 * Trois plans : le décor maritime en plein écran
 * (`--screen-backdrop`, posé par `GameScreen.module.css`), la colonne de
 * filtres à gauche, la grille de cartes à droite. Le bandeau
 * de navigation reste celui de la coquille partagée, privé de son panorama
 * pour se fondre dans ce décor-ci.
 *
 * Toute la mécanique de navigation dans le catalogue (filtres, recherche,
 * tri, tiroir) vit dans `useCardBrowser`, partagé avec le Deck Builder :
 * ce dernier est le même écran, avec une colonne de deck en plus.
 *
 * La grille montre TOUT le catalogue, les cartes non possédées estompées,
 * au lieu de masquer ce qui manque — c'est ce qui donne un sens au filtre
 * « Manquantes ». Un visiteur non connecté n'a pas de possession connue :
 * il feuillette sans estompage ni section « Statut de collection ».
 */
export function CollectionScreen({ isSignedIn, ownedCardIds, ownedCounts, catalog, needsBorrowedDeck = false }: CollectionScreenProps) {
  const owned = useMemo(() => (isSignedIn ? new Set(ownedCardIds) : null), [isSignedIn, ownedCardIds]);
  const browser = useCardBrowser({ owned });
  const [detailCardId, setDetailCardId] = useState<string | null>(null);
  const [surplusOpen, setSurplusOpen] = useState(false);
  // Figé à l'ouverture : le récapitulatif confirmé ne bouge pas sous les yeux
  // quand la collection est relue après la vente.
  const [surplusLines, setSurplusLines] = useState<ReturnType<typeof surplusPlan>>([]);
  const surplus = useMemo(() => (isSignedIn ? surplusPlan(ownedCounts) : []), [isSignedIn, ownedCounts]);
  const surplusCount = surplus.reduce((sum, line) => sum + line.quantity, 0);

  // Même pastille que la quantité du Deck Builder, ancrée au pied de la
  // carte. Rien sur une carte non possédée : l'estompage le dit déjà.
  const renderOwnedCount = useCallback(
    (def: CardDefinition) => {
      const count = ownedCounts[def.id] ?? 0;
      if (!isSignedIn || count <= 0) return null;
      return (
        <span className={styles.ownedCount} aria-label={`${count} exemplaire${count > 1 ? "s" : ""} possédé${count > 1 ? "s" : ""}`}>
          <span className={styles.ownedCountTimes} aria-hidden>×</span>
          {count}
        </span>
      );
    },
    [isSignedIn, ownedCounts]
  );

  return (
    <GameScreen
      active="collection"
      actions={
        <div className={game.headerSearch}>
          <SearchLine
            variant="pill"
            value={browser.filters.search}
            onChange={(search) => browser.patchFilters({ search })}
            placeholder="Rechercher une carte…"
            label="Rechercher une carte"
            shortcut
          />
        </div>
      }
    >
      <div className={styles.workspace} data-drawer={browser.drawerOpen ? "open" : "closed"}>
        <button
          type="button"
          className={styles.drawerScrim}
          aria-label="Fermer les filtres"
          onClick={() => browser.setDrawerOpen(false)}
        />

        <aside className={`${game.panel} ${styles.sidebar}`} aria-label="Filtres de la collection">
          <CollectionSidebar
            filters={browser.filters}
            onChange={browser.patchFilters}
            onReset={browser.resetFilters}
            owned={browser.ownedForFilters}
            showOwnership={isSignedIn}
          />
        </aside>

        <main className={`${game.panel} ${styles.main}`}>
          <CollectionToolbar
            count={browser.cards.length}
            sort={browser.sort}
            onSortChange={browser.setSort}
            onOpenFilters={() => browser.setDrawerOpen((open) => !open)}
            activeFilterCount={browser.activeFilterCount}
            countAction={
              isSignedIn ? (
                <button
                  type="button"
                  className={surplusStyles.button}
                  disabled={surplusCount === 0}
                  title={surplusCount === 0 ? "Aucune carte au-delà du maximum d'un deck" : "Revendre les exemplaires au-delà du maximum d'un deck"}
                  onClick={() => {
                    playButtonClick();
                    setSurplusLines(surplus);
                    setSurplusOpen(true);
                  }}
                >
                  Revendre le surplus
                  {surplusCount > 0 && <span className={surplusStyles.buttonCount}>{surplusCount}</span>}
                </button>
              ) : undefined
            }
          />

          <CardGrid
            cards={browser.cards}
            onCardClick={setDetailCardId}
            // Ce que le joueur possède, PAS ce que le filtre laisse passer :
            // sinon une recherche sans résultat afficherait « tu ne possèdes
            // aucune carte » à un joueur qui en a.
            hasAnyCards={!isSignedIn || ownedCardIds.length > 0}
            owned={owned}
            cellExtras={renderOwnedCount}
          />
        </main>
      </div>

      {needsBorrowedDeck && catalog && <BorrowedDeckPrompt catalog={catalog} />}

      {surplusOpen && <SurplusResaleDialog lines={surplusLines} onClose={() => setSurplusOpen(false)} />}

      {detailCardId && (
        <CardDetailModal
          cardId={detailCardId}
          onClose={() => setDetailCardId(null)}
          onPrevious={browser.cards.length > 1 ? () => setDetailCardId((id) => (id ? browser.relativeCardId(id, -1) : id)) : undefined}
          onNext={browser.cards.length > 1 ? () => setDetailCardId((id) => (id ? browser.relativeCardId(id, 1) : id)) : undefined}
          onShowCard={setDetailCardId}
          ownedCount={isSignedIn ? (ownedCounts[detailCardId] ?? 0) : undefined}
        />
      )}
    </GameScreen>
  );
}
