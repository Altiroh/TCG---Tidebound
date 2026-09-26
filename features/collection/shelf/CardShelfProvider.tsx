"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  EMPTY_SHELF,
  notebookNameTaken,
  normalizeNotebookName,
  sortNotebooks,
  withCardInNotebook,
  withFavorite,
  type CardNotebook,
  type CardShelf,
} from "@/features/collection/shelf/shelf";
import * as serverShelf from "@/features/collection/shelf/shelfActions";
import type { NotebookResult, ShelfResult } from "@/features/collection/shelf/shelfActions";
import styles from "@/features/collection/shelf/Shelf.module.css";

/**
 * D'où l'étagère est lue et où elle s'écrit. Par défaut, le COMPTE (actions
 * serveur) ; le laboratoire `/game/carnets-preview` en donne une en mémoire,
 * pour régler l'interface sans compte ni base.
 */
export interface ShelfBackend {
  fetchCardShelf: () => Promise<CardShelf | null>;
  setCardFavorite: (cardId: string, favorite: boolean) => Promise<ShelfResult>;
  createNotebook: (name: string, firstCardId?: string) => Promise<NotebookResult>;
  renameNotebook: (notebookId: string, name: string) => Promise<ShelfResult>;
  deleteNotebook: (notebookId: string) => Promise<ShelfResult>;
  setNotebookCover: (notebookId: string, cardId: string | null) => Promise<ShelfResult>;
  setCardInNotebook: (notebookId: string, cardId: string, inside: boolean) => Promise<ShelfResult>;
}

const SERVER_BACKEND: ShelfBackend = serverShelf;

export interface CardShelfContextValue {
  shelf: CardShelf;
  /** L'étagère est lue (ou sa lecture a échoué). */
  ready: boolean;
  /** Le joueur a une étagère (connecté, tables présentes). Sinon : ni cœurs ni carnets. */
  available: boolean;
  /** Dernier refus du serveur, à afficher ; effacé par `clearError`. */
  error: string | null;
  clearError: () => void;
  isFavorite: (cardId: string) => boolean;
  toggleFavorite: (cardId: string) => void;
  /** Carnets qui contiennent la carte. */
  notebooksOf: (cardId: string) => CardNotebook[];
  setInNotebook: (notebookId: string, cardId: string, inside: boolean) => void;
  createNotebook: (name: string, firstCardId?: string) => Promise<NotebookResult>;
  renameNotebook: (notebookId: string, name: string) => Promise<ShelfResult>;
  deleteNotebook: (notebookId: string) => Promise<ShelfResult>;
  setCover: (notebookId: string, cardId: string | null) => void;
}

const CardShelfContext = createContext<CardShelfContextValue | null>(null);

/**
 * L'étagère d'un écran qui feuillette le catalogue (Collection, Éditeur de
 * deck, mur de carnets). Les composants qui en ont besoin — le cœur d'une
 * carte, les carnets de la fiche, le filtre de la colonne — la lisent par
 * `useCardShelf()` ; hors de ce fournisseur, ils ne s'affichent pas (la
 * fiche de carte ouverte depuis un booster ou une partie reste telle quelle).
 *
 * Chaque geste s'applique AUSSITÔT à l'écran, puis part au serveur ; un
 * refus rétablit l'étagère d'avant et affiche le motif.
 */
