"use client";

import { useMemo, useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getShipDefinition } from "@/game";
import { deleteDeck, duplicateDeck, renameDeck, type PlayerDeckSummary } from "@/app/decks/actions";
import { FrameTopNav } from "@/components/layout/FrameTopNav";
import { NAUTICAL_CONTROL_CLASS, NAUTICAL_LABEL_CLASS } from "@/features/collection/CardCollectionPanel";
import { DeckTile } from "@/features/decks/DeckTile";
import { DeckContextMenu } from "@/features/decks/DeckContextMenu";
import { DeleteDeckDialog } from "@/features/decks/DeleteDeckDialog";

const BACKGROUND_SRC = "/assets/decks/background.PNG";
const BACKGROUND_ASPECT = "1642 / 958";

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
 * Écran plein cadre des decks personnels, même principe que `CollectionScreen`
 * (contrôles positionnés en %/`cqw` par-dessus `background.PNG`, fourni par
 * l'utilisateur). Clic droit sur une tuile → menu contextuel Tidebound
 * (Renommer/Éditer/Dupliquer/Supprimer). "Éditer" mène à `/decks/[deckId]`,
 * un écran encore minimal en attendant `background_detail.png`.
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
    <div className="flex min-h-screen items-center justify-center bg-[#050b16] p-2">
      <div
        className="relative w-full"
        style={{
          aspectRatio: BACKGROUND_ASPECT,
          width: "min(96vw, 1700px, calc(92vh * 1642 / 958))",
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

        <FrameTopNav active="decks" />

        {isSignedIn ? (
          <>
            <div className="absolute left-[6%] right-[6%] top-[15%] bottom-[13%] overflow-y-auto pr-[0.5%]">
              {decks.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-2 text-center" style={{ fontSize: "1.05cqw" }}>
                  <p className={`text-[1.3em] ${NAUTICAL_LABEL_CLASS}`}>
                    {initialDecks.length === 0 ? "Aucun deck pour l'instant" : "Aucun deck ne correspond à cette recherche"}
                  </p>
                  {initialDecks.length === 0 && (
                    <p className="max-w-md text-[1em] text-amber-100/80 [font-family:var(--font-card-body)]">
                      Crée ton premier deck avec le bouton « Créer » en bas à gauche.
                    </p>
                  )}
                </div>
              ) : (
                <div className="grid gap-[1.4cqw]" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(11cqw, 1fr))" }}>
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

            <div className="absolute inset-x-0 bottom-0 flex h-[11%] items-center justify-between px-[3%]" style={{ fontSize: "1.05cqw" }}>
              <button
                type="button"
                onClick={handleCreate}
                disabled={isPending}
                className={`flex h-[3.1cqw] items-center rounded-full border border-board-accent bg-board-accent/25 px-[1.4cqw] font-bold text-white ring-2 ring-board-accent transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 ${NAUTICAL_LABEL_CLASS}`}
              >
                Créer
              </button>

              <div className={`flex h-[3.1cqw] items-center gap-[0.6cqw] px-[1cqw] ${NAUTICAL_CONTROL_CLASS}`} style={{ width: "min(60%, 26cqw)" }}>
                <svg viewBox="0 0 24 24" fill="none" className="h-[1.1em] w-[1.1em] shrink-0 text-amber-200/70">
                  <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth={2} />
                  <path d="M20 20l-3.2-3.2" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
                </svg>
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Rechercher un deck..."
                  className="w-full bg-transparent text-amber-50 placeholder:text-amber-200/50 focus:outline-none"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    aria-label="Effacer la recherche"
                    className="shrink-0 text-amber-200/70 hover:text-amber-100"
                  >
                    <svg viewBox="0 0 24 24" fill="none" className="h-[1em] w-[1em]">
                      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="absolute left-[6%] right-[6%] top-[15%] bottom-[13%] flex items-center justify-center">
            <div className="flex flex-col items-center gap-[1.2cqw] text-center" style={{ fontSize: "1.05cqw" }}>
              <p className={`text-[1.3em] ${NAUTICAL_LABEL_CLASS}`}>Connecte-toi pour gérer tes decks</p>
              <div className="flex gap-[1cqw]">
                <Link
                  href="/connexion"
                  className="rounded-md bg-board-accent px-[1.4em] py-[0.7em] font-semibold text-slate-950 transition-opacity hover:opacity-90"
                >
                  Se connecter
                </Link>
                <Link
                  href="/inscription"
                  className={`rounded-md border px-[1.4em] py-[0.7em] font-semibold transition-colors hover:bg-slate-800/80 ${NAUTICAL_CONTROL_CLASS}`}
                >
                  Créer un compte
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>

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
