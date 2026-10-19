"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getCardDefinition, getMaxCopies, RULES, type CardDefinition, type DeckStyleId } from "@/game";
import { deleteDeck, duplicateDeck, saveDeck } from "@/app/decks/actions";
import { CardGrid } from "@/features/collection/CardGrid";
import { CollectionSidebar } from "@/features/collection/CollectionSidebar";
import { CollectionToolbar } from "@/features/collection/CollectionToolbar";
import { CardDetailModal } from "@/features/collection/card-detail/CardDetailModal";
import { CardShelfProvider } from "@/features/collection/shelf/CardShelfProvider";
import { useCardBrowser } from "@/features/collection/useCardBrowser";
import { DEFAULT_SHIP_ID } from "@/features/decks/constants";
import { countInDeck, deckRuleIssue, missingCopiesMessage, ownedPartOf } from "@/features/decks/deckComposition";
import { DeckArtPicker } from "@/features/decks/DeckArtPicker";
import type { ChosenArtwork } from "@/game/cosmetics/artworks";
import { CLASSIC_EDITION, editionKey, editionLabel, editionRank, isClassicEdition, type CardEdition, type OwnedEdition } from "@/game/cosmetics/editions";
import { copiesOfEdition, countsFromRareCopies, ownedOfEdition, type DeckRareCopies } from "@/features/decks/deckEditions";
import type { GridEdition } from "@/features/collection/CardGrid";
import { DeckIdentity } from "@/features/decks/DeckIdentity";
import { DeckNamePlate } from "@/features/decks/DeckNamePlate";
import { DeckListPanel } from "@/features/decks/DeckListPanel";
import { DeleteDeckDialog } from "@/features/decks/DeleteDeckDialog";
import { CandleToy } from "@/features/shell/CandleToy";
import { Dialog } from "@/features/shell/Dialog";
import { GameScreen } from "@/features/shell/GameScreen";
import { ShipPicker } from "@/features/ships/ShipPicker";
import browser from "@/features/collection/CardBrowser.module.css";
import styles from "@/features/decks/DeckBuilder.module.css";
import game from "@/features/shell/GameScreen.module.css";
import { playDeckAddCard, playDeckRemoveCard } from "@/lib/sound";
import book from "@/features/decks/DeckEditorBook.module.css";
import { BookSearch } from "@/features/decks/BookSearch";

const DRAG_MIME = "text/tidebound-card-id";

/** Hors du composant : une référence stable, pour ne pas re-rendre toutes les cellules mémoïsées de `CardGrid`. */
function handleCardDragStart(def: CardDefinition, event: React.DragEvent<HTMLButtonElement>) {
  event.dataTransfer.setData(DRAG_MIME, def.id);
}

/** Sérialisation grossière pour détecter des modifications non sauvegardées (nom + Navire + multiset de cartes, ordre des exemplaires sans importance). */
function serializeState(
  name: string,
  shipId: string,
  cardIds: string[],
  artCardId: string | null,
  description: string,
  artArtwork: ChosenArtwork = "classique",
  rareCopies: DeckRareCopies = {}
): string {
  const editions = countsFromRareCopies(rareCopies)
    .map((count) => `${count.cardId}/${count.artwork}/${count.finish}×${count.quantity}`)
    .sort()
    .join(",");
  return `${name}|${shipId}|${artCardId ?? ""}:${artArtwork}|${description}|${[...cardIds].sort().join(",")}|${editions}`;
}

export interface DeckEditorInitialData {
  id: string;
  name: string;
  shipId: string;
  cardIds: string[];
  /** Illustration choisie, ou `null` : la règle par défaut reprend alors la main. */
  artCardId: string | null;
  /** Illustration de la carte choisie (Classique ou Styled débloquée). */
  artArtwork?: ChosenArtwork;
  /** Résumé libre affiché sur la fiche du deck ; vide = phrase générique. */
  description?: string;
  /** Style choisi par le joueur, ou `null`/absent : l'en-tête le déduit alors des cartes. */
  styleId?: DeckStyleId | null;
  /** Éditions RARES des exemplaires, par carte (une entrée par copie) ; le reste est Classique. */
  rareCopies?: DeckRareCopies;
}

