import { TIDE_REWARD } from "@/game/economy/constants";

/**
 * Exploits — récompenses PERMANENTES et non renouvelables.
 *
 * Source de vérité : Notion « Progression joueur », section 10
 * (« Exploits »). Le principe verrouillé est leur nature : « permanents et
 * non renouvelables », à côté du journalier et de l'hebdomadaire, dans une
 * troisième famille de l'interface.
 *
 * MODÈLE D'ÉVALUATION. Un exploit n'est pas déclenché par un événement de
 * partie mais évalué à partir de COMPTEURS PERSISTÉS (`AchievementStats`) :
 * niveau, victoires, cartes possédées, boosters ouverts… C'est ce qui le
 * rend rattrapable — un compte créé avant qu'un exploit n'existe le
 * débloque à la première synchronisation — et immunisé aux événements
 * perdus, contrairement à un octroi « au moment où ça arrive ».
 */

/** Compteurs à partir desquels tout exploit est évalué. */
export interface AchievementStats {
  level: number;
  /** Victoires toutes catégories (PvP et bot). */
  wins: number;
  matchesPlayed: number;
  /** Boosters effectivement ouverts. */
  boostersOpened: number;
  /** Cartes DISTINCTES possédées. */
  distinctCardsOwned: number;
  /** `true` si au moins une carte Abyssale figure dans la collection. */
  ownsAbyssalCard: boolean;
  /** Préconstruits débloqués avec un Jeton. */
  preconDecksUnlocked: number;
  /** Préconstruits ou decks d'emprunt dont le joueur possède réellement toutes les cartes. */
  decksFullyOwned: number;
  /** Tutoriel terminé (et non passé). */
  tutorialCompleted: boolean;
}

export interface AchievementDefinition {
  /** Identifiant stable, clé d'idempotence en base (`player_achievements.code`). */
  code: string;
  name: string;
  description: string;
  /** Récompense à la première obtention — volontairement modeste, l'exploit est surtout un jalon. */
  rewardTides: number;
  /** Rempli ? Fonction PURE des compteurs persistés. */
  isUnlocked: (stats: AchievementStats) => boolean;
}

/** Paliers de niveau qui donnent un exploit (§10). */
export const ACHIEVEMENT_LEVEL_MILESTONES = [10, 20, 30, 40, 50] as const;

/** Paliers de collection (nombre de cartes DISTINCTES possédées). */
export const ACHIEVEMENT_COLLECTION_MILESTONES = [25, 60, 100] as const;

const levelAchievements: AchievementDefinition[] = ACHIEVEMENT_LEVEL_MILESTONES.map((level) => ({
  code: `level_${level}`,
  name: `Niveau ${level}`,
  description: `Atteindre le niveau ${level}.`,
  rewardTides: level >= 40 ? TIDE_REWARD.big : TIDE_REWARD.standard,
  isUnlocked: (stats) => stats.level >= level,
}));

const collectionAchievements: AchievementDefinition[] = ACHIEVEMENT_COLLECTION_MILESTONES.map((count) => ({
  code: `collection_${count}`,
  name: `${count} cartes`,
  description: `Posséder ${count} cartes différentes.`,
  rewardTides: TIDE_REWARD.standard,
  isUnlocked: (stats) => stats.distinctCardsOwned >= count,
}));

export const ACHIEVEMENT_CATALOG: readonly AchievementDefinition[] = [
  {
    code: "tutorial_completed",
    name: "Premier quart",
    description: "Terminer le tutoriel.",
    rewardTides: TIDE_REWARD.small,
    isUnlocked: (stats) => stats.tutorialCompleted,
  },
  {
    code: "first_win",
    name: "Premier pavillon",
    description: "Remporter votre première partie.",
    rewardTides: TIDE_REWARD.small,
    isUnlocked: (stats) => stats.wins >= 1,
  },
  {
    code: "first_booster",
    name: "Première cale ouverte",
    description: "Ouvrir votre premier booster.",
    rewardTides: TIDE_REWARD.small,
    isUnlocked: (stats) => stats.boostersOpened >= 1,
  },
  {
    code: "first_abyssal",
    name: "Quelque chose remonte",
    description: "Obtenir votre première carte Abyssale.",
    rewardTides: TIDE_REWARD.big,
    isUnlocked: (stats) => stats.ownsAbyssalCard,
  },
  {
    code: "first_precon",
    name: "Équipage recruté",
    description: "Débloquer votre premier préconstruit avec un Jeton.",
    rewardTides: TIDE_REWARD.standard,
    isUnlocked: (stats) => stats.preconDecksUnlocked >= 1,
  },
  {
    code: "deck_fully_owned",
    name: "Équipage complété",
    description: "Posséder réellement toutes les cartes d'un deck.",
    rewardTides: TIDE_REWARD.big,
    isUnlocked: (stats) => stats.decksFullyOwned >= 1,
  },
  {
    code: "ten_matches",
    name: "Pris le large",
    description: "Terminer 10 parties.",
    rewardTides: TIDE_REWARD.small,
    isUnlocked: (stats) => stats.matchesPlayed >= 10,
  },
  ...collectionAchievements,
  ...levelAchievements,
];

/** Exploits actuellement remplis d'après ces compteurs. L'appelant en retire ceux déjà octroyés. */
export function unlockedAchievements(stats: AchievementStats): AchievementDefinition[] {
  return ACHIEVEMENT_CATALOG.filter((achievement) => achievement.isUnlocked(stats));
}

export function achievementByCode(code: string): AchievementDefinition | undefined {
  return ACHIEVEMENT_CATALOG.find((achievement) => achievement.code === code);
}
