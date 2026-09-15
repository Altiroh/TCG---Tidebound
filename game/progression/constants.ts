/**
 * Progression joueur — XP et calibrage de la boucle de partie.
 *
 * SOURCE DE VÉRITÉ : Notion « Progression joueur — Tutoriel, XP, Quêtes &
 * Préconstruits » (2026-09-15), sections 5 à 7. Elle remplace le calibrage
 * prototype précédent (booster à 500 Tides, 100/60 XP par partie), et
 * verrouille :
 *   - 150 Tides = 1 booster Standard (cf. `game/economy/constants.ts`) ;
 *   - partie terminée : +25 XP, victoire : +25 XP de plus ;
 *   - première victoire du jour : +75 XP et +25 Tides ;
 *   - 3 parties terminées dans la journée : +50 XP de bonus ;
 *   - une récompense à chaque niveau jusqu'à 50 (`levelRewards.ts`) ;
 *   - « prévoir une protection anti-AFK / abandon : une partie abandonnée
 *     immédiatement ou sans activité significative ne doit pas accorder la
 *     récompense complète ».
 *
 * Reste NON verrouillé et ajustable ici : la courbe d'XP niveau par niveau
 * (§14, « à équilibrer plus tard ») et les Tides par partie.
 */
import { TIDE_REWARD } from "@/game/economy/constants";

/** XP nécessaire pour passer du niveau 1 au niveau 2. */
export const XP_FIRST_LEVEL = 150;

/** Chaque niveau coûte ce nombre d'XP de plus que le précédent. */
export const XP_LEVEL_STEP = 25;

/**
 * Au-delà de ce niveau, le coût d'un niveau cesse d'augmenter. Sans ce
 * plateau, les niveaux élevés deviennent inatteignables et la progression
 * n'est plus lisible ; ce n'est pas un niveau maximum (il n'y en a pas).
 *
 * Calibrage retenu, à retester : un joueur régulier (4 parties dont
 * 2 victoires, ses 3 quêtes du jour) gagne ~700 XP/jour, soit le niveau 50
 * en un peu plus d'un mois — la table de paliers 1-50 a donc le temps de se
 * dérouler sans être consommée en une semaine.
 */
export const XP_STEP_PLATEAU_LEVEL = 20;

/** Niveau de départ d'un compte neuf. */
export const STARTING_LEVEL = 1;

/**
 * XP par partie (§7). Volontairement INDÉPENDANT de l'issue pour sa moitié
 * basse : « une partie terminée doit toujours faire progresser le joueur,
 * même en cas de défaite ».
 */
export const MATCH_XP = {
  /** Toute partie menée à son terme. */
  completed: 25,
  /** S'ajoute à `completed` en cas de victoire. */
  win: 25,
} as const;

/**
 * Partie écourtée sans jeu réel (abandon immédiat, aucune action
 * significative) : la progression n'est pas nulle — sinon une déconnexion
 * malheureuse serait punie — mais réduite au point que l'abandon en boucle
 * ne soit jamais rentable. Aucune Tide, aucun bonus, et la partie ne compte
 * pas dans les 3 parties du jour.
 */
export const ABANDONED_MATCH_XP = 5;

/**
 * Seuil d'« activité significative » (§7, anti-AFK). Une partie compte
 * pleinement dès que le joueur a fait l'une de ces choses ; c'est
 * volontairement bas : l'objectif est d'écarter l'abandon immédiat, pas de
 * pénaliser une partie courte mais jouée.
 */
export const MEANINGFUL_ACTIVITY = {
  /** Cartes posées depuis la main. */
  cardsPlayed: 2,
  /** Attaques déclarées. */
  attacks: 1,
  /** Tours de jeu écoulés dans la partie (les deux joueurs confondus). */
  turns: 4,
} as const;

/**
 * Tides par partie. Le cadrage antérieur (« Boosters & économie de
 * collection ») verrouille « les parties contre bot rapportent 0 Tide
 * directement » ; la nouvelle page ne revient pas dessus, cette règle tient
 * donc toujours. Avec un booster à 150 Tides, 5 Tides par victoire PvP
 * demandent 30 victoires pour un booster : le farm de matchs reste une
 * mauvaise affaire face aux quêtes, ce qui est l'intention.
 */
export const MATCH_TIDES = {
  pvpWin: 5,
  pvpLoss: 2,
  botWin: 0,
  botLoss: 0,
} as const;

/**
 * DÉROGATION DE DÉVELOPPEMENT — parité bot / PvP.
 *
 * Ne s'applique QUE si l'appelant passe explicitement `botCountsAsPvp`
 * (cf. `computeMatchReward`), ce que seule fait la politique de
 * développement `features/progression/botRewardPolicy.ts`. La partie contre
 * bot est alors traitée EXACTEMENT comme une partie PvP : mêmes Tides
 * (`MATCH_TIDES.pvp*`), bonus de Tides de la première victoire du jour, et
 * quêtes réservées au PvP qui avancent.
 *
 * Raison d'être : tester la boucle complète (XP, Tides, paliers, quêtes) avec
 * UN seul compte, sans monter deux sessions PvP. La règle verrouillée n'est
 * pas réécrite — elle est contournée à un seul endroit, visible et
 * désactivable par `TIDEBOUND_BOT_REWARDS=off`.
 */

/**
 * Première victoire du jour (UTC) — §7. Le bonus de Tides reste réservé au
 * PvP, par cohérence avec la règle « bot = 0 Tide » ; l'XP, elle, est
 * accordée quel que soit le mode, puisque le cadrage veut que jouer fasse
 * toujours progresser.
 */
export const FIRST_WIN_OF_DAY_BONUS = {
  xp: 75,
  tides: TIDE_REWARD.small,
} as const;

/** Bonus accordé UNE fois par jour, à la 3ᵉ partie terminée (§7). */
export const DAILY_MATCHES_BONUS = {
  matches: 3,
  xp: 50,
} as const;
