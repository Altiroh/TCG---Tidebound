import {
  QUEST_CATALOG,
  VOYAGE_CATALOG,
  questByCode,
  questLabel,
  voyageStepLabel,
  type QuestType,
} from "@/game/quests";
import type { QuestBoard, QuestEntry } from "@/features/quests/actions";
import type { VoyageBoard, VoyageStatus } from "@/features/quests/voyageActions";

/**
 * Journal de bord FABRIQUÉ, pour le labo `/game/quetes-preview` : aucune
 * lecture de session ni de base. Il montre les trois états d'une quête
 * (en cours, à réclamer, réclamée) et les trois d'une Traversée (bouclée
 * avec un palier en attente, en cours, verrouillée).
 */

function entry(code: string, progress: number, state: "open" | "done" | "claimed" = "open"): QuestEntry {
  const quest = questByCode(code) ?? QUEST_CATALOG[0]!;
  return {
    questId: code,
    code,
    periodKey: "labo",
    questType: quest.questType as QuestType,
    category: quest.category,
    name: quest.name,
    label: questLabel(quest),
    progress: state === "open" ? progress : quest.targetValue,
    target: quest.targetValue,
    rewardTides: quest.rewardTides,
    rewardXp: quest.rewardXp,
    rewardBoosterId: quest.rewardBoosterId ?? null,
    botProgressAllowed: quest.botProgressAllowed,
    completed: state !== "open",
    claimed: state === "claimed",
    fromPreviousPeriod: false,
  };
}

export function previewQuestBoard(): QuestBoard {
  const tomorrow = new Date(Date.now() + 9 * 3_600_000).toISOString();
  const nextWeek = new Date(Date.now() + 4 * 86_400_000).toISOString();
  return {
    isSignedIn: true,
    daily: [entry("daily_ship_ability_5", 3), entry("daily_play_in_abysses_3", 3, "done"), entry("daily_deraison_turns_8", 8, "claimed")],
    weekly: [entry("weekly_reveal_traps_12", 5), entry("weekly_play_matches_15", 9), entry("weekly_win_after_low_anchor_2", 1)],
    dailyEndsAt: tomorrow,
    weeklyEndsAt: nextWeek,
    dailyRerollsLeft: 1,
  };
}

/** Traversée I bouclée (deux paliers à réclamer), II en cours à l'escale 3, III verrouillée. */
export function previewVoyageBoard(): VoyageBoard {
  const plan: Record<string, { status: VoyageStatus; tier: number; claimed: number; progress: number }> = {
    "premier-quart": { status: "done", tier: 5, claimed: 3, progress: 0 },
    "eaux-troubles": { status: "current", tier: 2, claimed: 2, progress: 1 },
    "grand-fond": { status: "locked", tier: 0, claimed: 0, progress: 0 },
  };
  return {
    available: true,
    voyages: VOYAGE_CATALOG.map((voyage) => {
      const p = plan[voyage.id]!;
      return {
        id: voyage.id,
        numeral: voyage.numeral,
        name: voyage.name,
        tagline: voyage.tagline,
        status: p.status,
        tier: p.tier,
        claimableTier: p.claimed < p.tier ? p.claimed + 1 : null,
        steps: voyage.steps.map((step, index) => ({
          code: step.code,
          name: step.name,
          label: voyageStepLabel(step),
          target: step.targetValue,
          progress: index < p.tier ? step.targetValue : index === p.tier ? p.progress : 0,
          state: index < p.tier ? "done" : index === p.tier && p.status === "current" ? "current" : "upcoming",
          reward: step.reward,
          claimed: index < p.claimed,
        })),
      };
    }),
  };
}
