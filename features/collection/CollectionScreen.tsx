"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CardDefinition } from "@/game";
import { RARE_CARD_FINISHES } from "@/game/cosmetics/finishes";
import { RARE_CARD_ARTWORKS } from "@/game/cosmetics/artworks";
import { obtainableArtworksOf } from "@/game/boosters/boosterArtworks";
import type { GridEdition } from "@/features/collection/CardGrid";
import { CORE_SET } from "@/game";
import { matchesFilters } from "@/features/collection/collectionFilters";
import { CLASSIC_EDITION, editionRank, type CardEdition, type OwnedEdition } from "@/game/cosmetics/editions";
import type { EditionFilter } from "@/features/collection/CollectionSidebar";
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
  /** ÉDITIONS rares possédées (illustration × finition), par carte (Collection visuelle V2). Absent : aucune. */
  ownedEditions?: Record<string, OwnedEdition[]>;
  /** Édition choisie pour la partie, par carte. Absent : la Classique partout. */
  displayedEditions?: Record<string, CardEdition>;
  /** Admin (ou développement local) : la fiche montre Illustrations, Finitions et « En partie ». */
  showEditionControls?: boolean;
  /** Ouvrir la grille sur les favoris ou un carnet (`/collection?carnet=…`, depuis le mur des carnets). */
  openShelf?: ShelfFilter;
  /** Étagère en mémoire du laboratoire `/game/carnets-preview` ; absente : le compte. */
  shelfBackend?: ShelfBackend;
}

/** Références stables : un `{}` neuf à chaque rendu relancerait les mémos des éditions. */
const AUCUNE_EDITION: Record<string, OwnedEdition[]> = {};
const AUCUN_AFFICHAGE: Record<string, CardEdition> = {};

/** Éditions rares possédées d'une carte, de la moins à la plus rare. */
function editionsPossedees(liste: OwnedEdition[] | undefined): OwnedEdition[] {
  return (liste ?? []).filter((e) => e.quantity > 0).sort((a, b) => editionRank(a) - editionRank(b));
}

/**
 * Illustrations qu'un booster propose pour cette carte et que le joueur n'a
 * dans AUCUNE finition : elles s'affichent estompées, comme une carte
 * manquante — la collection montre aussi ce qui reste à trouver.
 */
function illustrationsManquantes(cardId: string, possedees: OwnedEdition[]): GridEdition[] {
  return obtainableArtworksOf(cardId)
    .filter((artwork) => !possedees.some((e) => e.artwork === artwork))
    .map((artwork) => ({ artwork, finish: "classique" as const, missing: true }));
}

/** L'édition répond-elle au filtre « Édition » (une illustration, ou une finition) ? */
function matchesFilter(edition: CardEdition, filter: EditionFilter): boolean {
  return filter.kind === "artwork" ? edition.artwork === filter.value : edition.finish === filter.value;
}

