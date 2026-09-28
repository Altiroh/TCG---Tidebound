/**
 * LE TRI ET LA RECHERCHE de l'écran Decks — logique pure, sans React.
 *
 * L'écran range deux familles de decks sur la même table (les miens,
 * les préconstruits). Pour les trier ensemble il leur faut une
 * forme COMMUNE : `DeckEntry`. Chaque famille la remplit à sa façon — un
 * deck du catalogue porte son style écrit à la main, un deck personnel le
 * fait déduire de ses cartes (`deckProfile`) — et tout ce qui suit ignore
 * d'où il vient.
 *
 * Rien ici ne touche au DOM : c'est ce qui le rend testable
 * (`tests/features/deckFilters.test.ts`).
 */

/** Un deck, quelle que soit sa provenance, tel que la grille le manipule. */
export interface DeckEntry {
  id: string;
  name: string;
  shipId: string;
  /** Style ÉCRIT (catalogue) ou DÉDUIT (`deckProfile`) — jamais inventé ici. */
  style: string;
  cardCount: number;
  /** Dernière sauvegarde (ISO). Absente pour un deck fourni par le jeu : il ne bouge pas. */
  updatedAt?: string;
  /** Création (ISO). Même remarque. */
  createdAt?: string;
}

/** Sans accents ni casse : « Contrôle » et « controle » sont le même mot. */
function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/** La recherche par nom, sans tenir compte des accents ni de la casse. Vide : on ne filtre pas. */
export function filterDecks<T extends DeckEntry>(decks: readonly T[], search: string): T[] {
  const query = fold(search.trim());
  if (!query) return [...decks];
  return decks.filter((deck) => fold(deck.name).includes(query));
}

export const DECK_SORTS = [
  { id: "updated", label: "Dernière modification" },
  { id: "created", label: "Date de création" },
  { id: "name", label: "Nom (A → Z)" },
  { id: "size", label: "Nombre de cartes" },
] as const;

export type DeckSortId = (typeof DECK_SORTS)[number]["id"];

/**
 * Tri STABLE : à critère égal — et c'est le cas de tous les decks fournis
 * par le jeu, qui n'ont ni date de création ni de modification — l'ordre
 * d'origine est conservé. Un rayon dont les tuiles sautent d'une visite à
 * l'autre ne se mémorise pas.
 */
export function sortDecks<T extends DeckEntry>(decks: readonly T[], sort: DeckSortId): T[] {
  const ranked = decks.map((deck, index) => ({ deck, index }));

  ranked.sort((a, b) => {
    const compared = compare(a.deck, b.deck, sort);
    return compared !== 0 ? compared : a.index - b.index;
  });

  return ranked.map((entry) => entry.deck);
}

function compare(a: DeckEntry, b: DeckEntry, sort: DeckSortId): number {
  switch (sort) {
    case "updated":
      return time(b.updatedAt) - time(a.updatedAt);
    case "created":
      return time(b.createdAt) - time(a.createdAt);
    case "name":
      return a.name.localeCompare(b.name, "fr");
    case "size":
      return b.cardCount - a.cardCount;
  }
}

function time(iso: string | undefined): number {
  if (!iso) return 0;
  const parsed = Date.parse(iso);
  return Number.isNaN(parsed) ? 0 : parsed;
}
