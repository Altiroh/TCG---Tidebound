import { RULES, deckProfile, deckStyleFromText, deckStyleLabel, getCardDefinition, type DeckStyleId } from "@/game";
import type { PlayerDeckSummary } from "@/app/decks/actions";
import type { CatalogDeckView, DeckCatalogView } from "@/features/decks/catalogService";
import { plateArtUrl, nameplateArtUrl } from "@/features/decks/nameplateArt";
import type { DeckEntry } from "@/features/decks/deckFilters";

/** D'où vient le deck : le joueur l'a monté, le jeu le prête, ou il s'achète en Jeton. */
export type DeckKind = "mine" | "borrowed" | "precon";

/**
 * Le rayon qu'on regarde. `all` n'est pas une provenance : c'est
 * l'étagère qui les montre TOUTES d'un coup, chaque deck portant alors sa
 * pastille — le seul endroit d'où l'on voit tout ce qu'on peut jouer.
 */
export type DeckCategory = DeckKind | "all";

/**
 * La PROVENANCE, en un mot, telle qu'elle s'affiche sur une pastille.
 *
 * « Test » et non « Préconstruit » : cette famille est une série d'essai,
 * ouverte le temps des tests, et l'écran Jouer l'appelle déjà « Decks de
 * test ». Elle a vocation à disparaître — il ne restera qu'une poignée de
 * decks d'emprunt — donc autant que les deux écrans la nomment pareil d'ici
 * là. Le Jeton, lui, reste « de Préconstruit » : c'est le vocabulaire de
 * l'économie, il ne bouge pas.
 */
export const ORIGIN_LABELS: Record<DeckKind, string> = {
  mine: "Construit",
  borrowed: "Emprunt",
  precon: "Test",
};

export interface DeckCardCount {
  cardId: string;
  quantity: number;
}

/**
 * UN DECK POUR LA GRILLE — la forme unique que l'écran manipule, d'où qu'il
 * vienne. Les trois rayons se rangent, se trient et se filtrent ensemble ;
 * seules les ACTIONS proposées par la fiche diffèrent, et c'est `kind` qui
 * les décide.
 *
 * `mine` et `catalog` portent la source d'origine, pour ce que la fiche ne
 * peut pas déduire de la forme commune (corbeille, deck par défaut,
 * possession réelle d'un deck prêté).
 */
export interface BrowserDeck extends DeckEntry {
  kind: DeckKind;
  artUrl: string | null;
  difficulty: number;
  mechanics: readonly string[];
  description: string;
  cards: DeckCardCount[];
  /**
   * Le profil vient-il du JOUEUR ou de la déduction ? La fiche le dit —
   * « déduit de tes cartes » n'engage pas son auteur de la même façon
   * qu'une ligne qu'il a écrite, et c'est ce qui rend le bouton
   * « Rendre la main au jeu » compréhensible.
   */
  profileIsCustom: boolean;
  mine?: PlayerDeckSummary;
  catalog?: CatalogDeckView;
}

/** Un exemplaire par carte, comme `deckProfile` et la validation les attendent. */
function expand(cards: readonly DeckCardCount[]): string[] {
  const list: string[] = [];
  for (const card of cards) for (let i = 0; i < card.quantity; i += 1) list.push(card.cardId);
  return list;
}

/** Regroupe une liste à exemplaires en lignes comptées, dans l'ordre de première apparition. */
export function countCards(cardIds: readonly string[]): DeckCardCount[] {
  const counts = new Map<string, number>();
  for (const cardId of cardIds) counts.set(cardId, (counts.get(cardId) ?? 0) + 1);
  return Array.from(counts.entries()).map(([cardId, quantity]) => ({ cardId, quantity }));
}

/**
 * LE PROFIL D'UN DECK PERSONNEL — déduit par défaut, écrit si le joueur l'a
 * voulu.
 *
 * Les cartes donnent un type, une difficulté et des mécaniques
 * (`deckProfile`) : rien à saisir, et les decks déjà montés en profitent.
 * Mais une déduction se trompe — une courbe basse ressemble à de
 * l'agression même quand on a monté un combo — d'où les trois colonnes de
 * `player_decks` (migration `20260930120000`). CHAMP PAR CHAMP : renseigné,
 * il l'emporte ; à `null`, le jeu devine. On peut donc corriger le seul
 * type sans avoir à réécrire les mécaniques.
 *
 * Un deck trop mince pour être lu n'a pas de profil déduit — on ne lui
 * invente alors pas de style, la fiche s'en tient au nom et au Navire.
 */
