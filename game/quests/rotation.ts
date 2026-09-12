import { createSeed, shuffle } from "@/game/rng";
import {
  DAILY_QUEST_COUNT,
  MAX_PVP_ONLY_PER_PERIOD,
  QUEST_CATALOG,
  WEEKLY_QUEST_COUNT,
} from "@/game/quests/catalog";
import type { QuestDefinition, QuestType } from "@/game/quests/types";

const DAY_MS = 24 * 60 * 60 * 1000;

function utcDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Début (UTC, lundi 00:00) de la semaine contenant `date`. */
function startOfUtcWeek(date: Date): Date {
  const midnight = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const daysSinceMonday = (new Date(midnight).getUTCDay() + 6) % 7;
  return new Date(midnight - daysSinceMonday * DAY_MS);
}

/**
 * Clé de période d'une quête. Préfixée par le type, pour qu'une quête
 * quotidienne et une hebdomadaire ne puissent jamais partager une clé.
 * Quotidienne : `d:2026-09-13` ; hebdomadaire : `w:<lundi de la semaine>`.
 * Toujours en UTC, comme le bonus de première victoire du jour.
 */
export function questPeriodKey(questType: QuestType, now: Date = new Date()): string {
  return questType === "daily" ? `d:${utcDateKey(now)}` : `w:${utcDateKey(startOfUtcWeek(now))}`;
}

/** Instant (UTC) où la période courante se termine et où de nouvelles quêtes sont attribuées. */
export function questPeriodEndsAt(questType: QuestType, now: Date = new Date()): Date {
  if (questType === "daily") {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) + DAY_MS);
  }
  return new Date(startOfUtcWeek(now).getTime() + 7 * DAY_MS);
}

/** Hachage FNV-1a 32 bits : transforme `joueur + période` en graine stable. */
function hashSeed(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash | 0;
}

/**
 * Quêtes attribuées à un joueur pour une période.
 *
 * DÉTERMINISTE (même joueur, même période, même catalogue → mêmes quêtes) :
 * deux requêtes concurrentes qui attribuent en même temps écrivent donc les
 * mêmes lignes, et la clé primaire rend la seconde écriture sans effet.
 * Rafraîchir la page ne relance jamais le tirage.
 *
 * Respecte `MAX_PVP_ONLY_PER_PERIOD` : un joueur solo n'a jamais plus d'une
 * quête qu'il ne peut pas faire avancer contre le bot.
 */
export function selectQuestsForPeriod(
  userId: string,
  questType: QuestType,
  periodKey: string,
  catalog: readonly QuestDefinition[] = QUEST_CATALOG
): QuestDefinition[] {
  const count = questType === "daily" ? DAILY_QUEST_COUNT : WEEKLY_QUEST_COUNT;
  const pool = catalog.filter((q) => q.questType === questType).sort((a, b) => a.code.localeCompare(b.code));
  const shuffled = shuffle(pool, createSeed(hashSeed(`${userId}|${periodKey}`))).value;

  const selected: QuestDefinition[] = [];
  const usedObjectives = new Set<string>();
  let pvpOnly = 0;
  for (const quest of shuffled) {
    if (selected.length >= count) break;
    // Deux quêtes de la même période sur le même objectif feraient doublon.
    if (usedObjectives.has(quest.objectiveKey)) continue;
    if (!quest.botProgressAllowed) {
      if (pvpOnly >= MAX_PVP_ONLY_PER_PERIOD[questType]) continue;
      pvpOnly += 1;
    }
    selected.push(quest);
    usedObjectives.add(quest.objectiveKey);
  }
  return selected;
}
