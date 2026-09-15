"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RULES } from "@/game";
import { deleteDeck, duplicateDeck, renameDeck, type PlayerDeckSummary } from "@/app/decks/actions";
import type { DeckCatalogView } from "@/features/decks/catalogService";
import { DeckCatalogSection } from "@/features/decks/DeckCatalogSection";
import { DeleteDeckDialog } from "@/features/decks/DeleteDeckDialog";
import { Dialog } from "@/features/shell/Dialog";
import { GameScreen } from "@/features/shell/GameScreen";
import { SearchLine } from "@/features/shell/SearchLine";
import { shipNameOf } from "@/features/ships/ShipPortrait";
import { ArtPlate } from "@/features/shell/ArtPlate";
import { plateArtUrl } from "@/features/decks/nameplateArt";
import game from "@/features/shell/GameScreen.module.css";
import styles from "@/features/decks/DecksList.module.css";
import catalogStyles from "@/features/decks/DeckCatalog.module.css";
import { playButtonClick } from "@/lib/sound";

/** Insensible aux accents et à la casse. */
function normalizeSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/**
 * Les trois rayons de l'écran Decks (Notion « Progression joueur » §4 :
 * « ajouter au minimum les catégories Mes decks / Decks d'emprunt /
 * Préconstruits »).
 */
type DeckCategory = "mine" | "borrowed" | "precon";

const CATEGORY_LABELS: Record<DeckCategory, string> = {
  mine: "Mes decks",
  borrowed: "Decks d'emprunt",
  precon: "Préconstruits",
};

interface DecksScreenProps {
  isSignedIn: boolean;
  initialDecks: PlayerDeckSummary[];
  /** Decks fournis par le jeu, avec la possession réelle du joueur. */
  catalog: DeckCatalogView;
}

/**
 * Mes decks — la même coquille que la Collection et l'éditeur. Chaque deck
 * est une tuile dont l'identité est son Navire (dans le cadre du plateau) ;
 * on lit le nom, le Navire, l'effectif et la validité (`is_valid`, recalculé
 * par le serveur à chaque sauvegarde — jamais estimé ici). Ouvrir mène à
 * l'éditeur ; dupliquer, renommer et supprimer restent sur place, la
 * suppression demandant confirmation.
 */
export function DecksScreen({ isSignedIn, initialDecks, catalog }: DecksScreenProps) {
  const router = useRouter();
  // Le joueur qui n'a pas encore emprunté de deck arrive directement sur le
  // rayon d'emprunt : c'est l'étape qui lui manque pour jouer.
  const [category, setCategory] = useState<DeckCategory>(isSignedIn && catalog.borrowedDeckId === null ? "borrowed" : "mine");
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
        isSignedIn && category === "mine" && initialDecks.length > 0 ? (
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
              <p className={game.eyebrow}>Decks</p>
              <h1 className={game.title}>
                {category === "mine"
                  ? isSignedIn
                    ? `${decks.length} deck${decks.length > 1 ? "s" : ""}${decks.length !== initialDecks.length ? ` sur ${initialDecks.length}` : ""}`
                    : "Tes decks"
                  : CATEGORY_LABELS[category]}
              </h1>
            </div>
            {isSignedIn && category === "mine" && (
              <Link href="/decks/nouveau" className={game.primary} onClick={() => playButtonClick()}>
                + Créer un deck
              </Link>
            )}
          </div>

          {/* Les trois rayons. Un préconstruit verrouillé reste visible et
              consultable : c'est ce qui donne envie de dépenser un Jeton. */}
          <div className={catalogStyles.categories} role="tablist" aria-label="Catégories de decks">
            {(Object.keys(CATEGORY_LABELS) as DeckCategory[]).map((key) => {
              const count = key === "mine" ? initialDecks.length : key === "borrowed" ? catalog.borrowed.length : catalog.precon.length;
              return (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={category === key}
                  className={category === key ? catalogStyles.categoryActive : catalogStyles.category}
                  onClick={() => {
                    playButtonClick();
                    setCategory(key);
                  }}
                >
                  {CATEGORY_LABELS[key]}
                  <span className={catalogStyles.categoryCount}>{count}</span>
                </button>
              );
            })}
          </div>

          {category !== "mine" ? (
            <DeckCatalogSection catalog={catalog} kind={category} />
          ) : !isSignedIn ? (
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
                  <ArtPlate artUrl={plateArtUrl(deck.artCardId, deck.shipId)} className={styles.tilePlate}>
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
                  </ArtPlate>
                  <div className={styles.tileBody}>
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
