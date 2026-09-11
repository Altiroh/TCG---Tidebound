"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getShipDefinition } from "@/game";
import { deleteDeck, duplicateDeck, renameDeck, type PlayerDeckSummary } from "@/app/decks/actions";
import { GameButton } from "@/components/game-ui/GameButton";
import { SearchField } from "@/components/game-ui/SearchField";
import { SegmentedControl } from "@/components/game-ui/SegmentedControl";
import { TEXT_PRIMARY, TEXT_SECONDARY } from "@/components/game-ui/tokens";
import { DeckTile } from "@/features/decks/DeckTile";
import { DeckContextMenu } from "@/features/decks/DeckContextMenu";
import { DeleteDeckDialog } from "@/features/decks/DeleteDeckDialog";

/** Insensible aux accents et à la casse. */
function normalizeSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

function shipNameFor(shipId: string): string {
  try {
    return getShipDefinition(shipId).name;
  } catch {
    return shipId;
  }
}

interface ContextMenuState {
  x: number;
  y: number;
  deckId: string;
}

interface DecksScreenProps {
  isSignedIn: boolean;
  initialDecks: PlayerDeckSummary[];
}

/**
 * Écran des decks personnels — même famille visuelle que `CollectionScreen`
 * (fond en dégradé, nav minimale, un seul cluster de contrôle). Ici l'action
 * PRINCIPALE de l'écran est de créer un deck : "Créer" est donc le seul
 * bouton plein (laiton) de la page, la recherche reste discrète à côté.
 * Clic droit sur une tuile → menu contextuel (Renommer/Éditer/Dupliquer/
 * Supprimer). "Éditer" mène à `/decks/[deckId]`.
 */
export function DecksScreen({ isSignedIn, initialDecks }: DecksScreenProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const [renamingDeckId, setRenamingDeckId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PlayerDeckSummary | null>(null);
  const [isPending, startTransition] = useTransition();

  const decks = useMemo(() => {
    const query = normalizeSearch(search.trim());
    if (!query) return initialDecks;
    return initialDecks.filter((deck) => normalizeSearch(deck.name).includes(query));
  }, [initialDecks, search]);

  function handleCreate() {
    router.push("/decks/nouveau");
  }

  function handleRenameSubmit(deckId: string, name: string) {
    setRenamingDeckId(null);
    const deck = initialDecks.find((d) => d.id === deckId);
    if (!deck || name.trim() === deck.name) return;
    startTransition(async () => {
      const result = await renameDeck(deckId, name);
      if (result.ok) router.refresh();
    });
  }

  function handleDuplicate(deckId: string) {
    setMenu(null);
    startTransition(async () => {
      const result = await duplicateDeck(deckId);
      if (result.ok) router.refresh();
    });
  }

  function handleConfirmDelete() {
    if (!deleteTarget) return;
    const deckId = deleteTarget.id;
    startTransition(async () => {
      const result = await deleteDeck(deckId);
      setDeleteTarget(null);
      if (result.ok) router.refresh();
    });
  }

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
          onChange={(v) => {
            if (v === "collection") router.push("/collection");
          }}
        />
      </div>

      {isSignedIn ? (
        <>
          <div className="flex shrink-0 items-center justify-end">
            <div className="flex items-center gap-2">
              <SearchField value={search} onChange={setSearch} placeholder="Rechercher un deck..." />
              <GameButton variant="primary" onClick={handleCreate} disabled={isPending}>
                <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
                  <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
                </svg>
                Créer
              </GameButton>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            {decks.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
                <p className={`text-base font-medium ${TEXT_PRIMARY}`}>
                  {initialDecks.length === 0 ? "Aucun deck pour l'instant" : "Aucun deck ne correspond à cette recherche"}
                </p>
                {initialDecks.length === 0 && (
                  <p className={`max-w-md text-sm ${TEXT_SECONDARY}`}>Crée ton premier deck avec le bouton « Créer » ci-dessus.</p>
                )}
              </div>
            ) : (
              <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" }}>
                {decks.map((deck) => (
                  <DeckTile
                    key={deck.id}
                    deck={deck}
                    shipName={shipNameFor(deck.shipId)}
                    isRenaming={renamingDeckId === deck.id}
                    onOpen={() => router.push(`/decks/${deck.id}`)}
                    onRenameSubmit={(name) => handleRenameSubmit(deck.id, name)}
                    onRenameCancel={() => setRenamingDeckId(null)}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      setMenu({ x: event.clientX, y: event.clientY, deckId: deck.id });
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="flex flex-1 items-center justify-center">
          <div className="flex flex-col items-center gap-4 text-center">
            <p className={`text-base font-medium ${TEXT_PRIMARY}`}>Connecte-toi pour gérer tes decks</p>
            <div className="flex gap-2">
              <Link
                href="/connexion"
                className="inline-flex items-center justify-center rounded-[var(--radius-sm)] bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[#1a1410] transition duration-150 ease-out hover:bg-[var(--accent-hover)]"
              >
                Se connecter
              </Link>
              <Link
                href="/inscription"
                className="inline-flex items-center justify-center rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--surface-1)] px-4 py-2 text-sm font-medium text-[var(--text-primary)] transition duration-150 ease-out hover:border-[var(--accent)]/50"
              >
                Créer un compte
              </Link>
            </div>
          </div>
        </div>
      )}

      {menu && (
        <DeckContextMenu
          x={menu.x}
          y={menu.y}
          onRename={() => {
            setRenamingDeckId(menu.deckId);
            setMenu(null);
          }}
          onEdit={() => {
            router.push(`/decks/${menu.deckId}`);
            setMenu(null);
          }}
          onDuplicate={() => handleDuplicate(menu.deckId)}
          onDelete={() => {
            const deck = initialDecks.find((d) => d.id === menu.deckId) ?? null;
            setDeleteTarget(deck);
            setMenu(null);
          }}
          onClose={() => setMenu(null)}
        />
      )}

      {deleteTarget && (
        <DeleteDeckDialog
          deckName={deleteTarget.name}
          isDeleting={isPending}
          onConfirm={handleConfirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
