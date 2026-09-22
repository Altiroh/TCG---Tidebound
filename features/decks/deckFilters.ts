import { deckStyleFromText, deckStyleLabel, type DeckStyleId } from "@/game";

/**
 * LE TRI ET LES FILTRES de l'écran Decks — logique pure, sans React.
 *
 * L'écran range trois familles de decks dans la même grille (les miens,
 * les préconstruits). Pour les filtrer ensemble il leur faut une
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

/**
 * LES CASES À COCHER DU TYPE DE JEU — celles de l'énumération du moteur
 * (`DECK_STYLES`), plus « Autre ».
 *
 * Rien n'est défini ici : la liste fermée vit dans `game/cards/decks/`,
 * parce que le type d'un deck est une donnée de jeu, pas un réglage
 * d'écran — et parce que la base range la même liste sous le même nom.
 *
 * « Autre » n'est pas une valeur de l'énumération : c'est le refus d'en
 * choisir une. Un deck du catalogue dont le style écrit ne contient aucun
 * mot-clé connu (« Environnemental ») y tombe, plutôt que d'être rangé de
 * force dans une case qui mentirait.
 */
export type StyleFilterId = DeckStyleId | "autre";

export function styleFilterOf(style: string): StyleFilterId {
  return deckStyleFromText(style) ?? "autre";
}

export function styleFilterLabel(id: StyleFilterId): string {
  return id === "autre" ? "Autre" : deckStyleLabel(id);
}

/** Sans accents ni casse : « Contrôle » et « controle » sont le même mot. */
function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/** Les critères cochés dans la colonne de gauche. Vide = on ne filtre pas. */
export interface DeckFilterState {
  search: string;
  styles: ReadonlySet<StyleFilterId>;
  ships: ReadonlySet<string>;
}

export const EMPTY_FILTERS: DeckFilterState = { search: "", styles: new Set(), ships: new Set() };

export function hasActiveFilter(filters: DeckFilterState): boolean {
  return filters.search.trim() !== "" || filters.styles.size > 0 || filters.ships.size > 0;
}

/**
 * Les trois critères se CUMULENT (un ET), mais les cases d'une même section
 * s'additionnent (un OU) : cocher « Agressif » et « Tempo » montre les deux,
 * c'est ce qu'attend une liste de cases à cocher.
 */
export function filterDecks<T extends DeckEntry>(decks: readonly T[], filters: DeckFilterState): T[] {
  const query = fold(filters.search.trim());

  return decks.filter((deck) => {
    if (query && !fold(deck.name).includes(query)) return false;
    if (filters.styles.size > 0 && !filters.styles.has(styleFilterOf(deck.style))) return false;
    if (filters.ships.size > 0 && !filters.ships.has(deck.shipId)) return false;
    return true;
  });
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

/**
 * « Modifié il y a 2 h » — la date relative de la maquette. Au-delà d'une
 * semaine la date absolue redevient plus parlante qu'un décompte de jours.
 */
export function relativeDate(iso: string | undefined, now: Date = new Date()): string {
  if (!iso) return "—";
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return "—";

  const seconds = Math.max(0, Math.round((now.getTime() - parsed) / 1000));
  if (seconds < 60) return "à l'instant";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.round(hours / 24);
  if (days <= 7) return `il y a ${days} j`;
  return absoluteDate(iso);
}

/** « 12 mars 2025 » — la date écrite, pour les statistiques de la fiche. */
export function absoluteDate(iso: string | undefined): string {
  if (!iso) return "—";
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return "—";
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" }).format(new Date(parsed));
}
