"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getShipDefinition } from "@/game";
import { deleteDeck, duplicateDeck, renameDeck, type PlayerDeckSummary } from "@/app/decks/actions";
import { PaperSurface } from "@/features/shell/PaperSurface";
import { ScreenHeader } from "@/features/shell/ScreenHeader";
import { ScreenShell } from "@/features/shell/ScreenShell";
import { SearchLine } from "@/features/shell/SearchLine";
import { UtilityBar } from "@/features/shell/UtilityBar";
import shell from "@/features/shell/ScreenShell.module.css";
import styles from "@/features/decks/DeckScreens.module.css";
import { DeckTile } from "@/features/decks/DeckTile";
import { DeckContextMenu } from "@/features/decks/DeckContextMenu";
import { DeleteDeckDialog } from "@/features/decks/DeleteDeckDialog";
import { playButtonClick } from "@/lib/sound";

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
 * Écran des decks personnels — montée sur la MÊME coquille que la
 * Collection (`features/shell`) : header/panorama, surface de papier, barre
 * utilitaire basse. Là où la Collection pose des cartes sur le papier, cet
 * écran y pose des piles de cartes ; le reste de la grammaire est
 * identique, à dessein.
 *
 * Clic droit sur une tuile → menu contextuel (Renommer/Éditer/Dupliquer/
 * Supprimer), sur papier lui aussi. « Éditer » mène à `/decks/[deckId]`.
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
    <ScreenShell>
      <ScreenHeader active="decks" />

      <PaperSurface>
        {isSignedIn && initialDecks.length > 0 && (
          <div className={shell.inkControl}>
            <span className={shell.inkRule} aria-hidden />
            <span className={styles.deckCount}>
              {decks.length} deck{decks.length > 1 ? "s" : ""}
              {decks.length !== initialDecks.length && ` sur ${initialDecks.length}`}
            </span>
          </div>
        )}

        {!isSignedIn ? (
          <div className={shell.paperScrollFill}>
            <div className={styles.signedOut}>
              <span className={shell.emptyStateTitle}>Connecte-toi pour gérer tes decks</span>
              <p className={styles.signedOutText}>
                Tes decks sont enregistrés sur ton compte : ils te suivent d&apos;une partie à l&apos;autre.
              </p>
              <div className={styles.signedOutActions}>
                <Link href="/connexion" className={shell.primaryAction} onClick={() => playButtonClick()}>
                  Se connecter
                </Link>
                <Link href="/inscription" className={styles.signedOutGhost} onClick={() => playButtonClick()}>
                  Créer un compte
                </Link>
              </div>
            </div>
          </div>
        ) : (
          <div className={shell.paperScrollFill}>
            {decks.length === 0 ? (
              <div className={shell.emptyState}>
                <svg viewBox="0 0 24 24" width="30" height="30" fill="none" className={shell.emptyStateMark} aria-hidden>
                  <path
                    d="M4 8.5 12 5l8 3.5-8 3.5-8-3.5Z"
                    stroke="currentColor"
                    strokeWidth={1.3}
                    strokeLinejoin="round"
                  />
                  <path d="M4 13l8 3.5 8-3.5M4 17.5 12 21l8-3.5" stroke="currentColor" strokeWidth={1.3} strokeLinejoin="round" />
                </svg>
                <span className={shell.emptyStateTitle}>
                  {initialDecks.length === 0 ? "Aucun deck à bord" : "Aucun deck ne correspond"}
                </span>
                <p>
                  {initialDecks.length === 0
                    ? "Crée ton premier deck depuis la barre du bas : tu y choisiras tes cartes dans ta collection."
                    : "Essaie un autre nom, ou efface la recherche."}
                </p>
              </div>
            ) : (
              <div className={styles.deckGrid}>
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
        )}
      </PaperSurface>

      <UtilityBar
        left={
          isSignedIn ? (
            <Link href="/decks/nouveau" className={shell.primaryAction} onClick={() => playButtonClick()}>
              <span className={shell.plus} aria-hidden>
                +
              </span>
              Créer un deck
            </Link>
          ) : undefined
        }
        right={
          isSignedIn ? (
            <SearchLine value={search} onChange={setSearch} placeholder="Rechercher un deck…" label="Rechercher un deck" />
          ) : undefined
        }
      />

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
    </ScreenShell>
  );
}
