"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getCardDefinition, getMaxCopies, RULES, type CardDefinition } from "@/game";
import { deleteDeck, duplicateDeck, saveDeck } from "@/app/decks/actions";
import { GameModal } from "@/components/game-ui/GameModal";
import { GameButton } from "@/components/game-ui/GameButton";
import { CardGrid } from "@/features/collection/CardGrid";
import { CollectionSidebar } from "@/features/collection/CollectionSidebar";
import { CollectionToolbar } from "@/features/collection/CollectionToolbar";
import { CardDetailModal } from "@/features/collection/card-detail/CardDetailModal";
import { useCardBrowser } from "@/features/collection/useCardBrowser";
import { DEFAULT_SHIP_ID } from "@/features/decks/constants";
import { countInDeck, deckRuleIssue } from "@/features/decks/deckComposition";
import { DeckListPanel } from "@/features/decks/DeckListPanel";
import { DeleteDeckDialog } from "@/features/decks/DeleteDeckDialog";
import { ScreenHeader } from "@/features/shell/ScreenHeader";
import { SearchLine } from "@/features/shell/SearchLine";
import browser from "@/features/collection/CardBrowser.module.css";
import styles from "@/features/decks/DeckBuilder.module.css";
import shell from "@/features/shell/ScreenShell.module.css";
import { playButtonClick } from "@/lib/sound";

const DRAG_MIME = "text/tidebound-card-id";

/** Sérialisation grossière pour détecter des modifications non sauvegardées (nom + multiset de cartes, ordre des exemplaires sans importance). */
function serializeState(name: string, cardIds: string[]): string {
  return `${name}|${[...cardIds].sort().join(",")}`;
}

export interface DeckEditorInitialData {
  id: string;
  name: string;
  shipId: string;
  cardIds: string[];
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
  const [shipId] = useState(initialDeck?.shipId ?? DEFAULT_SHIP_ID);
  const [cardIds, setCardIds] = useState<string[]>(initialDeck?.cardIds ?? []);
  const [savedSnapshot, setSavedSnapshot] = useState(() => serializeState(name, cardIds));
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

  const isDirty = serializeState(name, cardIds) !== savedSnapshot;
  const issue = useMemo(() => deckRuleIssue(cardIds, shipId, name), [cardIds, shipId, name]);

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
    const result = await saveDeck({ id: deckId, name, shipId, cardIds });
    setIsSaving(false);
    if (!result.ok || !result.id) {
      setSaveError(result.error ?? "Échec de la sauvegarde.");
      return false;
    }
    setSavedSnapshot(serializeState(name, cardIds));
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
    setCardIds([]);
    setSavedSnapshot(serializeState("Nouveau deck", []));
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

  function performLeave(leave: NonNullable<PendingLeave>) {
    if (leave.kind === "new") resetToBlankDeck();
    else router.push(leave.href);
  }

  async function handleLeaveSave() {
    const leave = pendingLeave;
    const ok = await handleSave();
    setPendingLeave(null);
    if (ok && leave) performLeave(leave);
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
    <div className={`${shell.screen} ${browser.screen}`}>
      <ScreenHeader
        active="decks"
        showPanorama={false}
        actions={
          <div className={browser.headerSearch}>
            <SearchLine
              variant="pill"
              value={cardBrowser.filters.search}
              onChange={(search) => cardBrowser.patchFilters({ search })}
              placeholder="Rechercher une carte…"
              label="Rechercher une carte"
            />
          </div>
        }
      />

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

        <aside className={`${browser.panel} ${browser.sidebar}`} aria-label="Filtres de la collection">
          <CollectionSidebar
            filters={cardBrowser.filters}
            onChange={cardBrowser.patchFilters}
            onReset={cardBrowser.resetFilters}
            owned={cardBrowser.ownedForFilters}
            showOwnership={isSignedIn}
            showCreateDeck={false}
          />
        </aside>

        <main className={`${browser.panel} ${browser.main}`}>
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
            onCardDragStart={(def, event) => event.dataTransfer.setData(DRAG_MIME, def.id)}
          />
        </main>

        <aside className={`${browser.panel} ${styles.deckPanel}`} aria-label="Deck en construction">
          <DeckListPanel
            name={name}
            onNameChange={setName}
            cardIds={cardIds}
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
            onBack={() => requestLeave({ kind: "navigate", href: "/decks" })}
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

      {pendingLeave && (
        <GameModal onClose={() => setPendingLeave(null)}>
          <h2 className="text-lg font-semibold [font-family:var(--font-card-title)]">Modifications non sauvegardées</h2>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            Veux-tu enregistrer « {name} » avant de {pendingLeave.kind === "new" ? "créer un nouveau deck" : "quitter"} ?
          </p>
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <GameButton variant="ghost" onClick={() => setPendingLeave(null)}>
              Annuler
            </GameButton>
            <GameButton variant="secondary" onClick={handleLeaveDiscard}>
              Ne pas enregistrer
            </GameButton>
            <GameButton variant="primary" onClick={() => void handleLeaveSave()}>
              Enregistrer
            </GameButton>
          </div>
        </GameModal>
      )}

      {deleteConfirm && (
        <DeleteDeckDialog deckName={name} isDeleting={false} onConfirm={() => void handleDelete()} onCancel={() => setDeleteConfirm(false)} />
      )}
    </div>
  );
}
