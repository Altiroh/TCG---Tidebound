"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CardDefinition } from "@/game";
import { RARE_CARD_FINISHES, type CardFinish, type RareCardFinish } from "@/game/cosmetics/finishes";
import { CardShelfProvider, type ShelfBackend } from "@/features/collection/shelf/CardShelfProvider";
import type { ShelfFilter } from "@/features/collection/shelf/shelf";
import { CardGrid } from "@/features/collection/CardGrid";
import { CollectionSidebar } from "@/features/collection/CollectionSidebar";
import { CollectionToolbar } from "@/features/collection/CollectionToolbar";
import { StarterMissionBanner } from "@/features/collection/StarterMissionBanner";
import { CardDetailModal } from "@/features/collection/card-detail/CardDetailModal";
import { SurplusResaleDialog } from "@/features/collection/SurplusResaleDialog";
import { surplusPlan } from "@/features/collection/recycleValue";
import surplusStyles from "@/features/collection/SurplusResale.module.css";
import { playButtonClick } from "@/lib/sound";
import { useCardBrowser } from "@/features/collection/useCardBrowser";
import { CandleToy } from "@/features/shell/CandleToy";
import { GameScreen } from "@/features/shell/GameScreen";
import styles from "@/features/collection/CardBrowser.module.css";
import collectionBook from "@/features/collection/CollectionBook.module.css";
import game from "@/features/shell/GameScreen.module.css";
import book from "@/features/decks/DeckEditorBook.module.css";
import { BookSearch } from "@/features/decks/BookSearch";

interface CollectionScreenProps {
  isSignedIn: boolean;
  /**
   * `true` quand la PREMIÈRE MISSION est accomplie (tutoriel terminé ou
   * passé, trois starters débloqués) : la Collection l'annonce, une fois
   * par compte (`StarterMissionBanner`). Remplace l'invite de premier deck
   * gratuit (15/10/2026).
   */
  showStarterMission?: boolean;
  /** Cartes possédées (`player_cards.card_id`, quantité > 0). Ignoré si `isSignedIn` est `false`. */
  ownedCardIds: string[];
  /** Exemplaires possédés par carte — affichés en pastille sous chaque carte possédée. */
  ownedCounts: Record<string, number>;
  /** Finitions TRÈS rares possédées, par carte (16/10/2026). Absent : aucune. */
  ownedFinishes?: Record<string, Partial<Record<RareCardFinish, number>>>;
  /** Ouvrir la grille sur les favoris ou un carnet (`/collection?carnet=…`, depuis le mur des carnets). */
  openShelf?: ShelfFilter;
  /** Étagère en mémoire du laboratoire `/game/carnets-preview` ; absente : le compte. */
  shelfBackend?: ShelfBackend;
}

/** Référence stable : un `{}` neuf à chaque rendu relancerait les mémos des finitions. */
const AUCUNE_FINITION: Record<string, Partial<Record<RareCardFinish, number>>> = {};

