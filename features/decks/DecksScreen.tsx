"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RULES } from "@/game";
import { deleteDeck, duplicateDeck, renameDeck, type PlayerDeckSummary } from "@/app/decks/actions";
import { DeleteDeckDialog } from "@/features/decks/DeleteDeckDialog";
import { Dialog } from "@/features/shell/Dialog";
import { GameScreen } from "@/features/shell/GameScreen";
import { SearchLine } from "@/features/shell/SearchLine";
import { ShipPortrait, shipNameOf } from "@/features/ships/ShipPortrait";
import game from "@/features/shell/GameScreen.module.css";
import styles from "@/features/decks/DecksList.module.css";
import { playButtonClick } from "@/lib/sound";

/** Insensible aux accents et à la casse. */
function normalizeSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

interface DecksScreenProps {
  isSignedIn: boolean;
  initialDecks: PlayerDeckSummary[];
}

/**
 * Mes decks — la même coquille que la Collection et l'éditeur. Chaque deck
 * est une tuile dont l'identité est son Navire (dans le cadre du plateau) ;
 * on lit le nom, le Navire, l'effectif et la validité (`is_valid`, recalculé
 * par le serveur à chaque sauvegarde — jamais estimé ici). Ouvrir mène à
 * l'éditeur ; dupliquer, renommer et supprimer restent sur place, la
 * suppression demandant confirmation.
 */
export function DecksScreen({ isSignedIn, initialDecks }: DecksScreenProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [renameTarget, setRenameTarget] = useState<PlayerDeckSummary | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PlayerDeckSummary | null>(null);
  const [isPending, startTransition] = useTransition();

  const decks = useMemo(() => {
    const query = normalizeSearch(search.trim());
    if (!query) return initialDecks;
    return initialDecks.filter((deck) => normalizeSearch(deck.name).includes(query));
  }, [initialDecks, search]);

  function handleRenameSubmit(name: string) {
    const deck = renameTarget;
    setRenameTarget(null);
    if (!deck || name.trim() === deck.name || !name.trim()) return;
    startTransition(async () => {
      const result = await renameDeck(deck.id, name);
      if (result.ok) router.refresh();
    });
  }

  function handleDuplicate(deckId: string) {
    playButtonClick();
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
    <GameScreen
      active="decks"
      actions={
        isSignedIn && initialDecks.length > 0 ? (
          <div className={game.headerSearch}>
            <SearchLine variant="pill" value={search} onChange={setSearch} placeholder="Rechercher un deck…" label="Rechercher un deck" />
          </div>
        ) : undefined
      }
    >
      <div className={game.content}>
        <div className={game.contentWide}>
          <div className={game.pageHead}>
            <div>
              <p className={game.eyebrow}>Mes decks</p>
              <h1 className={game.title}>
                {isSignedIn
                  ? `${decks.length} deck${decks.length > 1 ? "s" : ""}${decks.length !== initialDecks.length ? ` sur ${initialDecks.length}` : ""}`
                  : "Tes decks"}
              </h1>
            </div>
            {isSignedIn && (
              <Link href="/decks/nouveau" className={game.primary} onClick={() => playButtonClick()}>
                + Créer un deck
              </Link>
            )}
          </div>

          {!isSignedIn ? (
            <div className={`${game.panel} ${game.empty}`}>
              <p className={game.emptyTitle}>Connecte-toi pour gérer tes decks</p>
              <p className={game.muted}>Tes decks sont enregistrés sur ton compte : ils te suivent d&apos;une partie à l&apos;autre.</p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center", marginTop: 6 }}>
                <Link href="/connexion" className={game.primary} onClick={() => playButtonClick()}>
                  Se connecter
                </Link>
                <Link href="/inscription" className={game.secondary} onClick={() => playButtonClick()}>
                  Créer un compte
                </Link>
              </div>
            </div>
          ) : decks.length === 0 && initialDecks.length > 0 ? (
            <div className={`${game.panel} ${game.empty}`}>
              <p className={game.emptyTitle}>Aucun deck ne correspond</p>
              <p className={game.muted}>Essaie un autre nom, ou efface la recherche.</p>
            </div>
          ) : (
            <div className={styles.grid}>
              {decks.map((deck) => (
                <article key={deck.id} className={`${game.panelRaised} ${styles.tile}`} aria-label={deck.name}>
                  <ShipPortrait shipId={deck.shipId} width="100%" showName={false} className={styles.tilePortrait} />
                  <div className={styles.tileBody}>
                    <button
                      type="button"
                      className={styles.tileName}
                      onClick={() => {
                        playButtonClick();
                        router.push(`/decks/${deck.id}`);
                      }}
                      title={deck.name}
                    >
                      {deck.name}
                    </button>
                    <span className={styles.tileShip}>{shipNameOf(deck.shipId)}</span>
                    <span className={styles.tileMeta}>
                      <span>
                        {deck.cardCount} / {RULES.DECK_SIZE_MAX} cartes
                      </span>
                      {deck.isValid ? (
                        <span className={game.tagSuccess}>Jouable</span>
                      ) : (
                        <span className={game.tagDanger}>{deck.cardCount < RULES.DECK_SIZE_MIN ? `Min. ${RULES.DECK_SIZE_MIN}` : "Non valide"}</span>
                      )}
                    </span>
                    <div className={styles.tileActions}>
                      <Link href={`/decks/${deck.id}`} className={`${game.secondary} ${styles.tileOpen}`} onClick={() => playButtonClick()}>
                        Ouvrir
                      </Link>
                      <button type="button" className={game.link} onClick={() => setRenameTarget(deck)} disabled={isPending}>
                        Renommer
                      </button>
                      <button type="button" className={game.link} onClick={() => handleDuplicate(deck.id)} disabled={isPending}>
                        Dupliquer
                      </button>
                      <button type="button" className={game.link} onClick={() => setDeleteTarget(deck)} disabled={isPending}>
                        Supprimer
                      </button>
                    </div>
                  </div>
                </article>
              ))}

              <Link href="/decks/nouveau" className={styles.newTile} onClick={() => playButtonClick()}>
                <span className={styles.newTileMark} aria-hidden>
                  +
                </span>
                Nouveau deck
              </Link>
            </div>
          )}
        </div>
      </div>

      {renameTarget && <RenameDeckDialog deck={renameTarget} onSubmit={handleRenameSubmit} onCancel={() => setRenameTarget(null)} />}

      {deleteTarget && (
        <DeleteDeckDialog deckName={deleteTarget.name} isDeleting={isPending} onConfirm={handleConfirmDelete} onCancel={() => setDeleteTarget(null)} />
      )}
    </GameScreen>
  );
}

function RenameDeckDialog({ deck, onSubmit, onCancel }: { deck: PlayerDeckSummary; onSubmit: (name: string) => void; onCancel: () => void }) {
  const [name, setName] = useState(deck.name);
  const formId = `rename-${deck.id}`;

  return (
    <Dialog
      title="Renommer le deck"
      onClose={onCancel}
      actions={
        <>
          <button type="button" className={game.secondary} onClick={onCancel}>
            Annuler
          </button>
          <button type="submit" form={formId} className={game.primary} disabled={!name.trim()}>
            Renommer
          </button>
        </>
      }
    >
      <form
        id={formId}
        className={game.field}
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit(name);
        }}
      >
        <label className={game.fieldLabel} htmlFor={`${formId}-input`}>
          Nom du deck
        </label>
        <input id={`${formId}-input`} className={game.input} value={name} onChange={(event) => setName(event.target.value)} maxLength={60} autoFocus />
      </form>
    </Dialog>
  );
}
