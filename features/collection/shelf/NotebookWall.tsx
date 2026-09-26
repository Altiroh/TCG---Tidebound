"use client";

import Link from "next/link";
import { useState, type FormEvent, type ReactNode } from "react";
import { getCardDefinition } from "@/game";
import { cardIllustrationThumbUrl } from "@/features/decks/cardArtUrl";
import { useCardShelf } from "@/features/collection/shelf/CardShelfProvider";
import { HeartGlyph, NotebookGlyph } from "@/features/collection/CollectionSidebar";
import { NOTEBOOK_LIMIT, NOTEBOOK_NAME_MAX, notebookCover, type CardNotebook } from "@/features/collection/shelf/shelf";
import { Dialog } from "@/features/shell/Dialog";
import { GameScreen } from "@/features/shell/GameScreen";
import { playButtonClick } from "@/lib/sound";
import game from "@/features/shell/GameScreen.module.css";
import styles from "@/features/collection/shelf/Shelf.module.css";

function cardName(cardId: string): string {
  try {
    return getCardDefinition(cardId).name;
  } catch {
    return cardId;
  }
}

/**
 * La mosaïque d'une tuile, à la Pinterest : une grande image à gauche (la
 * couverture), deux petites empilées à droite (les cartes suivantes). Des
 * emplacements vides, en creux, tant que le carnet a moins de trois cartes.
 */
function Mosaic({ cover, others }: { cover: string | null; others: string[] }) {
  const slots = [cover, others[0] ?? null, others[1] ?? null];
  return (
    <div className={styles.mosaic} aria-hidden>
      {slots.map((cardId, index) =>
        cardId ? (
          // eslint-disable-next-line @next/next/no-img-element -- vignette locale, taille fixe
          <img key={index} src={cardIllustrationThumbUrl(cardId)} alt="" draggable={false} data-slot={index} loading="lazy" />
        ) : (
          <span key={index} className={styles.mosaicEmpty} data-slot={index} />
        )
      )}
    </div>
  );
}

function Tile({ href, title, count, cover, others, glyph, menu }: { href: string; title: string; count: number; cover: string | null; others: string[]; glyph: ReactNode; menu?: ReactNode }) {
  return (
    <li className={styles.tile}>
      <Link href={href} className={styles.tileLink} onClick={() => playButtonClick()}>
        <Mosaic cover={cover} others={others} />
        <span className={styles.tileText}>
          <span className={styles.tileName}>
            {glyph} {title}
          </span>
          <span className={styles.tileCount}>
            {count} carte{count > 1 ? "s" : ""}
          </span>
        </span>
      </Link>
      {menu}
    </li>
  );
}

type Editing = { kind: "create" } | { kind: "rename"; notebook: CardNotebook } | { kind: "delete"; notebook: CardNotebook } | { kind: "cover"; notebook: CardNotebook } | null;

/**
 * LE MUR DES CARNETS — tous les carnets du joueur en tuiles, comme les
 * tableaux d'un profil Pinterest, ses Favoris en tête. Une tuile ouvre la
 * Collection filtrée sur ce carnet ; son menu le renomme, change sa
 * couverture ou le supprime (jamais les cartes elles-mêmes).
 *
 * Doit vivre dans un `CardShelfProvider` (page `/collection/carnets`).
 */
