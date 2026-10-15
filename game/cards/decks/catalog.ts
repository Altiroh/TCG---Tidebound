import { PRECON_DECK_LISTS } from "@/game/cards/decks/precon";
import { STARTER_DECK_IDS } from "@/game/cards/decks/starters";
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
 *   - la PREMIÈRE MISSION (tutoriel terminé ou passé) offre les trois
 *     starters d'un coup (15/10/2026 — elle remplace l'ancien choix
 *     gratuit d'un préconstruit, dont les déblocages restent valides) ;
 *   - les AUTRES coûtent un Jeton de Préconstruit, gagné aux gros
 *     paliers de niveau (`offer: "shop"`) — sauf les retirés.
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

/**
 * Comment un deck du catalogue s'OBTIENT (décision du 15/10/2026) :
 *
 *   - `shop`    : au rayon, contre un Jeton de Préconstruit ;
 *   - `starter` : offert par la PREMIÈRE MISSION (tutoriel terminé ou
 *                 passé) — jamais au Jeton ;
 *   - `retired` : retiré du rayon. Plus achetable, masqué pour qui ne l'a
 *                 pas ; qui l'a débloqué le garde, jouable. La liste reste
 *                 dans `PRECON_DECKS` (résolution des parties, tests).
 */
export type DeckOffer = "shop" | "starter" | "retired";

/** Un deck du catalogue système, enrichi de quoi le présenter au joueur. */
export interface CatalogDeck extends DeckList {
  /** « agressif / swarm », « contrôle », … — la phrase que le joueur lit d'abord. */
  style: string;
  difficulty: DeckDifficulty;
  /** Mécaniques principales, 2 à 4 entrées courtes. */
  mechanics: string[];
  /** Comment le deck s'obtient — voir `DeckOffer`. */
  offer: DeckOffer;
}

type DeckMeta = Omit<CatalogDeck, keyof DeckList | "offer"> & { offer?: DeckOffer };

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
    style: "Aggro / la meute se nourrit de ses morts",
    difficulty: 3,
    mechanics: ["Morts et défausses qui renforcent la meute", "Drain d'Ancrage", "Retours du Cimetière"],
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
  // Retiré du rayon le 15/10/2026 : Le Rempart Vivant reprend la défense.
  "la-forteresse": {
    style: "Défensif / Garde et Ancrage",
    difficulty: 2,
    mechanics: ["Grosse coque", "Réduction de dégâts", "Réparations"],
    offer: "retired",
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
    // Retiré du rayon le 15/10/2026.
    offer: "retired",
  },
  "a-bout-de-raison": {
    style: "Contrôle / pression sur la Raison",
    difficulty: 4,
    mechanics: ["Perte de Raison adverse", "Déraison imposée", "Lecture de la main"],
    // Retiré du rayon le 15/10/2026.
    offer: "retired",
  },
  "arsenal-de-pont": {
    style: "Tempo / Objets et Bris depuis la main",
    difficulty: 5,
    mechanics: ["Bris depuis la main", "Réponses pendant le tour adverse", "Removal ciblé", "Pique à Glace"],
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
  // Lot 15 — Éclats en Selle (24/09/2026).
  "equipage-de-verre": {
    style: "Midrange / survie aux dégâts",
    difficulty: 3,
    mechanics: ["Survivre pour grandir", "Se blesser soi-même", "Pique à Glace"],
  },
  cavalerie: {
    style: "Agressif / Bêtes lourdes et anti-Garde",
    difficulty: 2,
    mechanics: ["Percer la Garde", "Peu d'unités, lourdes", "Canon de proue"],
  },
  "sentinelles-chromatiques": {
    style: "Midrange / Sentinelles et couleurs",
    difficulty: 4,
    mechanics: ["Couleurs qui se répondent", "Signaux Chromatiques", "Assemblage"],
  },
  // Lot 16 — Les Altérés (04/10/2026).
  "les-alteres": {
    style: "Tempo-combo / Éveils en chaîne",
    difficulty: 4,
    mechanics: ["Déclencher l'Éveil", "Répéter et propager", "Réactions depuis la main"],
  },
  // Lot 17 — Dungeon et Ladalle / Opalins (05/10/2026).
  "les-veilleurs-d-opale": {
    style: "Midrange lourd / valeur récurrente",
    difficulty: 3,
    mechanics: ["Armure du Navire", "Lignée LV", "Texte ignoré"],
  },
  "la-quete-etait-pourtant-simple": {
    style: "Aggro-hasard / dés et Chaîne",
    difficulty: 3,
    mechanics: ["Jets de dé", "Chaîne", "Retour en main"],
  },
  // Les trois starters de la PREMIÈRE MISSION (15/10/2026) : offerts au
  // tutoriel terminé ou passé, jamais au Jeton. Difficulté 1–2 : ce sont les
  // premiers decks qu'un joueur pilote.
  "le-rempart-vivant": {
    style: "Défensif / défense active",
    difficulty: 1,
    mechanics: ["Encaisser pour grandir", "Ripostes", "Soin"],
    offer: "starter",
  },
  "les-saboteurs-du-pont": {
    style: "Contrôle / pièges et emplacements",
    difficulty: 2,
    mechanics: ["Pièges cachés", "Emplacements condamnés", "Structures qui nourrissent les ouvriers"],
    offer: "starter",
  },
  "l-assaut-des-marees": {
    style: "Aggro / Pied marin et Tempête",
    difficulty: 1,
    mechanics: ["Pied marin", "Renfort à l'attaque", "Pioche en attaquant"],
    offer: "starter",
  },
};

const FALLBACK_META: DeckMeta = { style: "Polyvalent", difficulty: 3, mechanics: [] };

function withMeta(deck: DeckList): CatalogDeck {
  const meta = DECK_META[deck.id] ?? FALLBACK_META;
  // Un starter l'est par son identifiant (`starters.ts`), même si sa méta
  // l'oubliait : il ne doit jamais devenir achetable par omission.
  const offer: DeckOffer = STARTER_DECK_IDS.includes(deck.id) ? "starter" : (meta.offer ?? "shop");
  return { ...deck, ...meta, offer };
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

/** Les starters de la première mission, dans l'ordre d'affichage. */
export const STARTER_DECKS: readonly CatalogDeck[] = PRECON_DECKS.filter((deck) => deck.offer === "starter");

/** Le rayon au Jeton : ni starters, ni decks retirés. */
export const SHOP_DECKS: readonly CatalogDeck[] = PRECON_DECKS.filter((deck) => deck.offer === "shop");

/** `true` si le deck s'achète au Jeton aujourd'hui. */
export function isShopDeckId(deckId: string): boolean {
  return SHOP_DECKS.some((deck) => deck.id === deckId);
}

/**
 * `true` si le deck se MONTRE au rayon pour ce joueur : un deck retiré ne
 * s'affiche plus qu'à qui l'a débloqué (il le garde, jouable).
 */
export function isDeckOnShelf(deck: CatalogDeck, unlocked: boolean): boolean {
  return deck.offer !== "retired" || unlocked;
}

/**
 * Ordre du rayon : les starters en tête, puis le rayon au Jeton, puis les
 * retirés (seulement chez qui les possède, voir `isDeckOnShelf`).
 */
export function shelfOrder(deck: CatalogDeck): number {
  return deck.offer === "starter" ? 0 : deck.offer === "shop" ? 1 : 2;
}
