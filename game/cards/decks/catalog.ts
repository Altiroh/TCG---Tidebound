import { BORROWED_DECK_LISTS } from "@/game/cards/decks/borrowed";
import { PRECON_DECK_LISTS } from "@/game/cards/decks/precon";
import type { DeckList } from "@/game/cards/decks/types";

/**
 * Catalogue des decks FOURNIS PAR LE JEU — decks d'emprunt et préconstruits.
 *
 * Source de vérité des LISTES : Notion « Bibliothèque de decks — v4 ·
 * Compétitif depuis zéro » (19/09/2026), reconstruite depuis le catalogue
 * de cartes ; les listes v3 (les trois decks de base système et les dix
 * archétypes/laboratoires) ont été retirées avec elle.
 * Source de vérité du RÔLE des deux familles : Notion « Progression
 * joueur », sections 3 et 4. Elles ne doivent pas être confondues :
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
 * Les listes elles-mêmes vivent dans `borrowed.ts` et `precon.ts`. Ce module
 * ne fait que les CLASSER et leur attacher les métadonnées que la fiche de
 * deck doit afficher (style, difficulté, mécaniques) — il n'y a donc jamais
 * deux définitions d'un même deck à maintenir.
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
 *
 * La DIFFICULTÉ est celle de la page v4, en étoiles : elle mesure le
 * pilotage, jamais la puissance (« Fixer la difficulté APRÈS la liste »).
 *
 * Le STYLE commence par le mot de l'énumération `DECK_STYLES` qui range le
 * deck dans le bon filtre (`deckStyleFromText` retient le mot-clé le plus
 * précoce), puis reprend les mots de la page v4. La phrase dit l'intention,
 * l'identifiant déduit sert à filtrer.
 */
const DECK_META: Record<string, DeckMeta> = {
  // --- Decks d'emprunt (un par Navire) ----------------------------------
  "bec-dans-la-brume": {
    style: "Agressif / Pied marin et tempo",
    difficulty: 2,
    mechanics: ["Pied marin", "Petits corps rapides", "Filtrage de main"],
  },
  "cap-de-fer": {
    style: "Midrange / qualité de cartes",
    difficulty: 2,
    mechanics: ["Courbe équilibrée", "Marins et Créatures", "Une réponse à chaque tour"],
  },
  "le-banc-deborde": {
    style: "Agressif / swarm de plateau",
    difficulty: 2,
    mechanics: ["Saturation des Slots", "Bonus de groupe", "Invocation de Péons"],
  },
  "grace-sous-pression": {
    style: "Défensif / endurance active",
    difficulty: 2,
    mechanics: ["Ancrage regagné en brisant des Objets", "Soins répétés", "Économie de Raison"],
  },
  "a-portee": {
    style: "Midrange / artillerie de plateau",
    difficulty: 2,
    mechanics: ["Canon de proue à armer chaque tour", "Échanges forcés", "Corps bon marché"],
  },
  // --- Préconstruits (Jeton de Préconstruit) ----------------------------
  "dernier-rappel": {
    style: "Tempo / Marionnettes et arrivées rejouées",
    difficulty: 4,
    mechanics: ["Retour en main et rejouer", "Arrivées en jeu répétées", "Le Théâtre Englouti"],
  },
  "sous-la-ligne": {
    style: "Contrôle / Abysses et Déraison",
    difficulty: 4,
    mechanics: ["Forçage de Marée", "Abysses", "Menaces lourdes jouées tôt"],
  },
  "tout-recuperer": {
    style: "Contrôle / Structures, Sabordage et recyclage",
    difficulty: 3,
    mechanics: ["Sabordage", "Récupération au Cimetière", "Ancrage regagné à chaque Structure perdue"],
  },
  "les-petits-attendent": {
    style: "Contrôle / attrition et Cimetière",
    difficulty: 3,
    mechanics: ["Défausse volontaire", "Récupération au Cimetière", "Pression par attrition"],
  },
  "grenouilles-au-canon": {
    style: "Agressif / swarm et artillerie",
    difficulty: 3,
    mechanics: ["Petites Créatures", "Canon de proue", "Bonus de groupe"],
  },
};

const FALLBACK_META: DeckMeta = { style: "Polyvalent", difficulty: 3, mechanics: [] };

function withMeta(deck: DeckList): CatalogDeck {
  return { ...deck, ...(DECK_META[deck.id] ?? FALLBACK_META) };
}

/**
 * Decks d'EMPRUNT proposés à la sortie du tutoriel — un par Navire.
 * « Faciles à piloter, pas faibles » (v4) : un emprunt n'est pas une
 * version édulcorée d'un préconstruit, c'est le meilleur plan DIRECT de
 * son Navire.
 */
export const BORROWED_DECKS: readonly CatalogDeck[] = BORROWED_DECK_LISTS.map(withMeta);

/**
 * PRÉCONSTRUITS déblocables avec un Jeton — le plan SPÉCIALISÉ de chaque
 * Navire, plus marqué et plus exigeant à piloter que son emprunt, ce qui
 * donne au Jeton sa valeur.
 */
export const PRECON_DECKS: readonly CatalogDeck[] = PRECON_DECK_LISTS.map(withMeta);

/** Tous les decks fournis par le jeu, emprunt et préconstruits confondus. */
export const CATALOG_DECKS: readonly CatalogDeck[] = [...BORROWED_DECKS, ...PRECON_DECKS];

/**
 * TOUTES les listes qu'une partie peut utiliser. Source unique pour « ce
 * deck est-il jouable ? » (`findPlayableDeck`, côté serveur) : il n'y a pas
 * de second endroit à penser à mettre à jour, donc pas de deck proposé à
 * l'écran que le serveur refuserait ensuite.
 */
export const PLAYABLE_DECKS: readonly DeckList[] = CATALOG_DECKS;

export function catalogDeckById(deckId: string): CatalogDeck | undefined {
  return CATALOG_DECKS.find((deck) => deck.id === deckId);
}

export function isBorrowedDeckId(deckId: string): boolean {
  return BORROWED_DECKS.some((deck) => deck.id === deckId);
}

export function isPreconDeckId(deckId: string): boolean {
  return PRECON_DECKS.some((deck) => deck.id === deckId);
}
