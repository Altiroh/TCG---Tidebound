import { ARCHETYPE_DECKS, CRA_POISCAIL_TEST_DECKS } from "@/game/cards/decks/testDecks";
import { PRECONSTRUCTED_DECKS, type DeckList } from "@/game/cards/decks/preconstructed";

/**
 * Catalogue des decks FOURNIS PAR LE JEU — decks d'emprunt et préconstruits.
 *
 * Source de vérité design : Notion « Progression joueur », sections 3 et 4.
 * Deux familles distinctes, qui ne doivent surtout pas être confondues :
 *
 *   - **Deck d'emprunt** (§3) — gratuit, choisi UNE fois depuis la
 *     Collection à la sortie du tutoriel. « Le premier deck ne doit pas
 *     injecter un gros volume de cartes gratuites dans la collection » : ses
 *     cartes non possédées restent PRÊTÉES, et les boosters permettent
 *     progressivement de les posséder réellement.
 *   - **Préconstruit** (§4) — déblocable en dépensant un Jeton de
 *     Préconstruit, gagné aux gros paliers de niveau. « Le jeton n'impose
 *     aucun deck précis » : le joueur analyse tout le rayon avant de choisir.
 *
 * Les listes elles-mêmes existent déjà (`preconstructed.ts`, `testDecks.ts`).
 * Ce module ne fait que les CLASSER et leur attacher les métadonnées que la
 * fiche de deck doit afficher (style, difficulté, mécaniques) — il n'y a
 * donc jamais deux définitions d'un même deck à maintenir.
 */

/** Difficulté affichée en étoiles sur la fiche (§4). */
export type DeckDifficulty = 1 | 2 | 3 | 4 | 5;

/** Un deck du catalogue système, enrichi de quoi le présenter au joueur. */
export interface CatalogDeck extends DeckList {
  /** « agressif / swarm », « contrôle », … — la phrase que le joueur lit d'abord. */
  style: string;
  difficulty: DeckDifficulty;
  /** Mécaniques principales, 2 à 4 entrées courtes. */
  mechanics: string[];
}

type DeckMeta = Omit<CatalogDeck, keyof DeckList>;

/**
 * Métadonnées par identifiant de deck. Séparées des listes de cartes pour
 * que l'ajout d'un deck jouable n'oblige pas à toucher aux listes existantes
 * — et pour qu'un deck sans métadonnées reste affichable (repli ci-dessous)
 * plutôt que de faire disparaître le rayon.
 */
const DECK_META: Record<string, DeckMeta> = {
  // --- Decks d'emprunt (un par Navire de départ) ------------------------
  "le-courlis": {
    style: "Tempo / contrôle léger",
    difficulty: 2,
    mechanics: ["Manipulation de Marée", "Objets à faible coût", "Petits corps rapides"],
  },
  lerrant: {
    style: "Polyvalent / midrange",
    difficulty: 1,
    mechanics: ["Courbe équilibrée", "Marins et Créatures", "Structures de soutien"],
  },
  "le-brise-lames": {
    style: "Défensif / lourd",
    difficulty: 2,
    mechanics: ["Garde", "Sabordage", "Gros permanents tardifs"],
  },
  // --- Préconstruits (Jeton de Préconstruit) ----------------------------
  "pont-dassaut": {
    style: "Agressif",
    difficulty: 2,
    mechanics: ["Pression précoce", "Attaques répétées", "Faible courbe"],
  },
  "descente-aux-abysses": {
    style: "Environnemental",
    difficulty: 4,
    mechanics: ["Forçage de Marée", "Abysses", "Cartes qui profitent des états extrêmes"],
  },
  "maree-control": {
    style: "Contrôle",
    difficulty: 4,
    mechanics: ["Durée et Intensité de Marée", "Temporisation", "Valeur sur la durée"],
  },
  "forteresse-flottante": {
    style: "Défensif",
    difficulty: 3,
    mechanics: ["Garde", "Structures", "Résistance élevée"],
  },
  "epaviste-sabordage": {
    style: "Sacrifice / valeur",
    difficulty: 4,
    mechanics: ["Sabordage", "Bris d'Objets", "Recyclage du cimetière"],
  },
  "capitaine-midrange": {
    style: "Midrange",
    difficulty: 2,
    mechanics: ["Marins de qualité", "Équipements", "Tempo tardif"],
  },
  penitence: {
    style: "Déraison",
    difficulty: 5,
    mechanics: ["Raison négative assumée", "Réduction des dégâts d'Ancrage", "Cartes à coût élevé"],
  },
  "le-grand-banc": {
    style: "Agressif / swarm",
    difficulty: 2,
    mechanics: ["Petites Créatures", "Bonus de groupe", "Invocation de Péons"],
  },
  "la-cour-du-grand-etang": {
    style: "Synergies nommées",
    difficulty: 3,
    mechanics: ["Chevalier et Destrier", "Équipements d'archétype", "Montée en puissance"],
  },
};

const FALLBACK_META: DeckMeta = { style: "Polyvalent", difficulty: 3, mechanics: [] };

function withMeta(deck: DeckList): CatalogDeck {
  return { ...deck, ...(DECK_META[deck.id] ?? FALLBACK_META) };
}

/**
 * Decks d'EMPRUNT proposés à la sortie du tutoriel — un par Navire de
 * départ. « Le deck d'emprunt doit être correct et cohérent, pas
 * volontairement mauvais » (§3) : ce sont les decks de base système, les
 * mêmes que le jeu considère déjà comme jouables.
 */
export const BORROWED_DECKS: readonly CatalogDeck[] = PRECONSTRUCTED_DECKS.map(withMeta);

/**
 * PRÉCONSTRUITS déblocables avec un Jeton — les listes d'archétype, plus
 * riches et plus marquées que les decks d'emprunt, ce qui donne au jeton sa
 * valeur.
 */
export const PRECON_DECKS: readonly CatalogDeck[] = [...ARCHETYPE_DECKS, ...CRA_POISCAIL_TEST_DECKS].map(withMeta);

/** Tous les decks fournis par le jeu, emprunt et préconstruits confondus. */
export const CATALOG_DECKS: readonly CatalogDeck[] = [...BORROWED_DECKS, ...PRECON_DECKS];

export function catalogDeckById(deckId: string): CatalogDeck | undefined {
  return CATALOG_DECKS.find((deck) => deck.id === deckId);
}

export function isBorrowedDeckId(deckId: string): boolean {
  return BORROWED_DECKS.some((deck) => deck.id === deckId);
}

export function isPreconDeckId(deckId: string): boolean {
  return PRECON_DECKS.some((deck) => deck.id === deckId);
}
