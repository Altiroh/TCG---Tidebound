import type { CardRarity } from "@/game/boosters/types";
import { NECESSAIRE_DU_MARIN_BOOSTER_ID, STANDARD_BOOSTER_ID, TIDE_REWARD } from "@/game/economy/constants";

/**
 * Table de récompenses de progression — niveaux 1 à 50.
 *
 * Source de vérité design : Notion « Progression joueur — Tutoriel, XP,
 * Quêtes & Préconstruits » (2026-09-15), section 6. Trois principes y sont
 * VERROUILLÉS, les montants restant ajustables après playtest :
 *   - une récompense à CHAQUE niveau, sans trou ;
 *   - un gros palier tous les ~5 niveaux ;
 *   - un Jeton de Préconstruit tous les 10 niveaux.
 *
 * La table ci-dessous transcrit littéralement celle de la page. Elle est
 * typée plutôt que textuelle (`LevelRewardItem`) pour que l'octroi soit
 * exécutable : chaque entrée dit exactement ce qu'il faut créditer, et un
 * nouveau type de récompense s'ajoute sans toucher au reste du système
 * (exigence §13 : « prévoir les champs nécessaires pour ajouter ensuite de
 * nouvelles quêtes, récompenses, niveaux et préconstruits sans recoder le
 * système en dur »).
 */

/** Familles de cosmétiques déblocables par la progression. */
export type CosmeticKind = "frame" | "title" | "avatar" | "cardBack" | "shipSkin";

/**
 * Une récompense élémentaire. Un palier en accorde une ou plusieurs
 * (`LEVEL_REWARDS`), et `features/progression/levelRewards.ts` sait
 * appliquer chaque variante.
 */
export type LevelRewardItem =
  /** Crédit direct de Tides. */
  | { kind: "tides"; amount: number }
  /** `count` exemplaires du booster `boosterId`. */
  | { kind: "booster"; boosterId: string; count: number }
  /**
   * Choix d'une carte parmi `choices` de cette rareté. Le tirage des
   * propositions est fait au moment de la réclamation (serveur) et retenu
   * jusqu'au choix du joueur — un palier de ce type reste donc « en
   * attente » tant qu'il n'a pas été tranché.
   */
  | { kind: "cardChoice"; rarity: CardRarity; choices: number }
  /** Jetons de Préconstruit (§4) — dépensés dans Decks → Préconstruits. */
  | { kind: "preconToken"; count: number }
  /** Cosmétique : rien de jouable, seulement de l'identité de profil. */
  | { kind: "cosmetic"; cosmetic: CosmeticKind; id: string; label: string };

/**
 * Dernier niveau récompensé de CETTE version (Notion : « jusqu'au niveau 50
 * dans cette première version »). L'XP continue de s'accumuler au-delà — il
 * n'y a pas de niveau maximum — mais plus aucun palier n'est octroyé, et
 * l'interface le dit plutôt que d'afficher un palier vide.
 */
export const MAX_REWARDED_LEVEL = 50;

const tides = (amount: number): LevelRewardItem => ({ kind: "tides", amount });
const booster = (count = 1): LevelRewardItem => ({ kind: "booster", boosterId: STANDARD_BOOSTER_ID, count });
/**
 * Booster Nécessaire du Marin (Lot 14) — la CONSOLIDATION de la courbe de
 * progression, entre le Standard (découverte) et les Préconstruits
 * (spécialisation).
 *
 * Il est donné et pas seulement vendu, à dessein : un joueur qui n'achète
 * jamais rien doit quand même finir par tenir des pièges, du removal et de
 * quoi piocher. Sans ça, les outils de base du deckbuilding seraient
 * réservés à ceux qui paient — exactement ce qu'un booster de
 * consolidation ne doit pas être.
 */
const necessaireDuMarin = (count = 1): LevelRewardItem => ({ kind: "booster", boosterId: NECESSAIRE_DU_MARIN_BOOSTER_ID, count });
const cardChoice = (rarity: CardRarity, choices = 3): LevelRewardItem => ({ kind: "cardChoice", rarity, choices });
const preconToken = (count = 1): LevelRewardItem => ({ kind: "preconToken", count });
const cosmetic = (kind: CosmeticKind, id: string, label: string): LevelRewardItem => ({ kind: "cosmetic", cosmetic: kind, id, label });

