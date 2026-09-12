/**
 * Progression joueur — XP, niveaux et récompenses de palier.
 *
 * STATUT DU CADRAGE. La page Notion "Boosters & économie de collection"
 * verrouille les PRINCIPES mais aucune valeur numérique de progression :
 *   - « Les parties donnent principalement de l'XP / progression. »
 *   - « Une partie PvP peut donner une très faible quantité de Tides, mais
 *     suffisamment faible pour rendre le farm pur peu intéressant. »
 *   - « Les parties contre bot rapportent 0 Tide directement. »
 *   - « Les premières victoires, objectifs quotidiens/hebdomadaires,
 *     paliers de progression et événements constituent les principales
 *     sources de Tides. »
 *   - Les anciennes valeurs 100 / 35 / 500 sont explicitement ABANDONNÉES
 *     pour les récompenses de match (elles rendaient l'accès aux boosters
 *     proportionnel au nombre de matchs joués).
 *   - Cadence cible : « environ 1 booster tous les 2 à 3 jours pour un
 *     joueur régulier », hors événements.
 *
 * Tout ce qui suit est donc une PROPOSITION d'équilibrage, calibrée sur ces
 * principes et volontairement regroupée ici pour être ajustable d'un seul
 * endroit. Rien dans le code ne doit dupliquer ces nombres.
 *
 * Calibrage retenu (à retester) : un joueur régulier = ~4 parties PvP/jour
 * à ~50% de victoires, soit ~320 XP/jour + le bonus de première victoire.
 * Avec la courbe ci-dessous, ça donne ~0,5 niveau/jour au début, donc
 * ~30 Tides/jour de paliers et un booster de palier tous les ~10 jours.
 * Les paliers sont donc une source SECONDAIRE : la cadence cible d'un
 * booster tous les 2-3 jours suppose les quêtes quotidiennes, qui ne sont
 * pas encore implémentées (cf. README).
 */

/** XP nécessaire pour passer du niveau 1 au niveau 2. */
export const XP_FIRST_LEVEL = 400;

/** Chaque niveau coûte ce nombre d'XP de plus que le précédent. */
export const XP_LEVEL_STEP = 80;

/**
 * Au-delà de ce niveau, le coût d'un niveau cesse d'augmenter. Sans ce
 * plateau, les niveaux élevés deviennent inatteignables et la progression
 * n'est plus lisible ; ce n'est pas un niveau maximum (il n'y en a pas).
 */
export const XP_STEP_PLATEAU_LEVEL = 20;

/** Niveau de départ d'un compte neuf. */
export const STARTING_LEVEL = 1;

/**
 * XP par partie terminée, selon l'issue et le mode.
 *
 * Une défaite rapporte volontairement une part importante de la victoire :
 * le cadrage veut que la partie fasse progresser (« Défaite PvP : gain nul
 * ou très faible de Tides + progression/XP »), sinon la progression
 * devient une prime au winrate et pousse au farm de matchs faciles.
 *
 * Le bot rapporte beaucoup moins que le PvP, pour la raison inverse : il
 * ne doit jamais devenir la voie la plus rentable vers les paliers (qui,
 * eux, donnent des Tides).
 */
export const MATCH_XP = {
  pvpWin: 100,
  pvpLoss: 60,
  botWin: 25,
  botLoss: 15,
} as const;

/**
 * Tides par partie. « Très faible » au sens du cadrage : à 8 Tides par
 * victoire, il faut ~63 victoires PvP pour un seul booster à 500 — le farm
 * pur n'est pas une stratégie viable, ce qui est exactement l'intention.
 * Le bot rapporte 0, VERROUILLÉ par le cadrage.
 */
export const MATCH_TIDES = {
  pvpWin: 8,
  pvpLoss: 3,
  botWin: 0,
  botLoss: 0,
} as const;

/**
 * DÉROGATION DE DÉVELOPPEMENT — Tides sur une partie contre bot.
 *
 * Le cadrage verrouille « les parties contre bot rapportent 0 Tide
 * directement ». Ces valeurs ne s'appliquent donc QUE si l'appelant passe
 * explicitement `allowBotTides` (cf. `computeMatchReward`), ce que seule
 * fait la politique de développement `features/progression/botRewardPolicy.ts`.
 *
 * Raison d'être : tant que les Contrats (missions quotidiennes) n'existent
 * pas et que le PvP demande deux joueurs réels, aucune boucle jouable ne
 * permet de tester l'économie de bout en bout. `MATCH_TIDES.bot*` reste à 0
 * — la règle verrouillée n'est pas réécrite, elle est contournée à un seul
 * endroit, visible et désactivable.
 *
 * Volontairement deux fois plus faibles que le PvP : même en dev, un bot ne
 * doit pas être le chemin le plus rentable.
 */
export const DEV_BOT_MATCH_TIDES = {
  win: 4,
  loss: 1,
} as const;

/**
 * Première victoire PvP de la journée (UTC) — une des sources de Tides
 * explicitement désignées comme principales par le cadrage. Non
 * cumulable : c'est une récompense de retour quotidien, pas un multiplicateur
 * de farm.
 */
export const FIRST_PVP_WIN_OF_DAY_BONUS = {
  xp: 150,
  tides: 60,
} as const;

/** Tides octroyées à chaque niveau gagné. */
export const TIDES_PER_LEVEL = 60;

/**
 * Un booster standard offert tous N niveaux (en plus des Tides du niveau).
 * C'est le "palier" au sens du cadrage : un jalon visible, pas un revenu
 * continu.
 */
export const BOOSTER_EVERY_N_LEVELS = 5;

/** Booster offert par les paliers de niveau. */
export const LEVEL_REWARD_BOOSTER_ID = "standard";
