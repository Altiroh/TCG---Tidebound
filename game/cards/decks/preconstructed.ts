import type { CardId } from "@/game/cards/types";

/**
 * Decks de base système — un par Navire verrouillé (`TCG_DATABASE.md`,
 * "Onboarding joueur — verrouillé" : Courlis, Errant, Brise-Lames).
 * Fournis par le système, ne dépendent pas de la collection personnelle,
 * pas modifiables directement (cadrage "Règles & mécaniques verrouillées",
 * section "Decks de base système").
 *
 * Taille : 40 cartes chacun (deck personnel valide : 40 à 50 cartes,
 * cadrage `RULES.DECK_SIZE_MIN`/`DECK_SIZE_MAX`). Chaque entrée respecte
 * `getMaxCopies` de la carte concernée (cf. `game/cards/sets/core.ts`).
 */
export interface DeckList {
  id: string;
  name: string;
  /** Navire principal de ce deck (voir `game/environment/shipData.ts`). */
  shipId: string;
  /** Résumé du style de jeu, affiché à l'écran de sélection — le joueur doit savoir ce que le deck fait avant de le choisir, pas juste son nom. */
  description: string;
  cardIds: CardId[];
}

function repeat(cardId: CardId, copies: number): CardId[] {
  return Array.from({ length: copies }, () => cardId);
}

/**
 * Le Courlis — léger, contrôle environnemental, tempo. Peu de gros
 * permanents (4 Slots), beaucoup de manipulation de Marée/Eaux et
 * d'Objets à faible coût.
 */
export const DECK_LE_COURLIS: DeckList = {
  id: "le-courlis",
  name: "Le Courlis",
  shipId: "le-courlis",
  description: "Léger et rapide : beaucoup de manipulation de Marée/Eaux et d'Objets à faible coût, peu de gros permanents.",
  cardIds: [
    ...repeat("marin-des-jetees", 3),
    ...repeat("poisson-lanterne", 3),
    ...repeat("murene-aveugle", 3),
    ...repeat("guetteur-de-brume", 3),
    ...repeat("cartographe-du-large", 3),
    ...repeat("matelot-insomniaque", 3),
    ...repeat("vieux-loup-de-mer", 2),
    ...repeat("thermos-du-dernier-quart", 3),
    ...repeat("levier-de-lest", 3),
    ...repeat("regulateur-de-courant", 3),
    ...repeat("horloge-de-maree", 2),
    ...repeat("sondeur-des-mauvaises-eaux", 2),
    ...repeat("caisses-arrimees", 2),
    ...repeat("bouee-de-derive", 2),
    ...repeat("charpentier-de-bord", 2),
    ...repeat("treuil-rouille", 1),
  ],
};

/**
 * L'Errant — standard, polyvalent, midrange/soutien. Courbe équilibrée,
 * mélange de Marins/Créatures et de Structures/Objets sans spécialisation
 * marquée (5 Slots).
 */
export const DECK_LERRANT: DeckList = {
  id: "lerrant",
  name: "L'Errant",
  shipId: "lerrant",
  description: "Standard et polyvalent : courbe équilibrée, mélange de Marins/Créatures et de Structures/Objets sans spécialisation marquée.",
  cardIds: [
    ...repeat("marin-aux-yeux-rouges", 3),
    ...repeat("matelot-du-sans-nom", 3),
    ...repeat("crabe-de-fer", 3),
    ...repeat("barracuda-des-hauts-fonds", 3),
    ...repeat("bernard-lermite-dacier", 3),
    ...repeat("charpentier-de-bord", 3),
    ...repeat("poisson-scie-gris", 3),
    ...repeat("gardien-du-sondeur", 2),
    ...repeat("capitaine-sans-sommeil", 2),
    ...repeat("treuil-rouille", 2),
    ...repeat("corde-de-remorquage", 2),
    ...repeat("bouee-de-derive", 3),
    ...repeat("filet-a-la-derive", 3),
    ...repeat("grappin-de-recuperation", 2),
    ...repeat("levier-de-lest", 2),
    ...repeat("horloge-de-maree", 1),
  ],
};

/**
 * Le Brise-Lames — lourd, Structures/Garde/Sabordage, endurance. Board
 * dense (6 Slots), synergies de Sabordage et gros permanents tardifs.
 */
export const DECK_LE_BRISE_LAMES: DeckList = {
  id: "le-brise-lames",
  name: "Le Brise-Lames",
  shipId: "le-brise-lames",
  description: "Lourd et endurant : board dense, synergies de Sabordage et gros permanents tardifs derrière de la Garde.",
  cardIds: [
    ...repeat("crabe-de-fer", 3),
    ...repeat("chose-des-hauts-fonds", 3),
    ...repeat("caisses-arrimees", 3),
    ...repeat("regulateur-de-courant", 3),
    ...repeat("horloge-de-maree", 2),
    ...repeat("levier-de-lest", 3),
    ...repeat("plongeur-des-epaves", 2),
    ...repeat("treuil-a-chair", 2),
    ...repeat("cage-de-flottaison", 2),
    ...repeat("carcasse-renversee", 2),
    ...repeat("second-au-visage-pale", 2),
    ...repeat("masse-sombre-abyssal", 3),
    ...repeat("la-chose-qui-remonte", 2),
    ...repeat("ce-qui-suit-le-navire", 1),
    ...repeat("baleine-aux-cicatrices-blanches", 3),
    ...repeat("mecanicien-aux-mains-noires", 2),
    ...repeat("ponton-aux-cloches", 2),
  ],
};

export const PRECONSTRUCTED_DECKS: readonly DeckList[] = [
  DECK_LE_COURLIS,
  DECK_LERRANT,
  DECK_LE_BRISE_LAMES,
];