/**
 * Récompenses par niveau ATTEINT, index 1 à 50. Transcription directe du
 * tableau Notion — ne rien y « arrondir » sans arbitrage design : les
 * montants 25/30/35/40/45/50/55/60/65/70/75/100 sont ceux de la page, et
 * `TIDE_REWARD` n'est utilisé que là où la page retombe exactement sur un
 * repère (25 = petite, 75 = belle).
 *
 * ÉCART ASSUMÉ AVEC LA PAGE (22/09/2026) — six paliers de Tides ont été
 * convertis en boosters Nécessaire du Marin : 6, 11, 18, 26, 33, et 43
 * (double). Ce qui a guidé le placement :
 *
 *  - on ne touche à AUCUN gros palier. Les trois principes verrouillés
 *    tiennent toujours — une récompense à chaque niveau, un gros palier
 *    tous les ~5 niveaux, un Jeton de Préconstruit tous les 10 ;
 *  - les sept boosters Standard (4, 14, 24, 34, 39, 44, 49) restent en
 *    place : le Nécessaire s'AJOUTE à la découverte, il ne la remplace pas ;
 *  - les paliers convertis sont des niveaux de Tides « plats », espacés des
 *    cosmétiques (5, 15, 25, 35, 45) et des Préconstruits (10, 20, 30, 40) ;
 *  - le premier tombe au niveau 6, juste après le premier Standard : le
 *    joueur a vu des cartes, il peut commencer à construire.
 *
 * Coût pour l'économie : 335 Tides de récompenses directes en moins sur
 * 50 niveaux (35 + 40 + 50 + 60 + 65 + 75), rendus en 7 boosters valant
 * 700 Tides au Market. Un joueur qui ne dépense rien est donc gagnant ;
 * un joueur qui achetait déjà perd un peu de liquidité. C'est le sens de
 * la carte : mettre les outils entre toutes les mains.
 */
export const LEVEL_REWARDS: Readonly<Record<number, readonly LevelRewardItem[]>> = {
  1: [tides(TIDE_REWARD.small)],
  2: [cardChoice("common")],
  3: [tides(30)],
  4: [booster()],
  5: [cosmetic("frame", "frame-mousse", "Cadre de profil — Mousse")],
  6: [necessaireDuMarin()],
  7: [cardChoice("uncommon")],
  8: [tides(40)],
  9: [tides(TIDE_REWARD.big)],
  10: [preconToken()],
  11: [necessaireDuMarin()],
  12: [cardChoice("common")],
  13: [tides(45)],
  14: [booster()],
  15: [cosmetic("title", "title-marin-eau-douce", "Titre — Marin d'eau douce")],
  16: [tides(50)],
  17: [cardChoice("uncommon")],
  18: [necessaireDuMarin()],
  19: [tides(TIDE_REWARD.big)],
  20: [preconToken(), cosmetic("avatar", "avatar-timonier", "Avatar — Timonier")],
  21: [tides(50)],
  22: [cardChoice("common")],
  23: [tides(55)],
  24: [booster()],
  // L'identifiant pointe sur un dos RÉEL (`game/cosmetics/cardBacks.ts`) :
  // c'est le seul cosmétique aujourd'hui équipable, depuis le profil.
  25: [cosmetic("cardBack", "back-ogee", "Dos de carte — Épave engloutie")],
  26: [necessaireDuMarin()],
  27: [cardChoice("uncommon")],
  28: [tides(60)],
  29: [tides(TIDE_REWARD.big)],
  30: [preconToken()],
  31: [tides(65)],
  32: [cardChoice("uncommon")],
  33: [necessaireDuMarin()],
  34: [booster()],
  35: [cosmetic("frame", "frame-vieux-loup", "Cadre de profil — Vieux Loup de Mer")],
  36: [tides(70)],
  // « Carte rare aléatoire ou choix limité » : on retient le choix, cohérent
  // avec tous les autres paliers de carte, et plus lisible côté joueur.
  37: [cardChoice("rare", 3)],
  38: [tides(TIDE_REWARD.big)],
  39: [booster(2)],
  40: [preconToken(), cosmetic("shipSkin", "ship-skin-abyssal", "Cosmétique de Navire — Coque abyssale")],
  41: [tides(TIDE_REWARD.big)],
  42: [cardChoice("uncommon")],
  43: [necessaireDuMarin(2)],
  44: [booster()],
  45: [cosmetic("title", "title-capitaine", "Titre — Capitaine")],
  46: [tides(100)],
  47: [cardChoice("rare")],
  48: [tides(100)],
  49: [booster(2)],
  50: [
    preconToken(),
    cosmetic("cardBack", "back-prestige-50", "Dos exclusif niveau 50"),
    cosmetic("frame", "frame-prestige-50", "Cadre prestige niveau 50"),
  ],
};