/** Les filtres « Édition », dans l'ordre de la colonne : illustrations, puis finitions. */
const EDITION_FILTERS: EditionFilter[] = [
  ...RARE_CARD_ARTWORKS.map((value) => ({ kind: "artwork" as const, value })),
  ...RARE_CARD_FINISHES.map((value) => ({ kind: "finish" as const, value })),
];

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
function CollectionScreenBody({
  isSignedIn,
  ownedCardIds,
  ownedCounts,
  ownedEditions = AUCUNE_EDITION,
  displayedEditions = AUCUN_AFFICHAGE,
  showEditionControls = false,
  showStarterMission = false,
  openShelf,
}: CollectionScreenProps) {
  const owned = useMemo(() => (isSignedIn ? new Set(ownedCardIds) : null), [isSignedIn, ownedCardIds]);
  // Cartes possédées à qui il manque une Styled / Full-Art obtenable : encore « à compléter ».
  const incomplete = useMemo(() => {
    const set = new Set<string>();
    if (!owned) return set;
    for (const cardId of owned) if (illustrationsManquantes(cardId, editionsPossedees(ownedEditions[cardId])).length > 0) set.add(cardId);
    return set;
  }, [owned, ownedEditions]);
  const browser = useCardBrowser({ owned, persistKey: "collection", incomplete });
  // ÉDITIONS (Collection visuelle V2) : le filtre ne garde que les cartes
  // possédées dans l'illustration ou la finition choisie, et ne montre que
  // ces éditions ; sans filtre, chaque édition possédée a sa cellule.
  const [editionFilter, setEditionFilter] = useState<EditionFilter | null>(null);
  const shownCards = useMemo(
    () =>
      editionFilter
        ? browser.cards.filter((def) => {
            const possedees = editionsPossedees(ownedEditions[def.id]);
            return [...possedees, ...illustrationsManquantes(def.id, possedees)].some((e) => matchesFilter(e, editionFilter));
          })
        : browser.cards,
    [browser.cards, editionFilter, ownedEditions]
  );
  const editionCounts = useMemo(() => {
    const counts = EDITION_FILTERS.map(() => 0);
    for (const def of browser.cards) {
      const editions = editionsPossedees(ownedEditions[def.id]);
      EDITION_FILTERS.forEach((filtre, index) => {
        if (editions.some((e) => matchesFilter(e, filtre))) counts[index]! += 1;
      });
    }
    return EDITION_FILTERS.map((filter, index) => ({ filter, count: counts[index]! }));
  }, [browser.cards, ownedEditions]);
  /** Exemplaires Classiques : le total moins ceux d'une édition rare. */
  const classicCount = useCallback(
    (cardId: string) => {
      const rares = (ownedEditions[cardId] ?? []).reduce((sum, e) => sum + e.quantity, 0);
      return Math.max(0, (ownedCounts[cardId] ?? 0) - rares);
    },
    [ownedCounts, ownedEditions]
  );
  // Une cellule par édition possédée, APRÈS la Classique — jamais empilées
  // ensemble. Une carte possédée seulement en édition rare n'a pas de cellule
  // Classique ; le filtre « Édition » ne montre que les siennes.
  const editionsFor = useCallback(
    (def: CardDefinition): GridEdition[] => {
      const rares = editionsPossedees(ownedEditions[def.id]);
      // « Possédées » : rien d'estompé. Sinon, les illustrations manquantes suivent la carte.
      const manquantes = browser.filters.ownership === "owned" ? [] : illustrationsManquantes(def.id, rares);
      if (editionFilter) return [...rares, ...manquantes].filter((e) => matchesFilter(e, editionFilter));
      // « Manquantes » sur une carte possédée : seulement ce qui reste à trouver.
      if (browser.filters.ownership === "missing" && owned?.has(def.id)) return manquantes;
      const base = rares.length === 0 || classicCount(def.id) > 0 ? [CLASSIC_EDITION, ...rares] : rares;
      return [...base, ...manquantes];
    },
    [editionFilter, ownedEditions, classicCount, browser.filters.ownership, owned]
  );
  // « Statut de collection » en PIÈCES : chaque carte, plus chaque illustration
  // obtenable — sinon une collection complète en cartes s'affichait finie
  // alors qu'aucune Styled n'était tirée. Mêmes autres filtres que la grille.
  const ownershipCounts = useMemo(() => {
    const counts = { all: 0, owned: 0, missing: 0 };
    if (!owned) return counts;
    for (const def of CORE_SET) {
      if (!matchesFilters(def, browser.filters, owned, "ownership", browser.shelfCards)) continue;
      const illustrations = obtainableArtworksOf(def.id);
      const possedees = editionsPossedees(ownedEditions[def.id]);
      const illustrationsPossedees = illustrations.filter((artwork) => possedees.some((e) => e.artwork === artwork)).length;
      const carte = owned.has(def.id) ? 1 : 0;
      counts.all += 1 + illustrations.length;
      counts.owned += carte + illustrationsPossedees;
      counts.missing += 1 - carte + illustrations.length - illustrationsPossedees;
    }
    return counts;
  }, [owned, ownedEditions, browser.filters, browser.shelfCards]);

  const [detailCardId, setDetailCardId] = useState<string | null>(null);
  // L'édition de la cellule touchée : la fiche s'ouvre sur CET exemplaire.
  const [detailEdition, setDetailEdition] = useState<CardEdition | undefined>(undefined);
  const openDetail = useCallback((cardId: string, edition?: CardEdition) => {
    setDetailCardId(cardId);
    setDetailEdition(edition);
  }, []);
  const stepDetail = (delta: 1 | -1) => {
    setDetailEdition(undefined);
    setDetailCardId((id) => (id ? browser.relativeCardId(id, delta) : id));
  };
  const [surplusOpen, setSurplusOpen] = useState(false);
  // Figé à l'ouverture : le récapitulatif confirmé ne bouge pas sous les yeux
  // quand la collection est relue après la vente.
  const [surplusLines, setSurplusLines] = useState<ReturnType<typeof surplusPlan>>([]);
  // Le surplus ne vend que des CLASSIQUES : une édition rare ne part jamais
  // dans une revente groupée (sa valeur propre viendra avec la revente par édition).
  const classicCounts = useMemo(
    () => Object.fromEntries(Object.keys(ownedCounts).map((cardId) => [cardId, classicCount(cardId)])),
    [ownedCounts, classicCount]
  );
  const surplus = useMemo(() => (isSignedIn ? surplusPlan(classicCounts) : []), [isSignedIn, classicCounts]);
  const surplusCount = surplus.reduce((sum, line) => sum + line.quantity, 0);

  // Même pastille que la quantité du Deck Builder, ancrée au pied de la
  // carte. Rien sur une carte non possédée : l'estompage le dit déjà.
  // Chaque cellule compte SES exemplaires : la Classique sans les éditions rares, une édition les siens.
  const renderOwnedCount = useCallback(
    (def: CardDefinition, edition?: CardEdition) => {
      const rare = edition !== undefined && (edition.artwork !== "classique" || edition.finish !== "classique");
      const count = rare
        ? (ownedEditions[def.id]?.find((e) => e.artwork === edition.artwork && e.finish === edition.finish)?.quantity ?? 0)
        : classicCount(def.id) || (ownedCounts[def.id] ?? 0);
      if (!isSignedIn || count <= 0) return null;
      return (
        <span className={styles.ownedCount} aria-label={`${count} exemplaire${count > 1 ? "s" : ""} possédé${count > 1 ? "s" : ""}`}>
          <span className={styles.ownedCountTimes} aria-hidden>×</span>
          {count}
        </span>
      );
    },
    [isSignedIn, ownedCounts, ownedEditions, classicCount]
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
            ownershipCounts={isSignedIn ? ownershipCounts : undefined}
            shelfCards={browser.shelfCards}
            editionFilter={isSignedIn ? { active: editionFilter, options: editionCounts, onSelect: setEditionFilter } : undefined}
          />
        </aside>

        <main className={`${game.panel} ${styles.main} ${book.frame} ${book.center}`}>
          <CollectionToolbar
            // L'effectif compte les CASES : une carte et chacune de ses éditions affichées.
            count={isSignedIn ? shownCards.reduce((sum, def) => sum + editionsFor(def).length, 0) : shownCards.length}
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
            editionsFor={isSignedIn ? editionsFor : undefined}
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
          ownedEditions={isSignedIn ? editionsPossedees(ownedEditions[detailCardId]) : undefined}
          initialEdition={detailEdition}
          displayedEdition={isSignedIn ? (displayedEditions[detailCardId] ?? CLASSIC_EDITION) : undefined}
          showEditionControls={showEditionControls}
          onPrevious={browser.cards.length > 1 ? () => stepDetail(-1) : undefined}
          onNext={browser.cards.length > 1 ? () => stepDetail(1) : undefined}
          onShowCard={(id) => openDetail(id)}
          ownedCount={isSignedIn ? (ownedCounts[detailCardId] ?? 0) : undefined}
          showcase={isSignedIn}
        />
      )}
    </GameScreen>
  );
}