interface DeckEditorScreenProps {
  ownedCardIds: string[];
  /** Exemplaires possédés par carte : un deck n'en embarque jamais plus (`resolveMatchDeck` le vérifie à l'entrée en partie). */
  ownedCounts: Record<string, number>;
  /** Cartes dont la Styled est débloquée (Styled ou Full-Art obtenue) : choisissables comme illustration du deck. */
  styledCardIds?: string[];
  /** Éditions rares possédées, par carte : chacune a sa cellule dans la grille, ajoutable au deck. */
  ownedEditions?: Readonly<Record<string, OwnedEdition[]>>;
  /** `null` = création d'un nouveau deck (pas encore persisté). */
  initialDeck: DeckEditorInitialData | null;
}

/** Ce que l'utilisateur voulait faire quand on l'a arrêté pour des modifications non sauvegardées. */
type PendingLeave = { kind: "new" } | { kind: "navigate"; href: string } | null;

/**
 * Deck Builder — la Collection en mode construction.
 *
 * Colonne de gauche : l'identité du deck (Navire dans son cadre, nom,
 * changement de Navire, retour) puis les filtres de la Collection. Centre :
 * les cartes disponibles. Droite : le deck seul (effectif, composition,
 * validité, sauvegarde). Le Navire fait partie du deck et est persisté
 * avec lui (`saveDeck` → `ship_id`).
 *
 * Même navigateur de cartes que `CollectionScreen` (`useCardBrowser`,
 * `CollectionSidebar`, `CollectionToolbar`, `CardGrid`, même feuille de
 * style), avec une colonne de plus à droite : le deck (`DeckListPanel`).
 * Cliquer une carte de la grille l'ajoute ; la grille porte en plus, sur
 * chaque carte, sa quantité dans le deck et de quoi la retirer ou la
 * consulter. Le glisser-déposer vers la liste reste possible, en
 * complément, jamais en obligation.
 *
 * Les règles viennent toutes de `@/game` : taille légale
 * (`RULES.DECK_SIZE_*`), limite par carte (`getMaxCopies`), contrôle
 * complet (`validateDeckList`, la même fonction que le serveur). L'éditeur
 * ne fait qu'empêcher d'ajouter au-delà de la limite d'une carte et
 * d'ajouter une carte qu'on ne possède pas ; un deck incomplet se
 * sauvegarde quand même, marqué non jouable côté serveur.
 */
export function DeckEditorScreen(props: DeckEditorScreenProps) {
  // L'étagère (favoris, carnets) sert aussi à construire : filtrer la grille
  // sur un carnet, c'est partir de ses idées de deck. Un visiteur n'en a pas.
  return (
    <CardShelfProvider initialShelf={props.ownedCardIds.length > 0 ? undefined : null}>
      <DeckEditorScreenBody {...props} />
    </CardShelfProvider>
  );
}

/** Référence stable : un `{}` neuf à chaque rendu relancerait les mémos des éditions. */
const AUCUNE_EDITION: Readonly<Record<string, OwnedEdition[]>> = {};

