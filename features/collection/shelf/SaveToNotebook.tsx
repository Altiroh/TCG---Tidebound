"use client";

import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { useCardShelf, type CardShelfContextValue } from "@/features/collection/shelf/CardShelfProvider";
import { NOTEBOOK_LIMIT, NOTEBOOK_NAME_MAX, bestNotebookChoices, notebookCover, type CardNotebook } from "@/features/collection/shelf/shelf";
import { normalizeSearch } from "@/features/collection/cardFilters";
import { cardIllustrationThumbUrl } from "@/features/decks/cardArtUrl";
import { playButtonClick } from "@/lib/sound";
import styles from "@/features/collection/shelf/Shelf.module.css";

/** Largeur du panneau de choix — et marge gardée aux bords de l'écran. */
const POPOVER_WIDTH = 300;
const EDGE = 12;

/**
 * « RANGER » — le geste de Pinterest, pour ranger une carte dans un
 * carnet :
 *
 *   [ Carnet ▾ ] [ Ranger ]
 *
 * Le bouton range la carte d'un clic dans le carnet affiché (le dernier
 * utilisé, `CardShelfContextValue.target`) ; déjà rangée, il devient
 * « Rangé », et un nouveau clic l'en retire. (« Enregistrer » jusqu'au
 * 26/09/2026 : le mot du jeu est « ranger », un carnet se range.) Le sélecteur ouvre le
 * panneau de choix : recherche, « Meilleurs choix », tous les carnets avec
 * leur couverture, et « Créer un carnet » en pied.
 *
 * `overlay` : posé en haut de la carte de la grille, visible AU SURVOL
 * (comme sur une épingle Pinterest). `inline` : dans la fiche de la carte.
 * Rien hors d'une étagère disponible.
 */
