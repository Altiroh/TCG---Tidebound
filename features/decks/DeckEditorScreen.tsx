"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CORE_SET, getCardDefinition, getMaxCopies, getShipDefinition, RULES, type CardType } from "@/game";
import { deleteDeck, duplicateDeck, saveDeck } from "@/app/decks/actions";
import { compareCards, normalizeSearch, type SortMode } from "@/features/collection/cardFilters";
import { DEFAULT_SHIP_ID } from "@/features/decks/constants";
import { DeckCapacityGauge } from "@/features/decks/DeckCapacityGauge";
import { DeckCardPicker } from "@/features/decks/DeckCardPicker";
import { DeckSlotRow } from "@/features/decks/DeckSlotRow";
import { DeleteDeckDialog } from "@/features/decks/DeleteDeckDialog";
import { PaperDialog } from "@/features/shell/PaperDialog";
import { PaperSurface } from "@/features/shell/PaperSurface";
import { ScreenHeader } from "@/features/shell/ScreenHeader";
import { ScreenShell } from "@/features/shell/ScreenShell";
import { SearchLine } from "@/features/shell/SearchLine";
import { SortControl } from "@/features/shell/SortControl";
import { TypeFilterRow } from "@/features/shell/TypeFilterRow";
import { UtilityBar } from "@/features/shell/UtilityBar";
import shell from "@/features/shell/ScreenShell.module.css";
import styles from "@/features/decks/DeckScreens.module.css";
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

type UnsavedAction = "new" | null;

