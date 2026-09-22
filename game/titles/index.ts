/**
 * Titres (méta-jeu) — appellations portées avec le nom du joueur.
 *
 * Logique PURE : un titre est débloqué par un exploit obtenu, jamais par un
 * achat. L'équipement vérifié côté serveur vit dans `features/progression/`.
 */
export {
  TITLE_CATALOG,
  isTitleUnlocked,
  titleById,
  titleForAchievement,
  titleRequiredAchievement,
  titleUnlockLabel,
  unlockedTitles,
} from "@/game/titles/catalog";
export type { TitleDefinition, TitleUnlock } from "@/game/titles/catalog";
