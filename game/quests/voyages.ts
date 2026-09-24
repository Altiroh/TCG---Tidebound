import { STANDARD_BOOSTER_ID } from "@/game/economy/constants";
import { QUEST_OBJECTIVE_LABELS, questProgressKind } from "@/game/quests/catalog";
import type { MatchQuestContribution } from "@/game/quests/progress";
import type { QuestObjectiveKey } from "@/game/quests/types";

/**
 * TRAVERSÉES — des suites de quêtes à paliers (audit du 24/09/2026).
 *
 * Une Traversée est un voyage de CINQ escales, faites DANS L'ORDRE. Seule
 * l'escale en cours progresse ; la terminer fait monter la Traversée d'un
 * PALIER, et chaque palier a sa récompense, qu'on réclame. Le cinquième
 * donne le gros lot, dont un titre (par l'exploit `achievementCode`).
 *
 * Ce qui les distingue des quêtes du jour et de la semaine :
 *   - PERMANENTES : aucune échéance, on avance à son rythme ;
 *   - DÉBLOQUÉES EN SÉQUENCE : la II s'ouvre quand la I est bouclée ;
 *   - FINIES : une Traversée terminée ne rapporte plus rien, donc rien à
 *     farmer. Les récompenses sont surtout de l'XP et des titres — l'audit
 *     a relevé que les quêtes rapportent déjà ~10 boosters par semaine.
 *
 * Les escales réutilisent les objectifs des quêtes (`QuestObjectiveKey`) et
 * leur calcul (`computeMatchQuestContribution`) : une même partie fait
 * avancer quotidiennes, hebdomadaires et l'escale en cours.
 *
 * Les identifiants (Traversée, escale) sont FIGÉS : ils sont stockés en
 * base (`player_voyages`).
 *
 * Source de vérité design : Notion « Audit des quêtes & Traversées ».
 */

export interface VoyageReward {
  xp: number;
  tides: number;
  /** Booster offert en plus, au dernier palier seulement. */
  boosterId?: string;
}

export interface VoyageStep {
  /** Identifiant stable de l'escale. */
  code: string;
  /** Nom de l'escale (« Barre en main »). */
  name: string;
  objectiveKey: QuestObjectiveKey;
  targetValue: number;
  /** Récompense du palier atteint en bouclant cette escale. */
  reward: VoyageReward;
}

export interface VoyageDefinition {
  /** Identifiant stable, stocké dans `player_voyages.voyage_id`. */
  id: string;
  /** Numéro affiché (« Traversée I »). */
  numeral: string;
  name: string;
  /** Une ligne, sous le nom. */
  tagline: string;
  steps: readonly VoyageStep[];
  /** Exploit posé quand la Traversée est bouclée — c'est lui qui débloque le titre. */
  achievementCode: string;
}

/** Nombre d'escales d'une Traversée — c'est aussi son nombre de paliers. */
export const VOYAGE_STEP_COUNT = 5;

export const VOYAGE_CATALOG: readonly VoyageDefinition[] = [
  {
    id: "premier-quart",
    numeral: "I",
    name: "Le Premier Quart",
    tagline: "Apprendre le bateau avant d'apprendre la mer.",
    achievementCode: "voyage_premier_quart",
    steps: [
      { code: "prendre-la-mer", name: "Prendre la mer", objectiveKey: "play_matches", targetValue: 3, reward: { xp: 100, tides: 0 } },
      { code: "barre-en-main", name: "Barre en main", objectiveKey: "ship_ability_uses", targetValue: 3, reward: { xp: 150, tides: 0 } },
      { code: "lire-l-eau", name: "Lire l'eau", objectiveKey: "modify_tide", targetValue: 2, reward: { xp: 150, tides: 25 } },
      { code: "pas-si-vite", name: "Pas si vite", objectiveKey: "activate_reactions", targetValue: 2, reward: { xp: 200, tides: 0 } },
      { code: "premiere-prise", name: "Première prise", objectiveKey: "win_matches", targetValue: 1, reward: { xp: 250, tides: 0, boosterId: STANDARD_BOOSTER_ID } },
    ],
  },
  {
    id: "eaux-troubles",
    numeral: "II",
    name: "Les Eaux Troubles",
    tagline: "Là où l'on s'endette, et où l'on descend.",
    achievementCode: "voyage_eaux_troubles",
    steps: [
      { code: "vivre-a-credit", name: "Vivre à crédit", objectiveKey: "deraison_turns", targetValue: 6, reward: { xp: 150, tides: 0 } },
      { code: "jouer-dans-le-noir", name: "Jouer dans le noir", objectiveKey: "play_in_abysses", targetValue: 3, reward: { xp: 150, tides: 25 } },
      { code: "les-gros-calibres", name: "Les gros calibres", objectiveKey: "play_big_cards", targetValue: 3, reward: { xp: 200, tides: 0 } },
      { code: "a-un-fil", name: "À un fil", objectiveKey: "finish_low_anchor", targetValue: 1, reward: { xp: 250, tides: 50 } },
      { code: "dernier-souffle", name: "Dernier souffle", objectiveKey: "win_after_low_anchor", targetValue: 1, reward: { xp: 300, tides: 0, boosterId: STANDARD_BOOSTER_ID } },
    ],
  },
  {
    id: "grand-fond",
    numeral: "III",
    name: "Le Grand Fond",
    tagline: "Ce que la mer garde pour ceux qui savent la tenir.",
    achievementCode: "voyage_grand_fond",
    steps: [
      { code: "nettoyer-le-pont", name: "Nettoyer le pont", objectiveKey: "destroy_enemy_permanents", targetValue: 25, reward: { xp: 200, tides: 0 } },
      { code: "tenir-dans-la-tempete", name: "Tenir dans la tempête", objectiveKey: "turns_in_tempete", targetValue: 8, reward: { xp: 200, tides: 25 } },
      { code: "tous-les-horizons", name: "Tous les horizons", objectiveKey: "distinct_decks_won", targetValue: 3, reward: { xp: 250, tides: 0 } },
      { code: "au-point-exact", name: "Au point exact", objectiveKey: "exact_lethal", targetValue: 1, reward: { xp: 300, tides: 50 } },
      { code: "tete-froide", name: "Tête froide", objectiveKey: "win_without_deraison", targetValue: 1, reward: { xp: 400, tides: 0, boosterId: "etrangete-sous-marine" } },
    ],
  },
];

