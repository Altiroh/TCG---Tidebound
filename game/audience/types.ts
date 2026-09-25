import type { PlayerId } from "@/game/state/types";

/**
 * MOTEUR D'AUDIENCE — types.
 *
 * Une partie terminée (ou en cours) est relue par une série d'ANALYSEURS
 * indépendants (`analyzers.ts`). Chacun produit des SIGNAUX : un fait de la
 * partie, sa valeur, et ce qu'il pèse aux yeux du public. Le moteur
 * (`analyzeMatch.ts`) les additionne en un SPECTACLE, en tire les temps
 * forts, et en déduit des TRAITS — ce que la partie dit du style du joueur,
 * que lisent les mécènes.
 *
 * Tout est PUR : même journal, même verdict, côté serveur comme en direct.
 */

/** Grandes familles de ce que le public regarde. */
export type SignalFamily = "rythme" | "tension" | "maitrise" | "erreur";

export interface AudienceSignal {
  /** Identifiant stable (`tempo.expedited`, `tension.comeback`…). */
  id: string;
  family: SignalFamily;
  /** Phrase courte, telle qu'un commentateur la dirait. */
  label: string;
  /** Points de spectacle, positifs ou négatifs. */
  weight: number;
  /** Importance pour les temps forts : les plus hauts sont racontés. */
  salience: number;
}

/**
 * Faits bruts relevés dans le journal — l'unique lecture du journal, que
 * tous les analyseurs partagent.
 */
export interface MatchFacts {
  playerId: PlayerId;
  finished: boolean;
  won: boolean;
  /** Tours de table (les deux joueurs ont joué). */
  tableTurns: number;
  startingAnchor: number;
  opponentStartingAnchor: number;
  /** Ancrage le plus bas atteint par le joueur. */
  lowestAnchor: number;
  /** Ancrage final du joueur et de l'adversaire. */
  finalAnchor: number;
  opponentFinalAnchor: number;
  /** Changements de meneur (en part d'Ancrage de départ). */
  leadChanges: number;
  cardsPlayed: number;
  distinctCards: number;
  distinctTypes: number;
  attacks: number;
  directAttacks: number;
  reactions: number;
  shipAbilities: number;
  tideManipulations: number;
  timeouts: number;
  idleTurns: number;
  deraisons: number;
  conceded: boolean;
  /** Bilan des moments de la partie (`moments.ts`), en points — le fil des coups, bons et mauvais. */
  momentsTotal: number;
}

/** Ce que la partie dit du style du joueur (0 à 100), lu par les mécènes. */
export interface AudienceTraits {
  /** Une victoire qui a du panache. */
  panache: number;
  /** Une partie longue et disputée. */
  endurance: number;
  /** Ce que le public a acclamé. */
  ferveur: number;
}

export interface MatchAnalysis {
  /** Spectacle de la partie, 0 à 100. */
  spectacle: number;
  signals: AudienceSignal[];
  /** Deux temps forts au plus, dans l'ordre d'importance. */
  highlights: string[];
  traits: AudienceTraits;
  facts: MatchFacts;
}
