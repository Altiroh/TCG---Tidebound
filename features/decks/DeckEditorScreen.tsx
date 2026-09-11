"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getCardDefinition, getMaxCopies, getShipDefinition, RULES } from "@/game";
import { deleteDeck, duplicateDeck, saveDeck } from "@/app/decks/actions";
import { DEFAULT_SHIP_ID } from "@/features/decks/constants";
import { GameButton } from "@/components/game-ui/GameButton";
import { GameIconButton } from "@/components/game-ui/GameIconButton";
import { GameInput } from "@/components/game-ui/GameInput";
import { GameModal } from "@/components/game-ui/GameModal";
import { GamePanel } from "@/components/game-ui/GamePanel";
import { SegmentedControl } from "@/components/game-ui/SegmentedControl";
import { BORDER_SUBTLE, RADIUS_SM, SHADOW_FLOATING, TEXT_PRIMARY, TEXT_SECONDARY, TRANSITION } from "@/components/game-ui/tokens";
import { CardCollectionPanel } from "@/features/collection/CardCollectionPanel";
import { DeckCapacityGauge } from "@/features/decks/DeckCapacityGauge";
import { DeckSlotRow } from "@/features/decks/DeckSlotRow";
import { DeleteDeckDialog } from "@/features/decks/DeleteDeckDialog";

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
 * Éditeur de deck — même famille visuelle que `CollectionScreen`/
 * `DecksScreen`. Deux zones : à gauche `CardCollectionPanel` en mode
 * `pick` (clic/glisser = ajoute au deck), à droite un panneau compact
 * (nom, liste numérotée, jauge, actions). L'action PRINCIPALE ("Sauvegarder")
 * est le seul bouton plein de l'écran ; "Dupliquer"/"Supprimer" se cachent
 * derrière un menu "..." tant qu'on ne les demande pas.
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

  const rowCount = useMemo(() => cardIds.length, [cardIds]);

  useEffect(() => {
    if (!moreMenuOpen) return;
    function close() {
      setMoreMenuOpen(false);
    }
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [moreMenuOpen]);

  return (
    <div
      className="fixed inset-0 flex flex-col gap-6 p-6 sm:p-10"
      style={{ background: "radial-gradient(ellipse at 50% -10%, var(--surface-1) 0%, var(--surface-0) 60%)" }}
    >
      <div className="flex shrink-0 items-center gap-6">
        <Link
          href="/"
          className={`flex items-center gap-1.5 text-sm font-medium ${TEXT_SECONDARY} transition-colors hover:${TEXT_PRIMARY}`}
        >
          <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
            <path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Retour
        </Link>
        <SegmentedControl
          value="decks"
          options={[
            { value: "collection", label: "Collection" },
            { value: "decks", label: "Decks" },
          ]}
          onChange={(v) => router.push(v === "collection" ? "/collection" : "/decks")}
        />
      </div>

      <div className="flex min-h-0 flex-1 gap-6">
        {/* Gauche : collection possédée, mode "pick" (clic/glisser = ajoute au deck). */}
        <div className="min-w-0 flex-1">
          <CardCollectionPanel ownedCardIds={ownedCardIds} mode="pick" onPick={addCard} />
        </div>

        {/* Droite : deck en cours d'édition. */}
        <GamePanel className="flex w-72 shrink-0 flex-col gap-3 p-4">
          <GameInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom du deck" />

          <div
            className="min-h-0 flex-1 overflow-y-auto rounded-md bg-black/20 p-1"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const cardId = e.dataTransfer.getData(DRAG_MIME);
              if (cardId) addCard(cardId);
            }}
          >
            {cardIds.length === 0 ? (
              <p className={`p-3 text-center text-sm ${TEXT_SECONDARY}`}>Clique ou glisse une carte depuis la collection pour l&apos;ajouter.</p>
            ) : (
              <div className="flex flex-col gap-0.5">
                {cardIds.map((cardId, index) => (
                  <DeckSlotRow key={`${cardId}-${index}`} index={index + 1} cardId={cardId} onRemove={() => removeCardAt(index)} />
                ))}
              </div>
            )}
          </div>

          <DeckCapacityGauge count={rowCount} min={RULES.DECK_SIZE_MIN} max={RULES.DECK_SIZE_MAX} />

          {saveError && <p className="text-sm text-[var(--danger)]">{saveError}</p>}

          <div className="flex items-center gap-2">
            <GameButton variant="primary" onClick={handleSave} disabled={isSaving} className="flex-1">
              {isSaving ? "Sauvegarde..." : savedFlash ? "Enregistré ✓" : "Sauvegarder"}
            </GameButton>
            <div className="relative" onClick={(e) => e.stopPropagation()}>
              <GameIconButton onClick={() => setMoreMenuOpen((v) => !v)} aria-label="Plus d'options">
                <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
                  <circle cx="5" cy="12" r="1.6" fill="currentColor" />
                  <circle cx="12" cy="12" r="1.6" fill="currentColor" />
                  <circle cx="19" cy="12" r="1.6" fill="currentColor" />
                </svg>
              </GameIconButton>
              {moreMenuOpen && (
                <div
                  className={`absolute right-0 top-full z-50 mt-1.5 w-36 overflow-hidden bg-[var(--surface-glass)] backdrop-blur-xl py-1 ${BORDER_SUBTLE} ${RADIUS_SM} ${SHADOW_FLOATING}`}
                >
                  <button
                    type="button"
                    disabled={!deckId}
                    onClick={handleDuplicate}
                    className={`block w-full px-3 py-1.5 text-left text-sm ${TEXT_PRIMARY} ${TRANSITION} hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40`}
                  >
                    Dupliquer
                  </button>
                  <button
                    type="button"
                    disabled={!deckId}
                    onClick={() => {
                      setMoreMenuOpen(false);
                      setDeleteConfirm(true);
                    }}
                    className={`block w-full px-3 py-1.5 text-left text-sm text-[var(--danger)] ${TRANSITION} hover:bg-[var(--danger)]/10 disabled:cursor-not-allowed disabled:opacity-40`}
                  >
                    Supprimer
                  </button>
                </div>
              )}
            </div>
          </div>

          <GameButton variant="ghost" onClick={handleNewDeck} className="justify-center">
            <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
              <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
            </svg>
            Nouveau deck
          </GameButton>

          <p className={`text-center text-xs ${TEXT_SECONDARY}`}>
            Navire : {shipName} · valide entre {RULES.DECK_SIZE_MIN} et {RULES.DECK_SIZE_MAX} cartes
          </p>
        </GamePanel>
      </div>

      {pendingUnsavedAction && (
        <GameModal onClose={() => setPendingUnsavedAction(null)} className="w-full max-w-sm">
          <h2 className={`text-lg font-semibold ${TEXT_PRIMARY}`}>Modifications non sauvegardées</h2>
          <p className={`mt-2 text-sm ${TEXT_SECONDARY}`}>Veux-tu enregistrer « {name} » avant de créer un nouveau deck ?</p>
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <GameButton variant="secondary" onClick={() => setPendingUnsavedAction(null)}>
              Annuler
            </GameButton>
            <GameButton variant="secondary" onClick={handleUnsavedDiscard}>
              Ne pas enregistrer
            </GameButton>
            <GameButton variant="primary" onClick={handleUnsavedSave}>
              Enregistrer
            </GameButton>
          </div>
        </GameModal>
      )}

      {deleteConfirm && (
        <DeleteDeckDialog deckName={name} isDeleting={false} onConfirm={handleDelete} onCancel={() => setDeleteConfirm(false)} />
      )}
    </div>
  );
}