export function CardShelfProvider({
  children,
  initialShelf,
  backend: backendProp,
}: {
  children: ReactNode;
  /** Étagère déjà lue par la page ; absente : lue au montage. `null` : pas d'étagère (visiteur). */
  initialShelf?: CardShelf | null;
  backend?: ShelfBackend;
}) {
  const backend = backendProp ?? SERVER_BACKEND;
  const [shelf, setShelf] = useState<CardShelf>(initialShelf ?? EMPTY_SHELF);
  const [available, setAvailable] = useState(initialShelf != null);
  const [ready, setReady] = useState(initialShelf !== undefined);
  const [error, setError] = useState<string | null>(null);
  // Toujours la dernière étagère, pour qu'un refus rétablisse exactement ce qu'il y avait avant le geste.
  const shelfRef = useRef(shelf);
  shelfRef.current = shelf;

  useEffect(() => {
    if (initialShelf !== undefined) return;
    let cancelled = false;
    backend
      .fetchCardShelf()
      .then((loaded) => {
        if (cancelled) return;
        setShelf(loaded ?? EMPTY_SHELF);
        setAvailable(loaded !== null);
      })
      .catch(() => undefined)
      .finally(() => !cancelled && setReady(true));
    return () => {
      cancelled = true;
    };
  }, [backend, initialShelf]);

  /** Applique `next` tout de suite ; si le serveur refuse, rétablit l'état d'avant. */
  const optimistic = useCallback((next: (current: CardShelf) => CardShelf, send: () => Promise<ShelfResult>) => {
    const before = shelfRef.current;
    setShelf(next(before));
    send()
      .then((result) => {
        if (result.ok) return;
        setShelf(before);
        setError(result.error);
      })
      .catch(() => {
        setShelf(before);
        setError("Serveur injoignable — réessaie.");
      });
  }, []);

  const value = useMemo<CardShelfContextValue>(() => {
    const favorites = new Set(shelf.favorites);
    return {
      shelf,
      ready,
      available,
      error,
      clearError: () => setError(null),
      isFavorite: (cardId) => favorites.has(cardId),
      toggleFavorite: (cardId) => {
        const favorite = !favorites.has(cardId);
        optimistic((current) => withFavorite(current, cardId, favorite), () => backend.setCardFavorite(cardId, favorite));
      },
      notebooksOf: (cardId) => shelf.notebooks.filter((notebook) => notebook.cardIds.includes(cardId)),
      setInNotebook: (notebookId, cardId, inside) =>
        optimistic(
          (current) => withCardInNotebook(current, notebookId, cardId, inside, new Date().toISOString()),
          () => backend.setCardInNotebook(notebookId, cardId, inside)
        ),
      createNotebook: async (rawName, firstCardId) => {
        const named = normalizeNotebookName(rawName);
        if (!named.ok) return named;
        if (notebookNameTaken(shelfRef.current.notebooks, named.name)) return { ok: false, error: "Tu as déjà un carnet de ce nom." };
        const result = await backend.createNotebook(named.name, firstCardId).catch(() => ({ ok: false as const, error: "Serveur injoignable — réessaie." }));
        if (result.ok) setShelf((current) => ({ ...current, notebooks: sortNotebooks([result.notebook, ...current.notebooks]) }));
        return result;
      },
      renameNotebook: async (notebookId, rawName) => {
        const named = normalizeNotebookName(rawName);
        if (!named.ok) return named;
        if (notebookNameTaken(shelfRef.current.notebooks, named.name, notebookId)) return { ok: false, error: "Tu as déjà un carnet de ce nom." };
        const result = await backend.renameNotebook(notebookId, named.name).catch(() => ({ ok: false as const, error: "Serveur injoignable — réessaie." }));
        if (result.ok) {
          setShelf((current) => ({
            ...current,
            notebooks: sortNotebooks(
              current.notebooks.map((notebook) => (notebook.id === notebookId ? { ...notebook, name: named.name, updatedAt: new Date().toISOString() } : notebook))
            ),
          }));
        }
        return result;
      },
      deleteNotebook: async (notebookId) => {
        const result = await backend.deleteNotebook(notebookId).catch(() => ({ ok: false as const, error: "Serveur injoignable — réessaie." }));
        if (result.ok) setShelf((current) => ({ ...current, notebooks: current.notebooks.filter((notebook) => notebook.id !== notebookId) }));
        return result;
      },
      setCover: (notebookId, cardId) =>
        optimistic(
          (current) => ({
            ...current,
            notebooks: current.notebooks.map((notebook) => (notebook.id === notebookId ? { ...notebook, coverCardId: cardId } : notebook)),
          }),
          () => backend.setNotebookCover(notebookId, cardId)
        ),
    };
  }, [shelf, ready, available, error, backend, optimistic]);

  // Un refus s'efface de lui-même : l'étagère est déjà rétablie, le motif suffit à le lire.
  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), 5000);
    return () => clearTimeout(timer);
  }, [error]);

  return (
    <CardShelfContext.Provider value={value}>
      {children}
      {error && (
        <div className={styles.toast} role="alert">
          {error}
          <button type="button" aria-label="Fermer" onClick={() => setError(null)}>
            ×
          </button>
        </div>
      )}
    </CardShelfContext.Provider>
  );
}

/** L'étagère de l'écran, ou `null` hors d'un `CardShelfProvider` (fiche ouverte d'un booster, d'une partie…). */
export function useCardShelf(): CardShelfContextValue | null {
  return useContext(CardShelfContext);
}