export function voyageById(id: string): VoyageDefinition | undefined {
  return VOYAGE_CATALOG.find((voyage) => voyage.id === id);
}

/** Libellé joueur d'une escale (« Activer la capacité de votre Navire 3 fois »). */
export function voyageStepLabel(step: Pick<VoyageStep, "objectiveKey" | "targetValue">): string {
  return QUEST_OBJECTIVE_LABELS[step.objectiveKey](step.targetValue);
}

/**
 * Où en est un joueur sur une Traversée — le miroir d'une ligne de
 * `player_voyages`. `stepIndex` est aussi le PALIER atteint : 0 au départ,
 * `VOYAGE_STEP_COUNT` une fois bouclée.
 */
export interface VoyageProgress {
  voyageId: string;
  stepIndex: number;
  /** Progression de l'escale en cours. */
  stepProgress: number;
  /** Valeurs distinctes déjà vues, pour une escale d'objectif `set` (decks distincts). */
  stepMeta: readonly string[];
  /** Paliers déjà réclamés — toujours les premiers, dans l'ordre. */
  claimedTiers: number;
}

export function freshVoyageProgress(voyageId: string): VoyageProgress {
  return { voyageId, stepIndex: 0, stepProgress: 0, stepMeta: [], claimedTiers: 0 };
}

export function isVoyageComplete(progress: Pick<VoyageProgress, "stepIndex">): boolean {
  return progress.stepIndex >= VOYAGE_STEP_COUNT;
}

/**
 * La Traversée EN COURS : la première du catalogue qui n'est pas bouclée.
 * `undefined` quand toutes le sont. Une Traversée sans ligne en base est
 * simplement pas commencée.
 */
export function currentVoyage(progressById: ReadonlyMap<string, VoyageProgress>): VoyageDefinition | undefined {
  return VOYAGE_CATALOG.find((voyage) => !isVoyageComplete(progressById.get(voyage.id) ?? freshVoyageProgress(voyage.id)));
}

export interface VoyageAdvance {
  next: VoyageProgress;
  /** Progression de l'escale AVANT la partie. */
  before: number;
  /** Progression APRÈS, bornée à la cible — pour la jauge du récapitulatif. */
  after: number;
  target: number;
  /** L'escale vient d'être bouclée : un palier de plus à réclamer. */
  completedStep: boolean;
}

/**
 * Ce qu'une partie apporte à l'escale en cours. Pure.
 *
 * Une partie ne boucle AU PLUS qu'une escale : le journal ne dit pas quelle
 * part de la partie a servi à la terminer, donc l'escale suivante s'ouvre à
 * zéro et avance dès la partie d'après. `null` quand rien ne bouge — pour
 * ne rien écrire en base.
 */
export function advanceVoyage(
  voyage: VoyageDefinition,
  progress: VoyageProgress,
  contribution: MatchQuestContribution
): VoyageAdvance | null {
  if (isVoyageComplete(progress)) return null;
  const step = voyage.steps[progress.stepIndex];
  if (!step) return null;

  const kind = questProgressKind(step.objectiveKey);
  let value = progress.stepProgress;
  let meta = progress.stepMeta;

  if (kind === "set") {
    const merged = new Set([...progress.stepMeta, ...(contribution.sets[step.objectiveKey] ?? [])]);
    meta = [...merged].sort();
    value = merged.size;
  } else {
    const contributed = contribution.progress[step.objectiveKey] ?? 0;
    value = kind === "max" ? Math.max(value, contributed) : value + contributed;
  }

  if (value === progress.stepProgress && meta.length === progress.stepMeta.length) return null;

  const completedStep = value >= step.targetValue;
  const after = Math.min(value, step.targetValue);
  return {
    before: progress.stepProgress,
    after,
    target: step.targetValue,
    completedStep,
    next: completedStep
      ? { ...progress, stepIndex: progress.stepIndex + 1, stepProgress: 0, stepMeta: [] }
      : { ...progress, stepProgress: value, stepMeta: meta },
  };
}

/** Prochain palier réclamable (1 à 5), ou `null` s'il n'y en a pas. */
export function nextClaimableTier(progress: Pick<VoyageProgress, "stepIndex" | "claimedTiers">): number | null {
  return progress.claimedTiers < progress.stepIndex ? progress.claimedTiers + 1 : null;
}
