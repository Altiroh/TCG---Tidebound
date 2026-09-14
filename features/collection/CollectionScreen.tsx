"use client";

import { useMemo, useState } from "react";
import { CardGrid } from "@/features/collection/CardGrid";
import { CollectionSidebar } from "@/features/collection/CollectionSidebar";
import { CollectionToolbar } from "@/features/collection/CollectionToolbar";
import { CardDetailModal } from "@/features/collection/card-detail/CardDetailModal";
import { useCardBrowser } from "@/features/collection/useCardBrowser";
import { GameScreen } from "@/features/shell/GameScreen";
import { SearchLine } from "@/features/shell/SearchLine";
import styles from "@/features/collection/CardBrowser.module.css";
import game from "@/features/shell/GameScreen.module.css";

interface CollectionScreenProps {
  isSignedIn: boolean;
  /** Cartes possédées (`player_cards.card_id`, quantité > 0). Ignoré si `isSignedIn` est `false`. */
  ownedCardIds: string[];
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
export function CollectionScreen({ isSignedIn, ownedCardIds }: CollectionScreenProps) {
  const owned = useMemo(() => (isSignedIn ? new Set(ownedCardIds) : null), [isSignedIn, ownedCardIds]);
  const browser = useCardBrowser({ owned });
  const [detailCardId, setDetailCardId] = useState<string | null>(null);

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
          />

          <CardGrid
            cards={browser.cards}
            onCardClick={setDetailCardId}
            // Ce que le joueur possède, PAS ce que le filtre laisse passer :
            // sinon une recherche sans résultat afficherait « tu ne possèdes
            // aucune carte » à un joueur qui en a.
            hasAnyCards={!isSignedIn || ownedCardIds.length > 0}
            owned={owned}
          />
        </main>
      </div>

      {detailCardId && (
        <CardDetailModal
          cardId={detailCardId}
          onClose={() => setDetailCardId(null)}
          onPrevious={browser.cards.length > 1 ? () => setDetailCardId((id) => (id ? browser.relativeCardId(id, -1) : id)) : undefined}
          onNext={browser.cards.length > 1 ? () => setDetailCardId((id) => (id ? browser.relativeCardId(id, 1) : id)) : undefined}
          onShowCard={setDetailCardId}
        />
      )}
    </GameScreen>
  );
}
