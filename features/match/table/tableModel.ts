import type { TideStateName } from "@/game";

/**
 * Modèle de vue du plateau — ce que les composants de rendu consomment,
 * indépendamment de l'origine des données.
 *
 * Il vivait dans `previewFixtures.ts`, le jeu de données factice du
 * laboratoire de layout : le plateau des VRAIES parties importait donc ses
 * types depuis un fichier de bouchons. Ils sont ici, avec les composants
 * qui s'en servent ; le laboratoire les reprend pour fabriquer ses cartes
 * de démonstration, ce qui est le bon sens de dépendance.
 */

/** Une carte telle que le plateau la rend : une instance, une définition. */
export interface TableCardModel {
  /** Identifiant d'instance, unique à l'écran. */
  id: string;
  /** Carte du catalogue (`game/cards/sets/core.ts`). */
  cardId: string;
  /** Édition de l'exemplaire (labs) : la tuile la montre comme en partie. */
  edition?: import("@/game/cosmetics/editions").CardEdition;
}

/** Emplacements d'un plateau, côté joueur comme côté adversaire. */
export const BOARD_CAPACITY = 5;

/** État de la Marée tel que la bande centrale l'affiche. */
export interface TableTideModel {
  /** Tuile de sens, entre les deux navires. */
  orientation: "rising" | "falling";
  /** Piste de progression, au centre du plateau. */
  states: { id: TideStateName; label: string; /** Durée de cet état dans CETTE partie (carte des marées), en tours de table. */ duration?: number }[];
  /** Repère courant sur la piste Calme → Houle → Tempête → Abysses. */
  current: number;
  /** Tours restants dans l'état courant. */
  remainingTurns: number;
  /** Avancement dans l'état courant, 0 → 1 : remplit le segment qui suit son repère. */
  stageProgress: number;
}
