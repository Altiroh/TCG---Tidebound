/** Issue d'une partie, du point de vue d'UN joueur. */
export type MatchOutcome = "win" | "loss";

/**
 * Mode de la partie — même vocabulaire que `matches.mode` en base. Seul
 * `bot` change les récompenses (0 Tide, cf. cadrage) ; `private_invite` et
 * `matchmaking` sont tous deux du PvP.
 */
export type MatchMode = "private_invite" | "matchmaking" | "bot";

/** État de progression persisté d'un joueur (`player_progression`). */
export interface ProgressionState {
  /** XP cumulée depuis la création du compte — jamais décrémentée. */
  xpTotal: number;
  /** Dernier niveau dont les récompenses de palier ont été octroyées. */
  level: number;
}

/** Progression prête à afficher : niveau courant + avancement dans le niveau. */
export interface ProgressionView {
  level: number;
  xpTotal: number;
  /** XP accumulée à l'intérieur du niveau courant. */
  xpIntoLevel: number;
  /** XP nécessaire pour passer au niveau suivant. */
  xpForNextLevel: number;
  /** Avancement dans le niveau, entre 0 et 1 — pour une jauge. */
  ratio: number;
}

/** Récompenses d'un seul palier de niveau franchi. */
export interface LevelReward {
  level: number;
  tides: number;
  /** Ids de boosters octroyés à ce palier (souvent aucun). */
  boosterIds: string[];
}

/** Tout ce qu'une partie terminée octroie à un joueur. */
export interface MatchReward {
  xp: number;
  tides: number;
  /** `true` si le bonus de première victoire PvP du jour a été inclus. */
  firstWinOfDay: boolean;
  /** Niveau avant/après, et détail des paliers franchis. */
  levelBefore: number;
  levelAfter: number;
  levelRewards: LevelReward[];
  /** Total des Tides, récompenses de palier incluses. */
  totalTides: number;
  /** Tous les boosters octroyés par les paliers franchis. */
  boosterIds: string[];
}
