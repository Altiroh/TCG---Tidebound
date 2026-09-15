"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getCardDefinition, getMaxCopies, RULES, type CardDefinition } from "@/game";
import { deleteDeck, duplicateDeck, saveDeck } from "@/app/decks/actions";
import { CardGrid } from "@/features/collection/CardGrid";
import { CollectionSidebar } from "@/features/collection/CollectionSidebar";
import { CollectionToolbar } from "@/features/collection/CollectionToolbar";
import { CardDetailModal } from "@/features/collection/card-detail/CardDetailModal";
import { useCardBrowser } from "@/features/collection/useCardBrowser";
import { DEFAULT_SHIP_ID } from "@/features/decks/constants";
import { countInDeck, deckRuleIssue } from "@/features/decks/deckComposition";
import { DeckArtPicker } from "@/features/decks/DeckArtPicker";
import { DeckIdentity } from "@/features/decks/DeckIdentity";
import { DeckNamePlate } from "@/features/decks/DeckNamePlate";
import { DeckListPanel } from "@/features/decks/DeckListPanel";
import { DeleteDeckDialog } from "@/features/decks/DeleteDeckDialog";
import { Dialog } from "@/features/shell/Dialog";
import { GameScreen } from "@/features/shell/GameScreen";
import { ShipPicker } from "@/features/ships/ShipPicker";
import { SearchLine } from "@/features/shell/SearchLine";
import browser from "@/features/collection/CardBrowser.module.css";
import styles from "@/features/decks/DeckBuilder.module.css";
import game from "@/features/shell/GameScreen.module.css";
import { playButtonClick } from "@/lib/sound";

const DRAG_MIME = "text/tidebound-card-id";

/** Hors du composant : une référence stable, pour ne pas re-rendre toutes les cellules mémoïsées de `CardGrid`. */
function handleCardDragStart(def: CardDefinition, event: React.DragEvent<HTMLButtonElement>) {
  event.dataTransfer.setData(DRAG_MIME, def.id);
}

/** Sérialisation grossière pour détecter des modifications non sauvegardées (nom + Navire + multiset de cartes, ordre des exemplaires sans importance). */
function serializeState(name: string, shipId: string, cardIds: string[], artCardId: string | null): string {
  return `${name}|${shipId}|${artCardId ?? ""}|${[...cardIds].sort().join(",")}`;
}

export interface DeckEditorInitialData {
  id: string;
  name: string;
  shipId: string;
  cardIds: string[];
  /** Illustration choisie, ou `null` : la règle par défaut reprend alors la main. */
  artCardId: string | null;
}

interface DeckEditorScreenProps {
  ownedCardIds: string[];
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
export function DeckEditorScreen({ ownedCardIds, initialDeck }: DeckEditorScreenProps) {
  const router = useRouter();
  const [deckId, setDeckId] = useState<string | null>(initialDeck?.id ?? null);
  const [name, setName] = useState(initialDeck?.name ?? "Nouveau deck");
  const [shipId, setShipId] = useState(initialDeck?.shipId ?? DEFAULT_SHIP_ID);
  const [shipPickerOpen, setShipPickerOpen] = useState(false);
  const [cardIds, setCardIds] = useState<string[]>(initialDeck?.cardIds ?? []);
  /** Illustration choisie, ou `null` : la carte la plus chère du deck sert alors. */
  const [artCardId, setArtCardId] = useState<string | null>(initialDeck?.artCardId ?? null);
  const [artPickerOpen, setArtPickerOpen] = useState(false);
  const [savedSnapshot, setSavedSnapshot] = useState(() => serializeState(name, shipId, cardIds, artCardId));
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [pendingLeave, setPendingLeave] = useState<PendingLeave>(null);
  const [detailCardId, setDetailCardId] = useState<string | null>(null);
  const [deckOpen, setDeckOpen] = useState(false);
  const savedFlashTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Possession : un joueur non connecté peut composer (le serveur refusera
  // la sauvegarde avec un message clair), mais n'a pas de possession
  // connue — toutes les cartes lui sont alors ouvertes.
  const isSignedIn = ownedCardIds.length > 0;
  const owned = useMemo(() => (isSignedIn ? new Set(ownedCardIds) : null), [isSignedIn, ownedCardIds]);
  const initialFilters = useMemo(() => (isSignedIn ? { ownership: "owned" as const } : {}), [isSignedIn]);
  const cardBrowser = useCardBrowser({ owned, initialFilters });

  const isDirty = serializeState(name, shipId, cardIds, artCardId) !== savedSnapshot;
  const issue = useMemo(() => deckRuleIssue(cardIds, shipId, name), [cardIds, shipId, name]);
  /** Un deck encore hors des règles : sauvegardable, mais comme BROUILLON — c'est ce que le dialogue de sortie propose. */
  const isDraft = issue !== null;

  // Trois garde-fous, tous tirés des règles du projet : la carte est
  // possédée, sa limite d'exemplaires n'est pas atteinte, et le deck n'a
  // pas déjà sa taille maximale — au-delà, un exemplaire de plus ne
  // pourrait que rendre le deck injouable.
  const canAdd = useCallback(
    (def: CardDefinition) =>
      (owned ? owned.has(def.id) : true) &&
      countInDeck(cardIds, def.id) < getMaxCopies(def) &&
      cardIds.length < RULES.DECK_SIZE_MAX,
    [owned, cardIds]
  );

  const addCard = useCallback(
    (cardId: string) => {
      let def: CardDefinition;
      try {
        def = getCardDefinition(cardId);
      } catch {
        return;
      }
      if (!canAdd(def)) return;
      playButtonClick();
      setCardIds((current) => [...current, cardId]);
    },
    [canAdd]
  );

  const removeCard = useCallback((cardId: string) => {
    setCardIds((current) => {
      const index = current.lastIndexOf(cardId);
      return index === -1 ? current : current.filter((_, i) => i !== index);
    });
  }, []);

  async function handleSave(): Promise<boolean> {
    setIsSaving(true);
    setSaveError(null);
    const result = await saveDeck({ id: deckId, name, shipId, cardIds, artCardId });
    setIsSaving(false);
    if (!result.ok || !result.id) {
      setSaveError(result.error ?? "Échec de la sauvegarde.");
      return false;
    }
    setSavedSnapshot(serializeState(name, shipId, cardIds, artCardId));
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
    setArtCardId(null);
    setSavedSnapshot(serializeState("Nouveau deck", DEFAULT_SHIP_ID, [], null));
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
    (def: CardDefinition) => {
      const inDeck = countInDeck(cardIds, def.id);
      const max = getMaxCopies(def);
      const locked = owned ? !owned.has(def.id) : false;

      if (locked) return <span className={styles.cellLocked}>Non possédée</span>;

      return (
        <span className={styles.cellBar}>
          <button
            type="button"
            className={styles.cellButton}
            disabled={inDeck === 0}
            onClick={(event) => {
              event.stopPropagation();
              playButtonClick();
              removeCard(def.id);
            }}
            aria-label={`Retirer un exemplaire de ${def.name}`}
          >
            <svg viewBox="0 0 24 24" fill="none" width="12" height="12" aria-hidden>
              <path d="M6 12h12" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" />
            </svg>
          </button>
          <span className={`${styles.cellQty} ${inDeck >= max ? styles.cellQtyFull : ""}`}>
            {inDeck}
            <span className={styles.cellQtyMax}>/{max}</span>
          </span>
          <button
            type="button"
            className={styles.cellButton}
            disabled={inDeck >= max || cardIds.length >= RULES.DECK_SIZE_MAX}
            onClick={(event) => {
              event.stopPropagation();
              addCard(def.id);
            }}
            aria-label={`Ajouter un exemplaire de ${def.name}`}
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
            }}
            aria-label={`Voir ${def.name}`}
          >
            <svg viewBox="0 0 24 24" fill="none" width="12" height="12" aria-hidden>
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth={1.8} />
              <path d="M12 11v5M12 8h.01" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
            </svg>
          </button>
        </span>
      );
    },
    [cardIds, owned, addCard, removeCard]
  );

