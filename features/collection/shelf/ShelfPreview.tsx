"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { CORE_SET, isAbyssalVariant } from "@/game";
import { CollectionScreen } from "@/features/collection/CollectionScreen";
import { CardShelfProvider, type ShelfBackend } from "@/features/collection/shelf/CardShelfProvider";
import { NotebookWall } from "@/features/collection/shelf/NotebookWall";
import type { CardShelf } from "@/features/collection/shelf/shelf";

/**
 * Étagère FABRIQUÉE, en mémoire : trois carnets et quelques favoris tirés du
 * vrai catalogue. Chaque geste réussit (ou échoue, `?refus=1`, pour voir le
 * retour arrière et le message) sans compte ni base.
 */
function memoryBackend(refuse: boolean): ShelfBackend {
  const abyssal = CORE_SET.filter(isAbyssalVariant).slice(0, 7).map((def) => def.id);
  const cheap = CORE_SET.filter((def) => def.cost <= 2 && !isAbyssalVariant(def)).slice(0, 4).map((def) => def.id);
  const start: CardShelf = {
    favorites: CORE_SET.slice(10, 16).map((def) => def.id),
    notebooks: [
      { id: "00000000-0000-4000-8000-000000000001", name: "Combo Abysses", coverCardId: abyssal[2] ?? null, cardIds: abyssal, updatedAt: "2026-09-26T10:00:00Z" },
      { id: "00000000-0000-4000-8000-000000000002", name: "Ouverture rapide", coverCardId: null, cardIds: cheap, updatedAt: "2026-09-25T10:00:00Z" },
      { id: "00000000-0000-4000-8000-000000000003", name: "Idées de deck", coverCardId: null, cardIds: [], updatedAt: "2026-09-24T10:00:00Z" },
    ],
  };
  const ok = async () => (refuse ? { ok: false as const, error: "Refus simulé du serveur (laboratoire)." } : { ok: true as const });
  let next = 4;
  return {
    fetchCardShelf: async () => start,
    setCardFavorite: ok,
    setCardInNotebook: ok,
    setNotebookCover: ok,
    renameNotebook: ok,
    deleteNotebook: ok,
    createNotebook: async (name, firstCardId) =>
      refuse
        ? { ok: false as const, error: "Refus simulé du serveur (laboratoire)." }
        : {
            ok: true as const,
            notebook: {
              id: `00000000-0000-4000-8000-${String(next++).padStart(12, "0")}`,
              name,
              coverCardId: null,
              cardIds: firstCardId ? [firstCardId] : [],
              updatedAt: new Date().toISOString(),
            },
          },
  };
}

/**
 * Laboratoire `/game/carnets-preview` : la VRAIE Collection (cœurs, filtre
 * « Favoris & carnets », fiche de carte) et le VRAI mur des carnets
 * (`?vue=mur`), sur une étagère en mémoire.
 */
export function ShelfPreview() {
  const params = useSearchParams();
  const refuse = params.get("refus") === "1";
  const backend = useMemo(() => memoryBackend(refuse), [refuse]);
  const owned = useMemo(() => CORE_SET.slice(0, 120).map((def) => def.id), []);

  if (params.get("vue") === "mur") {
    return (
      <CardShelfProvider backend={backend}>
        <NotebookWall isSignedIn />
      </CardShelfProvider>
    );
  }
  return (
    <CollectionScreen
      isSignedIn
      ownedCardIds={owned}
      ownedCounts={Object.fromEntries(owned.map((id) => [id, 1]))}
      shelfBackend={backend}
    />
  );
}
