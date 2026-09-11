"use client";

import { useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { getCardDefinition, getMaxCopies, getShipDefinition, RULES } from "@/game";
import { deleteDeck, duplicateDeck, saveDeck } from "@/app/decks/actions";
import { DEFAULT_SHIP_ID } from "@/features/decks/constants";
import { FrameTopNav } from "@/components/layout/FrameTopNav";
import { CardCollectionPanel, NAUTICAL_CONTROL_CLASS, NAUTICAL_LABEL_CLASS } from "@/features/collection/CardCollectionPanel";
import { DeckCapacityGauge } from "@/features/decks/DeckCapacityGauge";
import { DeckSlotRow } from "@/features/decks/DeckSlotRow";
import { DeleteDeckDialog } from "@/features/decks/DeleteDeckDialog";

const BACKGROUND_SRC = "/assets/decks/background_detail.PNG";
const BACKGROUND_ASPECT = "1370 / 795";
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
 * Éditeur de deck plein cadre, calé sur `background_detail.PNG` : le
 * panneau du milieu réutilise `CardCollectionPanel` (partagé avec
 * `CollectionScreen`) en mode `pick` — cliquer ou glisser une carte
 * l'ajoute au deck. Le panneau de droite montre le nom, la liste
 * numérotée du deck, la jauge de remplissage (`RULES.DECK_SIZE_MIN/MAX`)
 * et les actions Sauvegarder/Dupliquer/Supprimer/Nouveau.
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

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#050b16] p-2">
      <div
        className="relative w-full"
        style={{
          aspectRatio: BACKGROUND_ASPECT,
          width: "min(99vw, calc(97vh * 1370 / 795))",
          containerType: "inline-size",
        }}
      >
        <Image
          src={BACKGROUND_SRC}
          alt=""
          fill
          priority
          sizes="96vw"
          draggable={false}
          className="pointer-events-none select-none object-contain"
        />

        <FrameTopNav active="collection" />

        {/* Milieu : collection possédée, mode "pick" (clic/glisser = ajoute au deck). */}
        <div className="absolute left-[4%] right-[27%] top-[15%] bottom-[13%]">
          <CardCollectionPanel ownedCardIds={ownedCardIds} mode="pick" onPick={addCard} />
        </div>

        {/* Droite : deck en cours d'édition. */}
        <div
          className="absolute left-[75.5%] right-[2%] top-[15%] bottom-[3%] flex flex-col gap-[0.8cqw] rounded-md border border-amber-600/40 bg-slate-950/70 p-[1cqw]"
          style={{ fontSize: "1.05cqw" }}
        >
          <h2 className={`text-[1.2em] ${NAUTICAL_LABEL_CLASS}`}>Mon deck</h2>

          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nom du deck"
            className={`w-full rounded-md px-[0.8em] py-[0.5em] text-[1em] outline-none focus:ring-2 focus:ring-board-accent ${NAUTICAL_CONTROL_CLASS}`}
          />

          <div
            className="min-h-0 flex-1 overflow-y-auto rounded-md border border-amber-700/30 bg-black/20 p-[0.4em]"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const cardId = e.dataTransfer.getData(DRAG_MIME);
              if (cardId) addCard(cardId);
            }}
          >
            {cardIds.length === 0 ? (
              <p className="p-[0.8em] text-center text-[0.9em] text-amber-200/60">
                Clique ou glisse une carte depuis la collection pour l&apos;ajouter.
              </p>
            ) : (
              <div className="flex flex-col gap-[0.15em]">
                {cardIds.map((cardId, index) => (
                  <DeckSlotRow key={`${cardId}-${index}`} index={index + 1} cardId={cardId} onRemove={() => removeCardAt(index)} />
                ))}
              </div>
            )}
          </div>

          <DeckCapacityGauge count={rowCount} min={RULES.DECK_SIZE_MIN} max={RULES.DECK_SIZE_MAX} />

          {saveError && <p className="text-[0.85em] text-rose-400">{saveError}</p>}

          <div className="flex items-center gap-[0.5em]">
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="flex-1 rounded-md bg-board-accent px-[1em] py-[0.6em] text-[1em] font-semibold text-slate-950 transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSaving ? "Sauvegarde..." : savedFlash ? "Enregistré ✓" : "Sauvegarder"}
            </button>
            <div className="relative">
              <button
                type="button"
                onClick={() => setMoreMenuOpen((v) => !v)}
                aria-label="Plus d'options"
                className={`flex h-full items-center justify-center rounded-md px-[0.7em] py-[0.6em] ${NAUTICAL_CONTROL_CLASS}`}
              >
                <svg viewBox="0 0 24 24" fill="none" className="h-[1.1em] w-[1.1em]">
                  <circle cx="5" cy="12" r="1.6" fill="currentColor" />
                  <circle cx="12" cy="12" r="1.6" fill="currentColor" />
                  <circle cx="19" cy="12" r="1.6" fill="currentColor" />
                </svg>
              </button>
              {moreMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setMoreMenuOpen(false)} />
                  <div className="absolute right-0 top-full z-50 mt-1 w-[9em] overflow-hidden rounded-md border border-amber-600/50 bg-slate-950/95 py-1 text-[0.95em] shadow-lg">
                    <button
                      type="button"
                      disabled={!deckId}
                      onClick={handleDuplicate}
                      className="block w-full px-3 py-1.5 text-left text-slate-100 transition-colors hover:bg-board-accent/20 disabled:cursor-not-allowed disabled:opacity-40"
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
                      className="block w-full px-3 py-1.5 text-left text-rose-400 transition-colors hover:bg-rose-500/15 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Supprimer
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={handleNewDeck}
            className={`flex items-center justify-center gap-[0.5em] rounded-md px-[1em] py-[0.6em] text-[1em] font-semibold transition-colors hover:bg-slate-800/80 ${NAUTICAL_CONTROL_CLASS}`}
          >
            <svg viewBox="0 0 24 24" fill="none" className="h-[1.1em] w-[1.1em]">
              <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
            </svg>
            Nouveau deck
          </button>

          <p className="text-center text-[0.8em] text-amber-200/50">
            Navire : {shipName} · valide entre {RULES.DECK_SIZE_MIN} et {RULES.DECK_SIZE_MAX} cartes
          </p>
        </div>
      </div>

      {pendingUnsavedAction && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4 backdrop-blur-md">
          <div className="w-full max-w-sm rounded-2xl border border-white/15 bg-white/[0.07] p-6 shadow-[0_8px_40px_rgba(0,0,0,0.55)] backdrop-blur-2xl">
            <h2 className="text-lg font-semibold text-white">Modifications non sauvegardées</h2>
            <p className="mt-2 text-sm text-slate-300">Veux-tu enregistrer « {name} » avant de créer un nouveau deck ?</p>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingUnsavedAction(null)}
                className="rounded-md border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium text-slate-100 transition-colors hover:bg-white/20"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleUnsavedDiscard}
                className="rounded-md border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium text-slate-100 transition-colors hover:bg-white/20"
              >
                Ne pas enregistrer
              </button>
              <button
                type="button"
                onClick={handleUnsavedSave}
                className="rounded-md bg-board-accent px-4 py-2 text-sm font-medium text-slate-950 transition-opacity hover:opacity-90"
              >
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirm && (
        <DeleteDeckDialog deckName={name} isDeleting={false} onConfirm={handleDelete} onCancel={() => setDeleteConfirm(false)} />
      )}
    </div>
  );
}
