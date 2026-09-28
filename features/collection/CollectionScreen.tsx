"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CardDefinition } from "@/game";
import { CardShelfProvider, type ShelfBackend } from "@/features/collection/shelf/CardShelfProvider";
import type { ShelfFilter } from "@/features/collection/shelf/shelf";
import { CardGrid } from "@/features/collection/CardGrid";
import { CollectionSidebar } from "@/features/collection/CollectionSidebar";
import { CollectionToolbar } from "@/features/collection/CollectionToolbar";
import { FirstDeckPrompt } from "@/features/collection/FirstDeckPrompt";
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
import collectionBook from "@/features/collection/CollectionBook.module.css";
import game from "@/features/shell/GameScreen.module.css";
import book from "@/features/decks/DeckEditorBook.module.css";
import { BookSearch } from "@/features/decks/BookSearch";
import { oneOf } from "@/lib/persistCodecs";
import { usePersistedState } from "@/lib/persistedState";

interface CollectionScreenProps {
  isSignedIn: boolean;
  /**
   * Decks fournis par le jeu + possession. Sert à l'invite de PREMIER DECK :
   * après le tutoriel, le joueur est conduit ici pour prendre son premier
   * équipage (Notion « Progression joueur » §2, étape 5).
   */
  catalog?: DeckCatalogView;
  /** `true` tant que le joueur n'a pas pris son préconstruit gratuit. */
  needsFirstDeck?: boolean;
  /** Cartes possédées (`player_cards.card_id`, quantité > 0). Ignoré si `isSignedIn` est `false`. */
  ownedCardIds: string[];
  /** Exemplaires possédés par carte — affichés en pastille sous chaque carte possédée. */
  ownedCounts: Record<string, number>;
  /** Ouvrir la grille sur les favoris ou un carnet (`/collection?carnet=…`, depuis le mur des carnets). */
  openShelf?: ShelfFilter;
  /** Étagère en mémoire du laboratoire `/game/carnets-preview` ; absente : le compte. */
  shelfBackend?: ShelfBackend;
}

/**
 * L'écran Collection et son ÉTAGÈRE (favoris, carnets) : un visiteur n'en a
 * pas, on ne la lit donc que pour un compte connecté.
 */
export function CollectionScreen(props: CollectionScreenProps) {
  return (
    <CardShelfProvider initialShelf={props.isSignedIn ? undefined : null} backend={props.shelfBackend}>
      <CollectionScreenBody {...props} />
    </CardShelfProvider>
  );
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
 *
 * « SUR LE LIVRE » (26/09/2026) : le même habillage que l'Éditeur de deck
 * (`DeckEditorBook.module.css`) — la table du capitaine, la colonne de
 * filtres et la grille dans leurs cadres de bois — SANS la colonne du deck.
 * Ce qui n'appartient qu'à la Collection y garde sa place : la pastille des
 * exemplaires possédés sous chaque carte, « Revendre le surplus », le
 * filtre de Raison, les carnets en tête de colonne et « Créer un deck ».
 */
function CollectionScreenBody({ isSignedIn, ownedCardIds, ownedCounts, catalog, needsFirstDeck = false, openShelf }: CollectionScreenProps) {
  const owned = useMemo(() => (isSignedIn ? new Set(ownedCardIds) : null), [isSignedIn, ownedCardIds]);
  const browser = useCardBrowser({ owned, persistKey: "collection" });
  // Arrivée depuis le mur des carnets : la grille s'ouvre sur le carnet choisi.
  const { patchFilters } = browser;
  useEffect(() => {
    if (openShelf !== undefined) patchFilters({ shelf: openShelf });
  }, [openShelf, patchFilters]);
  const [detailCardId, setDetailCardId] = useState<string | null>(null);
  const [surplusOpen, setSurplusOpen] = useState(false);
  // Nouvel affichage « sur le livre » ou l'ancien, le temps de valider (mémorisé) — comme l'Éditeur.
  const [layout, setLayout] = usePersistedState<"livre" | "classic">("collection:affichage", "livre", {
    decode: (raw) => oneOf<"livre" | "classic">(["livre", "classic"], raw),
  });
  const onBook = layout === "livre";
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

  const surplusButton = isSignedIn ? (
    <button
      type="button"
      className={`${surplusStyles.button} ${onBook ? book.surplusButton : ""}`}
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
  ) : undefined;

  // La bougie seule (plus de tasse de café, retour du 28/09/2026), agrandie,
  // et la lueur vacillante de sa flamme. Elle a SA place dans la barre de la
  // grille, entre la recherche et le tri : plus grande, posée par-dessus, elle
  // masquait le tri.
  const candle = (
    <span className={collectionBook.candleSlot} aria-hidden>
      <span className={collectionBook.candle}>
        <span className={collectionBook.candleGlow} />
        {/* eslint-disable-next-line @next/next/no-img-element -- décor peint */}
        <img src="/assets/ui/accessoires/bougie.webp" alt="" draggable={false} />
        <span className={collectionBook.candleCore} />
      </span>
    </span>
  );

  return (
    <GameScreen
      active="collection"
      backdrop={onBook ? "livre" : "port"}
      actions={
        // Sur le livre, la recherche descend dans la barre de la grille (comme l'Éditeur).
        onBook ? undefined : (
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
        )
      }
    >
      <div
        className={`${styles.workspace} ${onBook ? `${book.workspace} ${book.collection} ${collectionBook.book}` : ""}`}
        data-drawer={browser.drawerOpen ? "open" : "closed"}
      >
        <button
          type="button"
          className={styles.drawerScrim}
          aria-label="Fermer les filtres"
          onClick={() => browser.setDrawerOpen(false)}
        />

        <aside className={`${game.panel} ${styles.sidebar} ${onBook ? `${book.frame} ${book.left}` : ""}`} aria-label="Filtres de la collection">
          <CollectionSidebar
            filters={browser.filters}
            onChange={browser.patchFilters}
            onReset={browser.resetFilters}
            owned={browser.ownedForFilters}
            showOwnership={isSignedIn}
            shelfCards={browser.shelfCards}
            layout={onBook ? "collection-livre" : "collection"}
          />
        </aside>

        <main className={`${game.panel} ${styles.main} ${onBook ? `${book.frame} ${book.center}` : ""}`}>
          <CollectionToolbar
            count={browser.cards.length}
            sort={browser.sort}
            onSortChange={browser.setSort}
            onOpenFilters={() => browser.setDrawerOpen((open) => !open)}
            activeFilterCount={browser.activeFilterCount}
            // Sur le livre : l'effectif seul sur son onglet, « Revendre le surplus » en bout de barre.
            countAction={onBook ? undefined : surplusButton}
            search={
              onBook ? (
                <>
                  <BookSearch value={browser.filters.search} onChange={(search) => browser.patchFilters({ search })} />
                  {candle}
                </>
              ) : undefined
            }
            extra={onBook ? surplusButton : undefined}
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

      {onBook && (
        <>
          {/* Le décor de la table, le même que celui de l'Éditeur. */}
          {/* eslint-disable-next-line @next/next/no-img-element -- décor peint, positionné à la main */}
          <img className={book.decor} src="/assets/ui/accessoires/longue-vue.webp" alt="" draggable={false} />
        </>
      )}

      <button
        type="button"
        className={book.layoutToggle}
        onClick={() => {
          playButtonClick();
          setLayout(onBook ? "classic" : "livre");
        }}
      >
        {onBook ? "Ancien affichage" : "Nouvel affichage"}
      </button>

      {needsFirstDeck && catalog && <FirstDeckPrompt catalog={catalog} />}

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