function DeckEditorScreenBody({ ownedCardIds, ownedCounts, styledCardIds = [], ownedEditions = AUCUNE_EDITION, initialDeck }: DeckEditorScreenProps) {
  const router = useRouter();
  const [deckId, setDeckId] = useState<string | null>(initialDeck?.id ?? null);
  const [name, setName] = useState(initialDeck?.name ?? "Nouveau deck");
  const [shipId, setShipId] = useState(initialDeck?.shipId ?? DEFAULT_SHIP_ID);
  const [shipPickerOpen, setShipPickerOpen] = useState(false);
  const [cardIds, setCardIds] = useState<string[]>(initialDeck?.cardIds ?? []);
  /** Illustration choisie, ou `null` : la carte la plus chère du deck sert alors. */
  const [artCardId, setArtCardId] = useState<string | null>(initialDeck?.artCardId ?? null);
  const [artArtwork, setArtArtwork] = useState<ChosenArtwork>(initialDeck?.artArtwork ?? "classique");
  /** Éditions RARES des exemplaires du deck (une variante par copie) ; les autres copies sont Classiques. */
  const [rareCopies, setRareCopies] = useState<Record<string, CardEdition[]>>(() => ({ ...(initialDeck?.rareCopies ?? {}) }) as Record<string, CardEdition[]>);
  // Vide par défaut : la fiche retombe alors sur sa phrase générique, et le
  // reste de ce qu'elle montre se déduit des cartes.
  const [description, setDescription] = useState(initialDeck?.description ?? "");
  const [artPickerOpen, setArtPickerOpen] = useState(false);
  /** Filtre « déjà dans le deck » (retour du 12/10/2026) : la grille ne montre que les cartes du deck en cours. */
  const [inDeckOnly, setInDeckOnly] = useState(false);
  const [savedSnapshot, setSavedSnapshot] = useState(() => serializeState(name, shipId, cardIds, artCardId, description, artArtwork, rareCopies));
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [pendingLeave, setPendingLeave] = useState<PendingLeave>(null);
  const [detailCardId, setDetailCardId] = useState<string | null>(null);
  /** L'édition de la cellule dont la fiche est ouverte : la fiche montre CETTE variante. */
  const [detailEdition, setDetailEdition] = useState<CardEdition | undefined>(undefined);
  const [deckOpen, setDeckOpen] = useState(false);
  const savedFlashTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Possession : un joueur non connecté peut composer (le serveur refusera
  // la sauvegarde avec un message clair), mais n'a pas de possession
  // connue — toutes les cartes lui sont alors ouvertes.
  const isSignedIn = ownedCardIds.length > 0;
  const owned = useMemo(() => (isSignedIn ? new Set(ownedCardIds) : null), [isSignedIn, ownedCardIds]);
  const initialFilters = useMemo(() => (isSignedIn ? { ownership: "owned" as const } : {}), [isSignedIn]);
  const cardBrowser = useCardBrowser({ owned, initialFilters, persistKey: "editeur-de-deck" });
  const inDeck = useMemo(() => new Set(cardIds), [cardIds]);
  const shownCards = useMemo(
    () => (inDeckOnly ? cardBrowser.cards.filter((card) => inDeck.has(card.id)) : cardBrowser.cards),
    [inDeckOnly, cardBrowser.cards, inDeck]
  );

  const isDirty = serializeState(name, shipId, cardIds, artCardId, description, artArtwork, rareCopies) !== savedSnapshot;
  const issue = useMemo(() => {
    const rule = deckRuleIssue(cardIds, shipId, name);
    if (rule || !isSignedIn) return rule;
    // Même contrôle que le serveur : un exemplaire de plus que la collection
    // rend le deck injouable (typiquement après une revente).
    const { missing } = ownedPartOf(cardIds, ownedCounts);
    return missing.length > 0 ? missingCopiesMessage(missing) : null;
  }, [cardIds, shipId, name, isSignedIn, ownedCounts]);
  /** Un deck encore hors des règles : sauvegardable, mais comme BROUILLON — c'est ce que le dialogue de sortie propose. */
  const isDraft = issue !== null;

  /** Exemplaires qu'un deck peut embarquer : la limite de la carte, et jamais plus que la collection n'en compte. */
  const playableCopies = useCallback(
    (def: CardDefinition) => (owned ? Math.min(getMaxCopies(def), ownedCounts[def.id] ?? 0) : getMaxCopies(def)),
    [owned, ownedCounts]
  );

  // Garde-fous, tous tirés des règles du projet : l'exemplaire est possédé,
  // la limite de la carte (toutes éditions confondues) n'est pas atteinte, le
  // deck n'a pas déjà sa taille maximale — et une édition rare n'entre pas
  // plus de fois qu'on n'en possède (`deckEditions`).
  const canAdd = useCallback(
    (def: CardDefinition, edition: CardEdition = CLASSIC_EDITION) =>
      (owned ? owned.has(def.id) : true) &&
      countInDeck(cardIds, def.id) < playableCopies(def) &&
      cardIds.length < RULES.DECK_SIZE_MAX &&
      copiesOfEdition(cardIds, rareCopies, def.id, edition) < ownedOfEdition(ownedEditions, def.id, edition),
    [owned, cardIds, playableCopies, rareCopies, ownedEditions]
  );

  const addCard = useCallback(
    (cardId: string, edition: CardEdition = CLASSIC_EDITION) => {
      let def: CardDefinition;
      try {
        def = getCardDefinition(cardId);
      } catch {
        return;
      }
      if (!canAdd(def, edition)) return;
      // Le son du deck vit ICI, au seul point où une carte entre (clic de la
      // grille, bouton +, glisser-déposer) : il remplace le clic de bouton,
      // et un ajout refusé (deck plein, exemplaires épuisés) reste muet.
      playDeckAddCard();
      setCardIds((current) => [...current, cardId]);
      if (!isClassicEdition(edition)) setRareCopies((current) => ({ ...current, [cardId]: [...(current[cardId] ?? []), edition] }));
    },
    [canAdd]
  );

  /**
   * Retire un exemplaire. Avec une édition (bouton − d'une cellule) : une
   * copie de CETTE édition. Sans (croix de la liste) : une Classique d'abord,
   * sinon l'édition rare la moins rare.
   */
  const removeCard = useCallback(
    (cardId: string, edition?: CardEdition) => {
      // Même règle que `addCard` : le son au point unique de sortie, et
      // seulement si un exemplaire de cette édition était dans le deck.
      if (!cardIds.includes(cardId)) return;
      const rares = rareCopies[cardId] ?? [];
      const classiques = countInDeck(cardIds, cardId) - rares.length;
      let rareToRemove: CardEdition | null = null;
      if (edition && !isClassicEdition(edition)) {
        rareToRemove = rares.find((rare) => editionKey(rare) === editionKey(edition)) ?? null;
        if (!rareToRemove) return;
      } else if (edition && classiques <= 0) {
        return;
      } else if (!edition && classiques <= 0) {
        rareToRemove = [...rares].sort((a, b) => editionRank(a) - editionRank(b))[0] ?? null;
      }
      playDeckRemoveCard();
      setCardIds((current) => {
        const index = current.lastIndexOf(cardId);
        return index === -1 ? current : current.filter((_, i) => i !== index);
      });
      if (rareToRemove) {
        const key = editionKey(rareToRemove);
        setRareCopies((current) => {
          const list = [...(current[cardId] ?? [])];
          const index = list.findIndex((rare) => editionKey(rare) === key);
          if (index !== -1) list.splice(index, 1);
          const next = { ...current };
          if (list.length > 0) next[cardId] = list;
          else delete next[cardId];
          return next;
        });
      }
    },
    [cardIds, rareCopies]
  );

  /**
   * Une cellule par édition possédée : la Classique, puis chaque variante
   * rare, de la moins à la plus rare — chacune ajoutable au deck.
   */
  const editionsFor = useCallback(
    (def: CardDefinition): GridEdition[] => {
      const rares = (ownedEditions[def.id] ?? []).filter((edition) => edition.quantity > 0).sort((a, b) => editionRank(a) - editionRank(b));
      return [CLASSIC_EDITION, ...rares.map((edition) => ({ artwork: edition.artwork, finish: edition.finish }))];
    },
    [ownedEditions]
  );

  async function handleSave(): Promise<boolean> {
    setIsSaving(true);
    setSaveError(null);
    const result = await saveDeck({ id: deckId, name, shipId, cardIds, artCardId, artArtwork, description, editions: countsFromRareCopies(rareCopies) });
    setIsSaving(false);
    if (!result.ok || !result.id) {
      setSaveError(result.error ?? "Échec de la sauvegarde.");
      return false;
    }
    setSavedSnapshot(serializeState(name, shipId, cardIds, artCardId, description, artArtwork, rareCopies));
    if (!deckId) {
      setDeckId(result.id);
      router.replace(`/decks/${result.id}`);
    }
    setSavedFlash(true);
    if (savedFlashTimeout.current) clearTimeout(savedFlashTimeout.current);
    savedFlashTimeout.current = setTimeout(() => setSavedFlash(false), 2000);
    return true;
  }

  function resetToBlankDeck() {
    setDeckId(null);
    setName("Nouveau deck");
    setShipId(DEFAULT_SHIP_ID);
    setCardIds([]);
    setRareCopies({});
    setArtCardId(null);
    setDescription("");
    setSavedSnapshot(serializeState("Nouveau deck", DEFAULT_SHIP_ID, [], null, ""));
    router.push("/decks/nouveau");
  }

  /** Exécute une sortie de l'éditeur, ou la met en attente si le deck a des modifications non sauvegardées. */
  function requestLeave(leave: NonNullable<PendingLeave>) {
    if (isDirty) {
      setPendingLeave(leave);
      return;
    }
    performLeave(leave);
  }

  /**
   * Filtre de navigation du bandeau (onglets ET logo) : tant que le deck a
   * des modifications non enregistrées, tout déplacement ouvre le dialogue
   * au lieu de partir. Sans ça, cliquer « Collection » jetait le travail en
   * cours sans un mot — le garde-fou n'existait que sur « Mes decks » et
   * « Nouveau deck ».
   */
  function handleNavigate(href: string): boolean {
    if (!isDirty) return false;
    setPendingLeave({ kind: "navigate", href });
    return true;
  }

  function performLeave(leave: NonNullable<PendingLeave>) {
    if (leave.kind === "new") resetToBlankDeck();
    else router.push(leave.href);
  }

  async function handleLeaveSave() {
    const leave = pendingLeave;
    const ok = await handleSave();
    // Échec : le dialogue RESTE ouvert, avec le message. Le refermer
    // laisserait le joueur sur l'éditeur en croyant être sauvegardé.
    if (!ok) return;
    setPendingLeave(null);
    if (leave) performLeave(leave);
  }

  function handleLeaveDiscard() {
    const leave = pendingLeave;
    setPendingLeave(null);
    if (leave) performLeave(leave);
  }

  async function handleDuplicate() {
    if (!deckId) return;
    const result = await duplicateDeck(deckId);
    if (result.ok && result.id) router.push(`/decks/${result.id}`);
  }

  async function handleDelete() {
    if (!deckId) return;
    const result = await deleteDeck(deckId);
    setDeleteConfirm(false);
    if (result.ok) router.push("/decks");
  }

  useEffect(
    () => () => {
      if (savedFlashTimeout.current) clearTimeout(savedFlashTimeout.current);
    },
    []
  );

  // Fermeture d'onglet / rechargement avec des modifications en attente :
  // le navigateur demande confirmation. (La navigation par les onglets du
  // bandeau, elle, n'est pas interceptée — voir le rapport.)
  useEffect(() => {
    if (!isDirty) return;
    function warn(event: BeforeUnloadEvent) {
      event.preventDefault();
    }
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [isDirty]);

  const renderCellExtras = useCallback(
    (def: CardDefinition, cellEdition?: CardEdition) => {
      const edition = cellEdition ?? CLASSIC_EDITION;
      const total = countInDeck(cardIds, def.id);
      const ici = copiesOfEdition(cardIds, rareCopies, def.id, edition);
      // La LIMITE DE LA CARTE (toutes éditions confondues), jamais rabotée par
      // la collection : « 2 » pour le Gardien, même si on n'en a qu'un — ce
      // manque se dit à part (« 1 possédée »).
      const limite = getMaxCopies(def);
      const possedees = isClassicEdition(edition) ? (ownedCounts[def.id] ?? 0) : ownedOfEdition(ownedEditions, def.id, edition);
      const locked = owned ? !owned.has(def.id) : false;

      if (locked) return <span className={styles.cellLocked}>Non possédée</span>;

      const variante = isClassicEdition(edition) ? "" : ` (${editionLabel(edition)})`;
      return (
        <span className={styles.cellControls}>
          <span className={styles.cellBar}>
            <button
              type="button"
              className={styles.cellButton}
              disabled={ici === 0}
              onClick={(event) => {
                event.stopPropagation();
                removeCard(def.id, edition);
              }}
              aria-label={`Retirer un exemplaire de ${def.name}${variante}`}
            >
              <svg viewBox="0 0 24 24" fill="none" width="12" height="12" aria-hidden>
                <path d="M6 12h12" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" />
              </svg>
            </button>
            <span
              className={`${styles.cellQty} ${total >= limite ? styles.cellQtyFull : ""}`}
              title={`${ici} de cette édition · ${total} sur ${limite} au plus pour cette carte`}
            >
              {ici}
              <span className={styles.cellQtyMax}>/{limite}</span>
            </span>
            <button
              type="button"
              className={styles.cellButton}
              disabled={!canAdd(def, edition)}
              onClick={(event) => {
                event.stopPropagation();
                addCard(def.id, edition);
              }}
              aria-label={`Ajouter un exemplaire de ${def.name}${variante}`}
            >
              <svg viewBox="0 0 24 24" fill="none" width="12" height="12" aria-hidden>
                <path d="M12 6v12M6 12h12" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" />
              </svg>
            </button>
            <button
              type="button"
              className={styles.cellButton}
              onClick={(event) => {
                event.stopPropagation();
                setDetailCardId(def.id);
                setDetailEdition(isClassicEdition(edition) ? undefined : edition);
              }}
              aria-label={`Voir ${def.name}${variante}`}
            >
              <svg viewBox="0 0 24 24" fill="none" width="12" height="12" aria-hidden>
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth={1.8} />
                <path d="M12 11v5M12 8h.01" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
              </svg>
            </button>
          </span>
          {owned && possedees < limite && (
            <span className={styles.cellOwned}>
              {possedees} possédée{possedees > 1 ? "s" : ""}
            </span>
          )}
        </span>
      );
    },
    [cardIds, rareCopies, owned, ownedCounts, ownedEditions, addCard, removeCard, canAdd]
  );

  return (
    <GameScreen active="decks" onNavigate={handleNavigate}>
      <div
        className={`${browser.workspace} ${styles.workspace} ${book.workspace}`}
        data-columns="3"
        data-drawer={cardBrowser.drawerOpen ? "open" : "closed"}
        data-deck={deckOpen ? "open" : "closed"}
        onDragOver={(event) => {
          // Autorise le dépôt n'importe où sur la colonne de deck, même
          // au-dessus de son en-tête.
          if (event.dataTransfer.types.includes(DRAG_MIME)) event.preventDefault();
        }}
      >
        <button type="button" className={browser.drawerScrim} aria-label="Fermer les filtres" onClick={() => cardBrowser.setDrawerOpen(false)} />
        <button type="button" className={styles.deckScrim} aria-label="Fermer le deck" onClick={() => setDeckOpen(false)} />

        <aside className={`${game.panel} ${browser.sidebar} ${book.frame} ${book.left}`} aria-label="Identité du deck et filtres">
          <DeckIdentity
            shipId={shipId}
            onChangeShip={() => setShipPickerOpen(true)}
            onBack={() => requestLeave({ kind: "navigate", href: "/decks" })}
          />
          <CollectionSidebar
            filters={cardBrowser.filters}
            onChange={cardBrowser.patchFilters}
            onReset={cardBrowser.resetFilters}
            owned={cardBrowser.ownedForFilters}
            showOwnership={isSignedIn}
            showCreateDeck={false}
            shelfCards={cardBrowser.shelfCards}
            order="editeur"
            deckFilter={{ active: inDeckOnly, count: inDeck.size, onToggle: () => setInDeckOnly((on) => !on) }}
          />
        </aside>

        <main className={`${game.panel} ${browser.main} ${book.frame} ${book.center}`}>
          <CollectionToolbar
            count={shownCards.length}
            sort={cardBrowser.sort}
            onSortChange={cardBrowser.setSort}
            onOpenFilters={() => cardBrowser.setDrawerOpen((open) => !open)}
            activeFilterCount={cardBrowser.activeFilterCount}
            search={<BookSearch value={cardBrowser.filters.search} onChange={(search) => cardBrowser.patchFilters({ search })} />}
            extra={
              <button type="button" className={`${game.chipActive} ${styles.deckToggle}`} onClick={() => setDeckOpen((open) => !open)} aria-expanded={deckOpen}>
                Deck <span className={game.badge}>{cardIds.length}</span>
              </button>
            }
          />

          <CardGrid
            cards={shownCards}
            onCardClick={addCard}
            editionsFor={isSignedIn ? editionsFor : undefined}
            hasAnyCards={!isSignedIn || ownedCardIds.length > 0}
            owned={owned}
            cellExtras={renderCellExtras}
            onCardDragStart={handleCardDragStart}
          />
        </main>

        <aside className={`${game.panel} ${styles.deckPanel} ${book.frame} ${book.right}`} aria-label="Deck en construction">
          <DeckListPanel
            cardIds={cardIds}
            rareCopies={rareCopies}
            namePlate={
              <DeckNamePlate
                name={name}
                onNameChange={setName}
                description={description}
                onDescriptionChange={setDescription}
                shipId={shipId}
                cardIds={cardIds}
                artCardId={artCardId}
                artArtwork={artArtwork}
                onPickArt={() => setArtPickerOpen(true)}
                chosenStyleId={initialDeck?.styleId ?? null}
              />
            }
            onRemove={removeCard}
            onAdd={addCard}
            onShowCard={setDetailCardId}
            issue={issue}
            saveError={saveError}
            isSaving={isSaving}
            savedFlash={savedFlash}
            isDirty={isDirty}
            isPersisted={deckId !== null}
            onSave={() => void handleSave()}
            onNewDeck={() => requestLeave({ kind: "new" })}
            onDuplicate={() => void handleDuplicate()}
            onDelete={() => setDeleteConfirm(true)}
          />
        </aside>
      </div>

      {/* eslint-disable-next-line @next/next/no-img-element -- décor peint, positionné à la main */}
      <img className={book.decor} src="/assets/ui/accessoires/longue-vue.webp" alt="" draggable={false} />
      {/* La bougie et le café de la référence : entre l'enseigne et le
          compte, posés sur le haut du parchemin. */}
      <span className={book.decorTopRight}>
        {/* La bougie se souffle et se rallume (`CandleToy`). */}
        <CandleToy className={book.decorCandle} />
        {/* eslint-disable-next-line @next/next/no-img-element -- décor peint */}
        <img className={book.decorCup} src="/assets/ui/accessoires/tasse-cafe.webp" alt="" draggable={false} />
      </span>

      {detailCardId && (
        <CardDetailModal
          cardId={detailCardId}
          // Ouverte depuis une cellule de variante : la fiche montre CETTE variante (possédée, donc nette).
          initialEdition={detailEdition}
          artworkOwned={detailEdition !== undefined}
          onClose={() => {
            setDetailCardId(null);
            setDetailEdition(undefined);
          }}
          onPrevious={cardBrowser.cards.length > 1 ? () => setDetailCardId((id) => (id ? cardBrowser.relativeCardId(id, -1) : id)) : undefined}
          onNext={cardBrowser.cards.length > 1 ? () => setDetailCardId((id) => (id ? cardBrowser.relativeCardId(id, 1) : id)) : undefined}
          onShowCard={setDetailCardId}
        />
      )}

      {shipPickerOpen && <ShipPicker currentShipId={shipId} onSelect={setShipId} onClose={() => setShipPickerOpen(false)} />}

      {/* L'illustration du deck : le bouton de la plaque l'ouvrait, mais la fenêtre n'était jamais rendue (retour du 12/10/2026). */}
      {artPickerOpen && (
        <DeckArtPicker
          cardIds={cardIds}
          artCardId={artCardId}
          artArtwork={artArtwork}
          styledCardIds={styledCardIds}
          onChoose={(cardId, artwork) => {
            setArtCardId(cardId);
            setArtArtwork(cardId ? artwork : "classique");
            setArtPickerOpen(false);
          }}
          onClose={() => setArtPickerOpen(false)}
        />
      )}

      {pendingLeave && (
        <Dialog
          title={isDraft ? "Deck en cours" : "Modifications non sauvegardées"}
          onClose={() => setPendingLeave(null)}
          actions={
            <>
              <button type="button" className={game.link} onClick={() => setPendingLeave(null)} disabled={isSaving}>
                Continuer à éditer
              </button>
              <button type="button" className={game.secondary} onClick={handleLeaveDiscard} disabled={isSaving}>
                Ne pas enregistrer
              </button>
              <button type="button" className={game.primary} onClick={() => void handleLeaveSave()} disabled={isSaving}>
                {isSaving ? "Enregistrement…" : isDraft ? "Enregistrer le brouillon" : "Enregistrer"}
              </button>
            </>
          }
        >
          <p style={{ margin: 0 }}>
            Veux-tu enregistrer « {name} » avant de {pendingLeave.kind === "new" ? "créer un nouveau deck" : "quitter"} ?
          </p>
          {/* Un deck incomplet se sauvegarde quand même, simplement marqué
              non jouable côté serveur : le dire ici évite de croire qu'il
              faut le finir maintenant ou tout perdre. */}
          {isDraft && (
            <p className={game.muted} style={{ margin: 0 }}>
              Il n&apos;est pas encore jouable ({issue}). Enregistré comme brouillon, il t&apos;attendra dans « Mes decks ».
            </p>
          )}
          {saveError && <p className={game.error}>{saveError}</p>}
        </Dialog>
      )}

      {deleteConfirm && (
        <DeleteDeckDialog deckNames={[name]} permanent={false} isDeleting={false} onConfirm={() => void handleDelete()} onCancel={() => setDeleteConfirm(false)} />
      )}
    </GameScreen>
  );
}
