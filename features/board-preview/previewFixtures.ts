import type { TideStateName } from "@/game";
import { BOARD_CAPACITY, type TableCardModel, type TableTideModel } from "@/features/match/table/tableModel";

type CardId = string;

/**
 * Jeu de données factice du laboratoire de layout (`/game/board-preview`).
 *
 * Seul lien avec `@/game` : des TYPES et des identifiants du catalogue de
 * cartes. Cet écran ne crée pas de partie, ne lit aucun deck et n’appelle
 * aucun backend — les cartes ci-dessous sont choisies à la main pour juger
 * le layout sur de vraies cartes (noms longs, textes de règles, Abyssale).
 */

/*
 * Le MODÈLE de vue (`TableCardModel`, `TableTideModel`, `BOARD_CAPACITY`)
 * vit avec le plateau (`features/match/table/tableModel.ts`), pas ici : ce
 * fichier ne fournit que des données de démonstration. Réexportés par
 * commodité pour les écrans du laboratoire.
 */
export { BOARD_CAPACITY };
export type { TableCardModel, TableTideModel };

function makeCards(prefix: string, cardIds: CardId[]): TableCardModel[] {
  return cardIds.map((cardId, i) => ({ id: `${prefix}-${i + 1}`, cardId }));
}

export const PREVIEW_FIXTURES = {
  opponentBoard: makeCards("opp-board", ["chevalier-cra-poiscail", "bat-marin-abyssal", "crabe-de-fer"]),
  playerBoard: makeCards("own-board", ["capitaine-sans-sommeil", "murene-aveugle", "epave-engloutie", "harpon-de-pont"]),
  /** Le Harpon de pont (4e carte) équipe déjà le Capitaine (1re) : le lien se voit dès l'ouverture. */
  playerAttachments: { "own-board-4": "own-board-1" } as Record<string, string>,
  /** 8 cartes : la taille de main de référence du cahier des charges (7 ou 8). */
  playerHand: makeCards("own-hand", [
    "cra-poiscail-sauteur",
    "thermos-du-dernier-quart",
    "tetard-fesse",
    "plaque-de-fortune",
    "banc-de-cra-poiscail",
    "cylindre-flottant",
    "vieux-loup-de-mer",
    "cloche-du-grand-fond-abyssal",
  ]),
  /** Suite de la pioche du joueur, après la main de départ (cf. `usePreviewTable`). */
  playerDeck: makeCards("own-deck", [
    "cra-poiscail-bavard",
    "bat-marin",
    "guetteur-de-brume",
    "chope",
    "cartographe-du-large",
    "casque-coquille",
    "anguille-des-profondeurs",
    "ecuyer-cra-poiscail",
    "barracuda-des-hauts-fonds",
    "charpentier-de-bord",
  ]),
  /** Main de départ adverse (dos de cartes, distribuée comme celle du joueur). */
  opponentHandCount: 7,
  opponent: {
    name: "Adversaire",
    shipName: "Le Courlis",
    illustration: "le-courlis.webp",
    /** Pastille rouge du cadre navire (coque / ancre). */
    hull: 18,
    maxHull: 20,
    /** Pastille bleue du cadre navire (Raison). */
    reason: 3,
    maxReason: 8,
    deck: 24,
    graveyard: 2,
  },
  player: {
    name: "Joueur",
    shipName: "La Religieuse",
    illustration: "la-religieuse.webp",
    hull: 20,
    maxHull: 20,
    reason: 5,
    maxReason: 10,
    deck: 21,
    graveyard: 4,
  },
  tide: {
    /** Tuile de sens, entre les deux navires. */
    orientation: "rising" as "rising" | "falling",
    /** Piste de progression, au centre du plateau. */
    states: [
      { id: "calme", label: "Calme" },
      { id: "houle", label: "Houle" },
      { id: "tempete", label: "Tempête" },
      { id: "abysses", label: "Abysses" },
    ] as { id: TideStateName; label: string }[],
    current: 1,
    /** Tours restants dans l'état courant (Houle dure 2 tours). */
    remainingTurns: 1,
    /** Avancement dans l'état courant, 0 → 1 : remplit le segment qui suit son repère. */
    stageProgress: 0.5,
  },
  turn: 3,
  phaseLabel: "Fin de tour",
  journal: ["Tour 3 — à vous.", "Le bot joue Têtard-fesse.", "Crâ-poiscail attaque le navire (−2)."],
} satisfies Record<string, unknown>;

export type PreviewSideModel = (typeof PREVIEW_FIXTURES)["player"];