  return (
    <GameScreen
      active="decks"
      onNavigate={handleNavigate}
      actions={
        <div className={game.headerSearch}>
          <SearchLine
            variant="pill"
            value={cardBrowser.filters.search}
            onChange={(search) => cardBrowser.patchFilters({ search })}
            placeholder="Rechercher une carte…"
            label="Rechercher une carte"
            shortcut
          />
        </div>
      }
    >
      <div
        className={`${browser.workspace} ${styles.workspace}`}
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

        <aside className={`${game.panel} ${browser.sidebar}`} aria-label="Identité du deck et filtres">
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
          />
        </aside>

        <main className={`${game.panel} ${browser.main}`}>
          <CollectionToolbar
            count={cardBrowser.cards.length}
            sort={cardBrowser.sort}
            onSortChange={cardBrowser.setSort}
            onOpenFilters={() => cardBrowser.setDrawerOpen((open) => !open)}
            activeFilterCount={cardBrowser.activeFilterCount}
            extra={
              <button type="button" className={styles.deckToggle} onClick={() => setDeckOpen((open) => !open)} aria-expanded={deckOpen}>
                Deck · {cardIds.length}
              </button>
            }
          />

          <CardGrid
            cards={cardBrowser.cards}
            onCardClick={addCard}
            hasAnyCards={!isSignedIn || ownedCardIds.length > 0}
            owned={owned}
            cellExtras={renderCellExtras}
            onCardDragStart={handleCardDragStart}
          />
        </main>

        <aside className={`${game.panel} ${styles.deckPanel}`} aria-label="Deck en construction">
          <DeckListPanel
            cardIds={cardIds}
            namePlate={
              <DeckNamePlate
                name={name}
                onNameChange={setName}
                shipId={shipId}
                cardIds={cardIds}
                artCardId={artCardId}
                onPickArt={() => setArtPickerOpen(true)}
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

      {detailCardId && (
        <CardDetailModal
          cardId={detailCardId}
          onClose={() => setDetailCardId(null)}
          onPrevious={cardBrowser.cards.length > 1 ? () => setDetailCardId((id) => (id ? cardBrowser.relativeCardId(id, -1) : id)) : undefined}
          onNext={cardBrowser.cards.length > 1 ? () => setDetailCardId((id) => (id ? cardBrowser.relativeCardId(id, 1) : id)) : undefined}
          onShowCard={setDetailCardId}
        />
      )}

      {shipPickerOpen && <ShipPicker currentShipId={shipId} onSelect={setShipId} onClose={() => setShipPickerOpen(false)} />}

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
        <DeleteDeckDialog deckName={name} isDeleting={false} onConfirm={() => void handleDelete()} onCancel={() => setDeleteConfirm(false)} />
      )}
    </GameScreen>
  );
}