export function mineEntries(decks: readonly PlayerDeckSummary[]): BrowserDeck[] {
  return decks.map((deck) => {
    const deduced = deckProfile(expand(deck.cards));
    const chosen = deck.profile;
    const styleId: DeckStyleId | null = chosen.styleId ?? deduced?.styleId ?? null;

    return {
      kind: "mine" as const,
      id: deck.id,
      name: deck.name,
      shipId: deck.shipId,
      style: styleId ? deckStyleLabel(styleId) : "",
      difficulty: chosen.difficulty ?? deduced?.difficulty ?? 0,
      mechanics: chosen.mechanics ?? deduced?.mechanics ?? [],
      description: deck.description,
      cardCount: deck.cardCount,
      cards: deck.cards,
      artUrl: plateArtUrl(deck.artCardId, deck.shipId),
      createdAt: deck.createdAt,
      updatedAt: deck.updatedAt,
      profileIsCustom: chosen.styleId !== null || chosen.difficulty !== null || chosen.mechanics !== null,
      mine: deck,
    };
  });
}

/**
 * Les decks FOURNIS par le jeu gardent leur style écrit à la main : il dit
 * une intention de design que l'arithmétique ne retrouve pas (cf.
 * `game/cards/decks/deckProfile.ts`). Ni création ni modification — ils ne
 * bougent pas.
 */
export function catalogEntries(catalog: DeckCatalogView, kind: "borrowed" | "precon"): BrowserDeck[] {
  const views = kind === "borrowed" ? catalog.borrowed : catalog.precon;

  return views.map((view) => ({
    kind,
    id: view.deck.id,
    name: view.deck.name,
    shipId: view.deck.shipId,
    style: view.deck.style,
    difficulty: view.deck.difficulty,
    mechanics: view.deck.mechanics,
    description: view.deck.description,
    cardCount: view.deck.cardIds.length,
    cards: countCards(view.deck.cardIds),
    artUrl: nameplateArtUrl(view.deck.cardIds, view.deck.shipId),
    // Écrit à la main, oui — mais par le jeu, pas par le joueur : il n'a
    // rien à reprendre sur une liste qu'il n'a pas montée.
    profileIsCustom: false,
    catalog: view,
  }));
}

/**
 * Le TYPE d'un deck, en valeur d'énumération. Un deck personnel le porte
 * déjà ; une liste du jeu écrit une phrase libre (« Tempo / Volatiles »),
 * qu'on range dans une case sans toucher à son libellé — c'est la phrase
 * qui dit l'intention, l'identifiant ne sert qu'à filtrer.
 */
export function styleIdOf(deck: BrowserDeck): DeckStyleId | null {
  return deckStyleFromText(deck.style);
}

/** Les lignes de la fiche : la carte la plus chère d'abord, puis le nom. */
export function sortedCards(cards: readonly DeckCardCount[]): DeckCardCount[] {
  return [...cards].sort((a, b) => {
    const costA = safeCost(a.cardId);
    const costB = safeCost(b.cardId);
    if (costA !== costB) return costB - costA;
    return cardName(a.cardId).localeCompare(cardName(b.cardId), "fr");
  });
}

export function cardName(cardId: string): string {
  try {
    return getCardDefinition(cardId).name;
  } catch {
    // Carte retirée du catalogue : la fiche montre l'identifiant plutôt que de tomber.
    return cardId;
  }
}

function safeCost(cardId: string): number {
  try {
    return getCardDefinition(cardId).cost;
  } catch {
    return -1;
  }
}

/** « 40 / 50 cartes », et ce que vaut ce compte : deck complet, ou minimum non atteint. */
export function sizeLabel(cardCount: number): string {
  return `${cardCount} / ${RULES.DECK_SIZE_MAX} cartes`;
}