/** Finitions rares possédées d'une carte, de la moins à la plus rare. */
function finitionsPossedees(quantites: Partial<Record<RareCardFinish, number>> | undefined): RareCardFinish[] {
  return RARE_CARD_FINISHES.filter((f) => (quantites?.[f] ?? 0) > 0);
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
 * Trois plans : le décor du livre en plein écran (`--screen-backdrop`,
 * posé par `GameScreen.module.css`), la colonne de filtres à gauche, la
 * grille de cartes à droite. Le bandeau de navigation reste celui de la
 * coquille partagée.
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
function CollectionScreenBody({ isSignedIn, ownedCardIds, ownedCounts, ownedFinishes = AUCUNE_FINITION, showStarterMission = false, openShelf }: CollectionScreenProps) {
  const owned = useMemo(() => (isSignedIn ? new Set(ownedCardIds) : null), [isSignedIn, ownedCardIds]);
  const browser = useCardBrowser({ owned, persistKey: "collection" });
  // FINITIONS (16/10/2026) : le filtre ne garde que les cartes possédées dans
  // la finition choisie, et les montre ainsi ; sans filtre, chaque carte se
  // montre dans la plus rare de ses finitions.
  const [finishFilter, setFinishFilter] = useState<RareCardFinish | null>(null);
  const shownCards = useMemo(
    () => (finishFilter ? browser.cards.filter((def) => (ownedFinishes[def.id]?.[finishFilter] ?? 0) > 0) : browser.cards),
    [browser.cards, finishFilter, ownedFinishes]
  );
  const finishCounts = useMemo(() => {
    const counts = Object.fromEntries(RARE_CARD_FINISHES.map((f) => [f, 0])) as Record<RareCardFinish, number>;
    for (const def of browser.cards) for (const f of finitionsPossedees(ownedFinishes[def.id])) counts[f] += 1;
    return counts;
  }, [browser.cards, ownedFinishes]);
  /** Exemplaires Classiques : le total moins ceux d'une finition rare. */
  const classicCount = useCallback(
    (cardId: string) => {
      const rares = Object.values(ownedFinishes[cardId] ?? {}).reduce((sum, n) => sum + (n ?? 0), 0);
      return Math.max(0, (ownedCounts[cardId] ?? 0) - rares);
    },
    [ownedCounts, ownedFinishes]
  );
  // Une cellule par finition possédée, APRÈS la Classique — jamais empilées
  // ensemble. Une carte possédée seulement en finition rare n'a pas de cellule
  // Classique ; le filtre « Finition » ne montre que la sienne.
  const finishesFor = useCallback(
    (def: CardDefinition): CardFinish[] => {
      if (finishFilter) return [finishFilter];
      const rares = finitionsPossedees(ownedFinishes[def.id]);
      if (rares.length === 0) return ["classique"];
      return classicCount(def.id) > 0 ? ["classique", ...rares] : rares;
    },
    [finishFilter, ownedFinishes, classicCount]
  );
  const [detailCardId, setDetailCardId] = useState<string | null>(null);
  // La finition de la cellule touchée : la fiche s'ouvre sur CET exemplaire.
  const [detailFinish, setDetailFinish] = useState<CardFinish | undefined>(undefined);
  const openDetail = useCallback((cardId: string, finish?: CardFinish) => {
    setDetailCardId(cardId);
    setDetailFinish(finish);
  }, []);
  const stepDetail = (delta: 1 | -1) => {
    setDetailFinish(undefined);
    setDetailCardId((id) => (id ? browser.relativeCardId(id, delta) : id));
  };
  const [surplusOpen, setSurplusOpen] = useState(false);
  // Figé à l'ouverture : le récapitulatif confirmé ne bouge pas sous les yeux
  // quand la collection est relue après la vente.
  const [surplusLines, setSurplusLines] = useState<ReturnType<typeof surplusPlan>>([]);
  const surplus = useMemo(() => (isSignedIn ? surplusPlan(ownedCounts) : []), [isSignedIn, ownedCounts]);
  const surplusCount = surplus.reduce((sum, line) => sum + line.quantity, 0);

  // Même pastille que la quantité du Deck Builder, ancrée au pied de la
  // carte. Rien sur une carte non possédée : l'estompage le dit déjà.
  // Chaque cellule compte SES exemplaires : la Classique sans les finitions rares, une finition les siens.
  const renderOwnedCount = useCallback(
    (def: CardDefinition, finish?: CardFinish) => {
      const count = finish && finish !== "classique" ? (ownedFinishes[def.id]?.[finish] ?? 0) : classicCount(def.id) || (ownedCounts[def.id] ?? 0);
      if (!isSignedIn || count <= 0) return null;
      return (
        <span className={styles.ownedCount} aria-label={`${count} exemplaire${count > 1 ? "s" : ""} possédé${count > 1 ? "s" : ""}`}>
          <span className={styles.ownedCountTimes} aria-hidden>×</span>
          {count}
        </span>
      );
    },
    [isSignedIn, ownedCounts, ownedFinishes, classicCount]
  );

  const surplusButton = isSignedIn ? (
    <button
      type="button"
      className={`${surplusStyles.button} ${book.surplusButton}`}
      disabled={surplusCount === 0}
      title={surplusCount === 0 ? "Aucune carte au-delà du maximum d'un deck" : "Revendre les exemplaires au-delà du maximum d'un deck"}
      onClick={() => {
        playButtonClick();
        setSurplusLines(surplus);
        setSurplusOpen(true);
      }}
    >
      {/* `small`, pas `span` : un `span` enfant direct est la pastille du compte.
          Sur téléphone, « le surplus » s'efface (le bouton passait sous le bord). */}
      Revendre<small className={book.surplusLong}> le surplus</small>
      {surplusCount > 0 && <span className={surplusStyles.buttonCount}>{surplusCount}</span>}
    </button>
  ) : undefined;

  // La bougie seule (plus de tasse de café, retour du 28/09/2026), agrandie,
  // et la lueur vacillante de sa flamme. Elle a SA place dans la barre de la
  // grille, entre la recherche et le tri : plus grande, posée par-dessus, elle
  // masquait le tri.
  // On la souffle et on la rallume (`CandleToy`) : ses deux lueurs
  // s'éteignent avec elle.
  const candle = (
    <span className={collectionBook.candleSlot}>
      <CandleToy className={collectionBook.candle}>
        <span className={collectionBook.candleGlow} aria-hidden />
        <span className={collectionBook.candleCore} aria-hidden />
      </CandleToy>
    </span>
  );

  return (
    <GameScreen active="collection">
      <div
        className={`${styles.workspace} ${book.workspace} ${book.collection} ${collectionBook.book}`}
        data-drawer={browser.drawerOpen ? "open" : "closed"}
      >
        <button
          type="button"
          className={styles.drawerScrim}
          aria-label="Fermer les filtres"
          onClick={() => browser.setDrawerOpen(false)}
        />

        <aside className={`${game.panel} ${styles.sidebar} ${book.frame} ${book.left}`} aria-label="Filtres de la collection">
          <CollectionSidebar
            filters={browser.filters}
            onChange={browser.patchFilters}
            onReset={browser.resetFilters}
            owned={browser.ownedForFilters}
            showOwnership={isSignedIn}
            shelfCards={browser.shelfCards}
            finishFilter={isSignedIn ? { active: finishFilter, counts: finishCounts, onSelect: setFinishFilter } : undefined}
          />
        </aside>

        <main className={`${game.panel} ${styles.main} ${book.frame} ${book.center}`}>
          <CollectionToolbar
            count={shownCards.length}
            sort={browser.sort}
            onSortChange={browser.setSort}
            onOpenFilters={() => browser.setDrawerOpen((open) => !open)}
            activeFilterCount={browser.activeFilterCount}
            search={
              <>
                <BookSearch value={browser.filters.search} onChange={(search) => browser.patchFilters({ search })} />
                {candle}
              </>
            }
            // L'effectif seul sur son onglet, « Revendre le surplus » en bout de barre.
            extra={surplusButton}
          />

          <CardGrid
            cards={shownCards}
            finishesFor={isSignedIn ? finishesFor : undefined}
            onCardClick={openDetail}
            // Ce que le joueur possède, PAS ce que le filtre laisse passer :
            // sinon une recherche sans résultat afficherait « tu ne possèdes
            // aucune carte » à un joueur qui en a.
            hasAnyCards={!isSignedIn || ownedCardIds.length > 0}
            owned={owned}
            cellExtras={renderOwnedCount}
          />
        </main>
      </div>

      {/* Le décor de la table, le même que celui de l'Éditeur. */}
      {/* eslint-disable-next-line @next/next/no-img-element -- décor peint, positionné à la main */}
      <img className={book.decor} src="/assets/ui/accessoires/longue-vue.webp" alt="" draggable={false} />

      {isSignedIn && <StarterMissionBanner show={showStarterMission} />}

      {surplusOpen && <SurplusResaleDialog lines={surplusLines} onClose={() => setSurplusOpen(false)} />}

      {detailCardId && (
        <CardDetailModal
          cardId={detailCardId}
          onClose={() => setDetailCardId(null)}
          ownedFinishes={isSignedIn ? finitionsPossedees(ownedFinishes[detailCardId]) : undefined}
          initialFinish={detailFinish}
          onPrevious={browser.cards.length > 1 ? () => stepDetail(-1) : undefined}
          onNext={browser.cards.length > 1 ? () => stepDetail(1) : undefined}
          onShowCard={(id) => openDetail(id)}
          ownedCount={isSignedIn ? (ownedCounts[detailCardId] ?? 0) : undefined}
        />
      )}
    </GameScreen>
  );
}
