/**
 * L'ÉTAGÈRE DU JOUEUR — ses cartes favorites et ses CARNETS.
 *
 * Deux gestes, pensés comme Pinterest :
 *   - le FAVORI (le cœur) : une carte qu'on aime, d'un clic ;
 *   - les CARNETS : des groupes NOMMÉS de cartes (« Combo Abysses »,
 *     « Mes Marionnettes »), une carte pouvant vivre dans plusieurs.
 *
 * Ce module est PUR : règles de nom, plafonds, filtre de la grille,
 * couverture d'un carnet. Les actions serveur (`shelfActions.ts`) et l'état
 * côté écran (`CardShelfProvider.tsx`) s'y réfèrent tous deux : une règle
 * qui divergerait entre le client et le serveur serait un bug.
 */

/** Plafond de carnets par joueur — même valeur que le déclencheur Postgres (migration 20261014120000). */
export const NOTEBOOK_LIMIT = 50;
/** Longueur maximale d'un nom de carnet — même valeur que la contrainte Postgres. */
export const NOTEBOOK_NAME_MAX = 40;

export interface CardNotebook {
  id: string;
  name: string;
  /** Couverture choisie ; `null` : la première carte rangée sert (`notebookCover`). */
  coverCardId: string | null;
  /** Cartes du carnet, de la plus ANCIENNE à la plus récente. */
  cardIds: string[];
  updatedAt: string;
}

export interface CardShelf {
  favorites: string[];
  /** Du plus récemment touché au plus ancien. */
  notebooks: CardNotebook[];
}

export const EMPTY_SHELF: CardShelf = { favorites: [], notebooks: [] };

/** Nom de carnet nettoyé (espaces resserrés), ou le motif du refus. */
export function normalizeNotebookName(raw: string): { ok: true; name: string } | { ok: false; error: string } {
  const name = raw.replace(/\s+/g, " ").trim();
  if (!name) return { ok: false, error: "Donne un nom à ton carnet." };
  if (name.length > NOTEBOOK_NAME_MAX) return { ok: false, error: `Un nom de carnet tient en ${NOTEBOOK_NAME_MAX} caractères.` };
  return { ok: true, name };
}

/** Un autre carnet porte-t-il déjà ce nom (casse et espaces ignorés) ? */
export function notebookNameTaken(notebooks: readonly CardNotebook[], name: string, exceptId?: string): boolean {
  const key = name.replace(/\s+/g, " ").trim().toLocaleLowerCase("fr-FR");
  return notebooks.some((notebook) => notebook.id !== exceptId && notebook.name.toLocaleLowerCase("fr-FR") === key);
}

/** Carte de couverture d'un carnet : celle choisie si elle y est encore, sinon la première rangée, sinon aucune. */
export function notebookCover(notebook: Pick<CardNotebook, "coverCardId" | "cardIds">): string | null {
  if (notebook.coverCardId && notebook.cardIds.includes(notebook.coverCardId)) return notebook.coverCardId;
  return notebook.cardIds[0] ?? null;
}

/* ── Le filtre « Favoris & carnets » de la grille ─────────────────────── */

/**
 * Ce que montre la grille : tout (`null`), les favoris, ou un carnet.
 * Encodé en chaîne pour vivre dans l'état de filtres MÉMORISÉ sur
 * l'appareil (`collectionFilters.ts`).
 */
export type ShelfFilter = null | "favoris" | `carnet:${string}`;

export const FAVORITES_FILTER = "favoris" as const;

export function notebookFilter(notebookId: string): ShelfFilter {
  return `carnet:${notebookId}`;
}

/** Relecture d'un filtre mémorisé : tout ce qui n'a pas la forme attendue tombe. */
export function decodeShelfFilter(raw: unknown): ShelfFilter | undefined {
  if (raw === null) return null;
  if (raw === FAVORITES_FILTER) return FAVORITES_FILTER;
  if (typeof raw === "string" && /^carnet:[0-9a-f-]{36}$/i.test(raw)) return raw as ShelfFilter;
  return undefined;
}

/**
 * Cartes que laisse passer le filtre, `null` quand il ne restreint rien —
 * pas de filtre, ou un carnet qui n'existe plus (effacé ailleurs) : la
 * grille montre alors tout plutôt qu'un vide incompréhensible.
 */
export function shelfCardSet(shelf: CardShelf, filter: ShelfFilter): ReadonlySet<string> | null {
  if (filter === null) return null;
  if (filter === FAVORITES_FILTER) return new Set(shelf.favorites);
  const notebook = shelf.notebooks.find((entry) => `carnet:${entry.id}` === filter);
  return notebook ? new Set(notebook.cardIds) : null;
}

/** Le filtre désigne-t-il un carnet qui n'existe plus ? L'écran le remet alors à « tout ». */
export function isStaleShelfFilter(shelf: CardShelf, filter: ShelfFilter): boolean {
  return filter !== null && filter !== FAVORITES_FILTER && !shelf.notebooks.some((entry) => `carnet:${entry.id}` === filter);
}

/* ── Mises à jour de l'étagère (optimistes côté écran, mêmes règles) ──── */

export function withFavorite(shelf: CardShelf, cardId: string, favorite: boolean): CardShelf {
  const has = shelf.favorites.includes(cardId);
  if (has === favorite) return shelf;
  return { ...shelf, favorites: favorite ? [...shelf.favorites, cardId] : shelf.favorites.filter((id) => id !== cardId) };
}

export function withCardInNotebook(shelf: CardShelf, notebookId: string, cardId: string, inside: boolean, now: string): CardShelf {
  return {
    ...shelf,
    notebooks: sortNotebooks(
      shelf.notebooks.map((notebook) => {
        if (notebook.id !== notebookId) return notebook;
        const has = notebook.cardIds.includes(cardId);
        if (has === inside) return notebook;
        return {
          ...notebook,
          cardIds: inside ? [...notebook.cardIds, cardId] : notebook.cardIds.filter((id) => id !== cardId),
          updatedAt: now,
        };
      })
    ),
  };
}

/** Du plus récemment touché au plus ancien — l'ordre du mur de carnets et de la colonne de filtres. */
export function sortNotebooks(notebooks: CardNotebook[]): CardNotebook[] {
  return [...notebooks].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.name.localeCompare(b.name, "fr"));
}