export function NotebookWall({ isSignedIn }: { isSignedIn: boolean }) {
  const shelf = useCardShelf();
  const [editing, setEditing] = useState<Editing>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function open(next: Editing) {
    playButtonClick();
    setError(null);
    setName(next && next.kind === "rename" ? next.notebook.name : "");
    setEditing(next);
  }

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    if (!shelf || !editing || busy) return;
    setBusy(true);
    const result =
      editing.kind === "create"
        ? await shelf.createNotebook(name)
        : editing.kind === "rename"
          ? await shelf.renameNotebook(editing.notebook.id, name)
          : editing.kind === "delete"
            ? await shelf.deleteNotebook(editing.notebook.id)
            : { ok: true as const };
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setEditing(null);
  }

  const notebooks = shelf?.shelf.notebooks ?? [];
  const favorites = shelf?.shelf.favorites ?? [];
  const full = notebooks.length >= NOTEBOOK_LIMIT;

  let body: ReactNode;
  if (!isSignedIn || (shelf?.ready && !shelf.available)) {
    body = (
      <p className={styles.wallEmpty}>
        {isSignedIn ? "Les carnets sont indisponibles pour le moment." : "Connecte-toi pour garder tes cartes favorites et les ranger dans des carnets."}
      </p>
    );
  } else if (!shelf?.ready) {
    body = <p className={styles.wallEmpty}>Ouverture des carnets…</p>;
  } else {
    body = (
      <>
        <ul className={styles.wall}>
          <Tile
            href="/collection?favoris"
            title="Favoris"
            count={favorites.length}
            // Les plus récents en avant : ce qu'on vient d'aimer.
            cover={favorites[favorites.length - 1] ?? null}
            others={favorites.slice(0, -1).reverse()}
            glyph={<HeartGlyph />}
          />
          {notebooks.map((notebook) => {
            const cover = notebookCover(notebook);
            return (
              <Tile
                key={notebook.id}
                href={`/collection?carnet=${notebook.id}`}
                title={notebook.name}
                count={notebook.cardIds.length}
                cover={cover}
                others={notebook.cardIds.filter((id) => id !== cover)}
                glyph={<NotebookGlyph />}
                menu={
                  <div className={styles.tileMenu}>
                    <button type="button" onClick={() => open({ kind: "rename", notebook })}>
                      Renommer
                    </button>
                    <button type="button" disabled={notebook.cardIds.length < 2} onClick={() => open({ kind: "cover", notebook })}>
                      Couverture
                    </button>
                    <button type="button" data-danger="" onClick={() => open({ kind: "delete", notebook })}>
                      Supprimer
                    </button>
                  </div>
                }
              />
            );
          })}
          <li className={styles.tile}>
            <button type="button" className={styles.newTile} disabled={full} onClick={() => open({ kind: "create" })}>
              <span aria-hidden>+</span>
              {full ? `${NOTEBOOK_LIMIT} carnets au plus` : "Nouveau carnet"}
            </button>
          </li>
        </ul>
        {notebooks.length === 0 && (
          <p className={styles.wallHint}>
            Un carnet range des cartes sous un nom — « Combo Abysses », « Mes Marionnettes ». Crée-en un ici, ou depuis la fiche d&apos;une carte :
            « Ranger dans un carnet ».
          </p>
        )}
      </>
    );
  }

  return (
    <GameScreen active="collection">
      <section className={`${game.panel} ${styles.wallPanel}`} aria-labelledby="carnets-titre">
        <header className={styles.wallHead}>
          <div>
            <Link href="/collection" className={styles.back} onClick={() => playButtonClick()}>
              ← Collection
            </Link>
            <h1 id="carnets-titre" className={styles.wallTitle}>
              Mes carnets
            </h1>
          </div>
        </header>
        {body}
      </section>

      {(editing?.kind === "create" || editing?.kind === "rename") && (
        <Dialog
          title={editing.kind === "create" ? "Nouveau carnet" : "Renommer le carnet"}
          onClose={() => setEditing(null)}
          actions={
            <>
              <button type="button" className={game.ghost} onClick={() => setEditing(null)}>
                Annuler
              </button>
              <button type="button" className={game.primary} disabled={busy || !name.trim()} onClick={() => void submit()}>
                {editing.kind === "create" ? "Créer" : "Renommer"}
              </button>
            </>
          }
        >
          <form onSubmit={submit}>
            <input
              autoFocus
              className={game.input}
              value={name}
              maxLength={NOTEBOOK_NAME_MAX}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ex. Combo Abysses"
              aria-label="Nom du carnet"
              aria-invalid={error ? true : undefined}
            />
            {error && (
              <p className={styles.inlineError} role="alert">
                {error}
              </p>
            )}
          </form>
        </Dialog>
      )}

      {editing?.kind === "delete" && (
        <Dialog
          title="Supprimer ce carnet ?"
          tone="danger"
          description={`« ${editing.notebook.name} » disparaît du mur. Ses ${editing.notebook.cardIds.length} carte(s) restent dans ta collection et tes favoris.`}
          onClose={() => setEditing(null)}
          actions={
            <>
              <button type="button" className={game.ghost} onClick={() => setEditing(null)}>
                Garder
              </button>
              <button type="button" className={game.danger} disabled={busy} onClick={() => void submit()}>
                Supprimer
              </button>
            </>
          }
        >
          {error && (
            <p className={styles.inlineError} role="alert">
              {error}
            </p>
          )}
        </Dialog>
      )}

      {editing?.kind === "cover" && (
        <Dialog title="Choisir la couverture" description={editing.notebook.name} width={620} onClose={() => setEditing(null)}>
          <ul className={styles.coverPicker}>
            {editing.notebook.cardIds.map((cardId) => {
              const current = notebookCover(editing.notebook) === cardId;
              return (
                <li key={cardId}>
                  <button
                    type="button"
                    data-current={current || undefined}
                    aria-pressed={current}
                    title={cardName(cardId)}
                    onClick={() => {
                      playButtonClick();
                      shelf?.setCover(editing.notebook.id, cardId);
                      setEditing(null);
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- vignette locale */}
                    <img src={cardIllustrationThumbUrl(cardId)} alt={cardName(cardId)} draggable={false} loading="lazy" />
                  </button>
                </li>
              );
            })}
          </ul>
        </Dialog>
      )}
    </GameScreen>
  );
}