/** Récompenses d'un niveau ATTEINT — tableau vide au-delà de `MAX_REWARDED_LEVEL`. */
export function levelRewardItems(level: number): readonly LevelRewardItem[] {
  return LEVEL_REWARDS[level] ?? [];
}

/**
 * Tous les paliers franchis en passant de `levelBefore` à `levelAfter`.
 * Vide si aucun niveau n'a été gagné — et jamais rien pour un niveau déjà
 * atteint, ce qui rend l'octroi idempotent dès lors que `levelBefore` vient
 * de la base.
 */
export function levelRewardsBetween(levelBefore: number, levelAfter: number): Array<{ level: number; items: readonly LevelRewardItem[] }> {
  const rewards: Array<{ level: number; items: readonly LevelRewardItem[] }> = [];
  for (let level = levelBefore + 1; level <= Math.min(levelAfter, MAX_REWARDED_LEVEL); level++) {
    rewards.push({ level, items: levelRewardItems(level) });
  }
  return rewards;
}

/**
 * Un palier est « gros » s'il donne autre chose que des Tides : c'est ce
 * que le profil met en avant dans son aperçu des prochains paliers (§12).
 */
export function isMilestoneLevel(level: number): boolean {
  return levelRewardItems(level).some((item) => item.kind !== "tides");
}

/** Prochains gros paliers à partir de `level` (exclu), pour l'aperçu du profil. */
export function nextMilestones(level: number, count = 3): number[] {
  const milestones: number[] = [];
  for (let next = level + 1; next <= MAX_REWARDED_LEVEL && milestones.length < count; next++) {
    if (isMilestoneLevel(next)) milestones.push(next);
  }
  return milestones;
}

const COSMETIC_LABELS: Record<CosmeticKind, string> = {
  frame: "Cadre",
  title: "Titre",
  avatar: "Avatar",
  cardBack: "Dos de carte",
  shipSkin: "Cosmétique de Navire",
};

const RARITY_LABELS: Record<CardRarity, string> = {
  common: "commune",
  uncommon: "peu commune",
  rare: "rare",
  epic: "Épique",
  legendary: "Légendaire",
  abyssal: "Abyssale",
};

/** Libellé joueur d'une récompense, utilisé par le profil et l'écran de fin de partie. */
export function levelRewardLabel(item: LevelRewardItem): string {
  switch (item.kind) {
    case "tides":
      return `${item.amount} Tides`;
    case "booster":
      return item.count > 1 ? `${item.count} boosters Standard` : "1 booster Standard";
    case "cardChoice":
      return `Carte ${RARITY_LABELS[item.rarity]} au choix parmi ${item.choices}`;
    case "preconToken":
      return item.count > 1 ? `${item.count} Jetons de Préconstruit` : "Jeton de Préconstruit";
    case "cosmetic":
      return item.label || COSMETIC_LABELS[item.cosmetic];
  }
}

/** Libellé condensé de tout un palier (« 1 booster Standard · Jeton de Préconstruit »). */
export function levelRewardsLabel(level: number): string {
  const items = levelRewardItems(level);
  if (items.length === 0) return "—";
  return items.map(levelRewardLabel).join(" · ");
}