export function SaveToNotebook({ cardId, variant }: { cardId: string; variant: "overlay" | "inline" }) {
  const shelf = useCardShelf();
  const anchorRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  if (!shelf?.available) return null;

  const target = shelf.target;
  const saved = Boolean(target?.cardIds.includes(cardId));

  return (
    <div
      ref={anchorRef}
      className={styles.saveBar}
      data-variant={variant}
      data-open={open || undefined}
      // Rien de ce qui se passe ici ne doit ouvrir la fiche ni ajouter la carte au deck.
      onClick={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        className={styles.savePicker}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={target ? `Carnet : ${target.name}` : "Choisir un carnet"}
        onClick={() => {
          playButtonClick();
          setOpen((value) => !value);
        }}
      >
        <span className={styles.savePickerName}>{target?.name ?? "Carnet"}</span>
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" aria-hidden>
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <button
        type="button"
        className={styles.saveButton}
        data-saved={saved || undefined}
        aria-pressed={saved}
        onClick={() => {
          playButtonClick();
          // Aucun carnet encore : « Ranger » ouvre le choix, où l'on en crée un.
          if (!target) return setOpen(true);
          shelf.setInNotebook(target.id, cardId, !saved);
        }}
      >
        {saved ? "Rangé" : "Ranger"}
      </button>
      {open && <SavePopover anchor={anchorRef} cardId={cardId} shelf={shelf} onClose={() => setOpen(false)} />}
    </div>
  );
}

/** Position du panneau : sous le sélecteur, aligné à droite, remonté au-dessus s'il manque de place. */
function usePopoverPosition(anchor: React.RefObject<HTMLElement>, panel: React.RefObject<HTMLElement>) {
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  useLayoutEffect(() => {
    const anchorBox = anchor.current?.getBoundingClientRect();
    const height = panel.current?.offsetHeight ?? 380;
    if (!anchorBox) return;
    const left = Math.min(Math.max(EDGE, anchorBox.right - POPOVER_WIDTH), window.innerWidth - POPOVER_WIDTH - EDGE);
    const below = anchorBox.bottom + 8;
    const top = below + height > window.innerHeight - EDGE ? Math.max(EDGE, anchorBox.top - height - 8) : below;
    setPosition({ top, left });
  }, [anchor, panel]);
  return position;
}

function SavePopover({
  anchor,
  cardId,
  shelf,
  onClose,
}: {
  anchor: React.RefObject<HTMLElement>;
  cardId: string;
  shelf: CardShelfContextValue;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const position = usePopoverPosition(anchor, panelRef);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fermé par un clic ailleurs, Échap (sans fermer la fiche derrière), ou quand la page défile.
  useEffect(() => {
    function onPointer(event: PointerEvent) {
      const node = event.target as Node;
      if (panelRef.current?.contains(node) || anchor.current?.contains(node)) return;
      onClose();
    }
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      onClose();
    }
    function onScroll(event: Event) {
      if (panelRef.current?.contains(event.target as Node)) return;
      onClose();
    }
    window.addEventListener("pointerdown", onPointer, true);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onClose);
    return () => {
      window.removeEventListener("pointerdown", onPointer, true);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onClose);
    };
  }, [anchor, onClose]);

  const needle = normalizeSearch(query.trim());
  const matches = (notebook: CardNotebook) => !needle || normalizeSearch(notebook.name).includes(needle);
  const best = needle ? [] : bestNotebookChoices(shelf.shelf);
  const all = [...shelf.shelf.notebooks].filter(matches).sort((a, b) => a.name.localeCompare(b.name, "fr"));
  const full = shelf.shelf.notebooks.length >= NOTEBOOK_LIMIT;

  function pick(notebook: CardNotebook) {
    playButtonClick();
    const inside = notebook.cardIds.includes(cardId);
    shelf.setTarget(notebook.id);
    shelf.setInNotebook(notebook.id, cardId, !inside);
    // Ranger referme le panneau, comme sur Pinterest ; retirer le laisse ouvert.
    if (!inside) onClose();
  }

  async function create(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await shelf.createNotebook(name, cardId);
    setBusy(false);
    if (!result.ok) return setError(result.error);
    onClose();
  }

  const row = (notebook: CardNotebook) => {
    const cover = notebookCover(notebook);
    const inside = notebook.cardIds.includes(cardId);
    return (
      <li key={notebook.id}>
        <button type="button" className={styles.popoverRow} data-inside={inside || undefined} onClick={() => pick(notebook)}>
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element -- vignette locale
            <img src={cardIllustrationThumbUrl(cover)} alt="" draggable={false} />
          ) : (
            <span className={styles.popoverThumbEmpty} aria-hidden />
          )}
          <span className={styles.popoverName}>{notebook.name}</span>
          {inside ? <span className={styles.popoverSaved}>Rangé</span> : <span className={styles.popoverCount}>{notebook.cardIds.length}</span>}
        </button>
      </li>
    );
  };

  const panel = (
    <div
      ref={panelRef}
      className={styles.popover}
      role="dialog"
      aria-label="Ranger dans un carnet"
      style={{ width: POPOVER_WIDTH, top: position?.top ?? -9999, left: position?.left ?? -9999 }}
      onClick={(event) => event.stopPropagation()}
    >
      <p className={styles.popoverTitle}>Ranger</p>
      {shelf.shelf.notebooks.length > 0 && (
        <input
          autoFocus
          type="search"
          className={styles.popoverSearch}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Rechercher"
          aria-label="Rechercher un carnet"
        />
      )}
      <div className={styles.popoverScroll}>
        {best.length > 0 && (
          <>
            <p className={styles.popoverSection}>Meilleurs choix</p>
            <ul className={styles.popoverList}>{best.map(row)}</ul>
          </>
        )}
        {all.length > 0 && (
          <>
            <p className={styles.popoverSection}>Tous les carnets</p>
            <ul className={styles.popoverList}>{all.map(row)}</ul>
          </>
        )}
        {shelf.shelf.notebooks.length === 0 && <p className={styles.popoverEmpty}>Aucun carnet pour l&apos;instant : crée le premier.</p>}
        {shelf.shelf.notebooks.length > 0 && all.length === 0 && <p className={styles.popoverEmpty}>Aucun carnet de ce nom.</p>}
      </div>
      <div className={styles.popoverFoot}>
        {creating ? (
          <form className={styles.createForm} onSubmit={create}>
            <input
              autoFocus
              value={name}
              maxLength={NOTEBOOK_NAME_MAX}
              onChange={(event) => setName(event.target.value)}
              placeholder="Nom du carnet"
              aria-label="Nom du nouveau carnet"
            />
            <button type="submit" disabled={busy || !name.trim()}>
              Créer
            </button>
          </form>
        ) : (
          <button
            type="button"
            className={styles.popoverCreate}
            disabled={full}
            onClick={() => {
              playButtonClick();
              setName(query.trim());
              setCreating(true);
            }}
          >
            <span aria-hidden>+</span>
            {full ? `${NOTEBOOK_LIMIT} carnets au plus` : "Créer un carnet"}
          </button>
        )}
        {error && (
          <p className={styles.inlineError} role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  );

  return createPortal(panel, document.body);
}