/**
 * Éditeur de deck — même coquille que la Collection et la liste des decks
 * (`features/shell`). La surface de papier est ici partagée en deux
 * colonnes séparées par un UNIQUE filet de laiton : à gauche les cartes
 * possédées (clic ou glisser = ajoute au deck), à droite le manifeste du
 * deck, écrit sur la même feuille — pas un second panneau posé par-dessus.
 *
 * Les contrôles du sélecteur (filtres, recherche) descendent dans la barre
 * utilitaire, exactement là où la Collection les place ; le tri reste posé
 * sur le papier, en haut à droite de SA colonne. L'action primaire de
 * l'écran ("Sauvegarder") occupe la place qu'occupe "Créer un deck"
 * ailleurs — d'un écran à l'autre, rien ne bouge de place.
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
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [pendingUnsavedAction, setPendingUnsavedAction] = useState<UnsavedAction>(null);
  const savedFlashTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Contrôles du sélecteur de cartes — tenus ici parce que leur UI vit dans
  // la barre utilitaire (filtres, recherche) et sur le papier (tri), pas
  // dans la grille elle-même.
  const [activeType, setActiveType] = useState<CardType | null>(null);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortMode>("name");
  const [isDropping, setIsDropping] = useState(false);

  const ownedSet = useMemo(() => new Set(ownedCardIds), [ownedCardIds]);

  const pickerCards = useMemo(() => {
    const query = normalizeSearch(search.trim());
    return CORE_SET.filter((def) => {
      if (!ownedSet.has(def.id)) return false;
      if (activeType && def.type !== activeType) return false;
      if (query && !normalizeSearch(def.name).includes(query)) return false;
      return true;
    }).sort((a, b) => compareCards(a, b, sort));
  }, [ownedSet, activeType, search, sort]);

  const isDirty = serializeState(name, cardIds) !== savedSnapshot;
  const shipName = (() => {
    try {
      return getShipDefinition(shipId).name;
    } catch {
      return shipId;
    }
  })();

  function addCard(cardId: string) {
    let def;
    try {
      def = getCardDefinition(cardId);
    } catch {
      return;
    }
    const max = getMaxCopies(def);
    setCardIds((current) => {
      const owned = current.filter((id) => id === cardId).length;
      if (owned >= max) return current;
      return [...current, cardId];
    });
  }

  function removeCardAt(index: number) {
    setCardIds((current) => current.filter((_, i) => i !== index));
  }

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

  function handleNewDeck() {
    if (isDirty) {
      setPendingUnsavedAction("new");
      return;
    }
    resetToBlankDeck();
  }

  async function handleUnsavedSave() {
    const ok = await handleSave();
    setPendingUnsavedAction(null);
    if (ok) resetToBlankDeck();
  }

  function handleUnsavedDiscard() {
    setPendingUnsavedAction(null);
    resetToBlankDeck();
  }

  async function handleDuplicate() {
    setMoreMenuOpen(false);
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

  useEffect(() => {
    if (!moreMenuOpen) return;
    function close() {
      setMoreMenuOpen(false);
    }
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [moreMenuOpen]);

  return (
    <ScreenShell>
      <ScreenHeader active="decks" />

      <PaperSurface>
        <div className={styles.editor}>
          <div className={styles.pickerColumn}>
            <SortControl value={sort} onChange={setSort} />
            <DeckCardPicker cards={pickerCards} onPick={addCard} hasAnyCards={ownedCardIds.length > 0} />
          </div>

          <div className={styles.editorRule} aria-hidden />

          <div className={styles.ledger}>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nom du deck"
              className={styles.deckNameInput}
              aria-label="Nom du deck"
            />

            <div className={styles.ledgerLabel}>Manifeste</div>

            <div
              className={isDropping ? styles.slotScrollDropping : styles.slotScroll}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDropping(true);
              }}
              onDragLeave={() => setIsDropping(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDropping(false);
                const cardId = e.dataTransfer.getData(DRAG_MIME);
                if (cardId) addCard(cardId);
              }}
            >
              {cardIds.length === 0 ? (
                <p className={styles.slotDropHint}>Clique ou glisse une carte depuis la colonne de gauche pour l&apos;ajouter.</p>
              ) : (
                cardIds.map((cardId, index) => (
                  <DeckSlotRow key={`${cardId}-${index}`} index={index + 1} cardId={cardId} onRemove={() => removeCardAt(index)} />
                ))
              )}
            </div>

            <DeckCapacityGauge count={cardIds.length} min={RULES.DECK_SIZE_MIN} max={RULES.DECK_SIZE_MAX} />

            {saveError && <p className={styles.ledgerError}>{saveError}</p>}

            <p className={styles.ledgerNote}>
              Navire : {shipName} · valide entre {RULES.DECK_SIZE_MIN} et {RULES.DECK_SIZE_MAX} cartes
            </p>
          </div>
        </div>
      </PaperSurface>

      <UtilityBar
        left={
          <>
            <button
              type="button"
              className={savedFlash ? shell.primaryActionDone : shell.primaryAction}
              onClick={() => {
                playButtonClick();
                void handleSave();
              }}
              disabled={isSaving}
            >
              {isSaving ? "Sauvegarde…" : savedFlash ? "Enregistré ✓" : "Sauvegarder"}
            </button>

            <button type="button" className={shell.ghostAction} onClick={handleNewDeck}>
              <span className={shell.plus} aria-hidden>
                +
              </span>
              Nouveau deck
            </button>

            {/* `stopPropagation` : le listener global de fermeture (cf. `moreMenuOpen`)
                refermerait le menu dans le même clic que celui qui l'ouvre. */}
            <div style={{ position: "relative" }} onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                className={shell.ghostAction}
                onClick={() => setMoreMenuOpen((v) => !v)}
                aria-label="Plus d'options"
                aria-expanded={moreMenuOpen}
              >
                <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden>
                  <circle cx="5" cy="12" r="1.6" fill="currentColor" />
                  <circle cx="12" cy="12" r="1.6" fill="currentColor" />
                  <circle cx="19" cy="12" r="1.6" fill="currentColor" />
                </svg>
              </button>

              {moreMenuOpen && (
                <div className={shell.inkMenuUp}>
                  <button type="button" className={shell.inkOption} disabled={!deckId} onClick={handleDuplicate}>
                    Dupliquer
                  </button>
                  <div className={shell.inkMenuRule} />
                  <button
                    type="button"
                    className={shell.inkOptionDanger}
                    disabled={!deckId}
                    onClick={() => {
                      setMoreMenuOpen(false);
                      setDeleteConfirm(true);
                    }}
                  >
                    Supprimer
                  </button>
                </div>
              )}
            </div>
          </>
        }
        center={<TypeFilterRow activeType={activeType} onChange={setActiveType} />}
        right={<SearchLine value={search} onChange={setSearch} placeholder="Rechercher une carte…" label="Rechercher une carte" />}
      />

      {pendingUnsavedAction && (
        <PaperDialog
          title="Modifications non sauvegardées"
          onClose={() => setPendingUnsavedAction(null)}
          actions={
            <>
              <button type="button" className={shell.dialogGhost} onClick={() => setPendingUnsavedAction(null)}>
                Annuler
              </button>
              <button type="button" className={shell.dialogGhost} onClick={handleUnsavedDiscard}>
                Ne pas enregistrer
              </button>
              <button type="button" className={shell.dialogConfirm} onClick={() => void handleUnsavedSave()}>
                Enregistrer
              </button>
            </>
          }
        >
          <p className={shell.dialogText}>Veux-tu enregistrer « {name} » avant de créer un nouveau deck ?</p>
        </PaperDialog>
      )}

      {deleteConfirm && (
        <DeleteDeckDialog deckName={name} isDeleting={false} onConfirm={handleDelete} onCancel={() => setDeleteConfirm(false)} />
      )}
    </ScreenShell>
  );
}
