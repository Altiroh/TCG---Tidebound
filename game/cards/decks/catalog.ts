import { PRECON_DECK_LISTS } from "@/game/cards/decks/precon";
import type { DeckList } from "@/game/cards/decks/types";

/**
 * Catalogue des decks FOURNIS PAR LE JEU — les préconstruits.
 *
 * Source de vérité des LISTES : Notion « Decks d'emprunt — refonte depuis
 * zéro · 12 archétypes » (22/09/2026).
 *
 * UN SEUL RAYON depuis le 22/09/2026. Le jeu séparait auparavant des
 * « decks d'emprunt » et des « préconstruits » ; la distinction ne portait
 * que sur la PORTE d'entrée, jamais sur le deck lui-même, et elle obligeait
 * chaque écran à ranger deux rayons qui disaient la même chose. Ce qui
 * subsiste, et qui suffit (Notion « Progression joueur » §3 et §4) :
 *
 *   - le PREMIER préconstruit est gratuit, choisi une fois depuis la
 *     Collection à la sortie du tutoriel ;
 *   - les SUIVANTS coûtent un Jeton de Préconstruit, gagné aux gros
 *     paliers de niveau.
 *
 * Dans les deux cas les cartes restent PRÊTÉES : « le premier deck ne doit
 * pas injecter un gros volume de cartes gratuites dans la collection ».
 * C'est donc l'ACQUISITION qui se note (colonne `source` en base), pas une
 * nature du deck — et il n'y a plus qu'une liste de decks à maintenir.
 *
 * Les listes elles-mêmes vivent dans `precon.ts`. Ce module ne fait que
 * leur attacher les métadonnées que la fiche de deck doit afficher (style,
 * difficulté, mécaniques) — il n'y a donc jamais deux définitions d'un même
 * deck à maintenir.
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
  //
  // La difficulté mesure le PILOTAGE, jamais la puissance (règle de la
  // page v4, toujours valable) : un deck qui gagne en posant ses cartes
  // dans l'ordre est facile même s'il est fort.
  "le-grand-banc": {
    style: "Agressif / swarm de plateau",
    difficulty: 1,
    mechanics: ["Saturation des Slots", "Bonus de groupe", "Invocation de Péons"],
  },
  "chevaliers-du-grand-etang": {
    style: "Midrange / formation Cra-Poiscail",
    difficulty: 3,
    mechanics: ["Unités qui se renforcent l'une l'autre", "Équipements", "Protection des pièces clés"],
  },
  "la-veillee": {
    style: "Contrôle / Cimetière et attrition",
    difficulty: 3,
    mechanics: ["Défausse volontaire", "Récupération au Cimetière", "Pression continue"],
  },
  "le-theatre-englouti-deck": {
    style: "Tempo / Marionnettes et arrivées rejouées",
    difficulty: 4,
    mechanics: ["Retour en main", "Arrivées répétées", "Réduction de coût"],
  },
  "mineurs-de-fond": {
    style: "Contrôle / Structures-pièges et bluff",
    difficulty: 4,
    mechanics: ["Réactions cachées", "Fenêtres de Marée", "Punition du développement"],
  },
  "la-forteresse": {
    style: "Défensif / Garde et Ancrage",
    difficulty: 2,
    mechanics: ["Grosse coque", "Réduction de dégâts", "Réparations"],
  },
  "descente-aux-abysses": {
    style: "Contrôle / Marée et Abysses",
    difficulty: 4,
    mechanics: ["Forçage de Marée", "Orientation", "Créatures des profondeurs"],
  },
  "epavistes": {
    style: "Contrôle / Structures, Sabordage et recyclage",
    difficulty: 3,
    mechanics: ["Sabordage volontaire", "Récupération au Cimetière", "Ancrage regagné"],
  },
  "a-bout-de-raison": {
    style: "Contrôle / pression sur la Raison",
    difficulty: 4,
    mechanics: ["Perte de Raison adverse", "Déraison imposée", "Lecture de la main"],
  },
  "arsenal-de-pont": {
    style: "Tempo / Objets et Bris depuis la main",
    difficulty: 5,
    mechanics: ["Bris depuis la main", "Réponses pendant le tour adverse", "Removal ciblé"],
  },
  "chasse-au-gros": {
    style: "Midrange / dégâts ciblés",
    difficulty: 2,
    mechanics: ["Blesser puis terminer", "Canon de proue", "Échanges favorables"],
  },
  "apres-la-tempete": {
    style: "Contrôle / nettoyages de plateau",
    difficulty: 5,
    mechanics: ["Board wipes", "Pièges anti-swarm", "Menaces à 6-8 Raison"],
  },
};

const FALLBACK_META: DeckMeta = { style: "Polyvalent", difficulty: 3, mechanics: [] };

function withMeta(deck: DeckList): CatalogDeck {
  return { ...deck, ...(DECK_META[deck.id] ?? FALLBACK_META) };
}

/**
 * Les douze préconstruits — un par grande mécanique. « Rester des decks
 * capables de gagner, pas des listes pédagogiques volontairement faibles »
 * (refonte du 22/09/2026).
 */
export const PRECON_DECKS: readonly CatalogDeck[] = PRECON_DECK_LISTS.map(withMeta);

/**
 * Alias historique de `PRECON_DECKS`, conservé parce que « tous les decks
 * fournis par le jeu » et « les préconstruits » désignent désormais le même
 * ensemble. Les deux noms disent la même chose ; celui-ci se lit mieux là
 * où l'on parle du catalogue plutôt que du produit.
 */
export const CATALOG_DECKS: readonly CatalogDeck[] = PRECON_DECKS;

export const PLAYABLE_DECKS: readonly DeckList[] = CATALOG_DECKS;

export function catalogDeckById(deckId: string): CatalogDeck | undefined {
  return CATALOG_DECKS.find((deck) => deck.id === deckId);
}

export function isPreconDeckId(deckId: string): boolean {
  return PRECON_DECKS.some((deck) => deck.id === deckId);
}
