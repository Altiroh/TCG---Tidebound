"use server";

import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { ensureCurrentQuests } from "@/features/quests/questService";
import {
  QUEST_CATEGORY_META,
  pickReplacementQuest,
  questByCode,
  questLabel,
  questPeriodEndsAt,
  questPeriodKey,
  QUEST_OBJECTIVE_LABELS,
  REROLLS_PER_PERIOD,
  type QuestCategory,
  type QuestObjectiveKey,
  type QuestType,
} from "@/game/quests";

/**
 * Quêtes — Server Actions exposées au navigateur. Le joueur est TOUJOURS
 * déduit de la session, jamais reçu en paramètre ; montants et état de
 * complétion sont relus en base par les fonctions Postgres.
 */

export interface QuestEntry {
  questId: string;
  /** Code du catalogue — nécessaire pour tirer un remplacement déterministe. */
  code: string;
  periodKey: string;
  questType: QuestType;
  /** Catégorie d'interface — porte l'icône de la ligne. */
  category: QuestCategory;
  /** Nom de la quête (« Prendre le large »), affiché au-dessus de l'objectif. */
  name: string;
  label: string;
  progress: number;
  target: number;
  rewardTides: number;
  rewardXp: number;
  rewardBoosterId: string | null;
  botProgressAllowed: boolean;
  completed: boolean;
  claimed: boolean;
  /** `true` pour une quête d'une période passée, terminée mais pas encore réclamée. */
  fromPreviousPeriod: boolean;
}

export interface QuestBoard {
  isSignedIn: boolean;
  /** Joueur connecté, mais lecture/attribution des quêtes impossible côté serveur (config, base) — à ne pas confondre avec "non connecté". */
  unavailable?: boolean;
  daily: QuestEntry[];
  weekly: QuestEntry[];
  dailyEndsAt: string;
  weeklyEndsAt: string;
  /** Remplacements gratuits restants pour la journée (Notion « Progression joueur » §9). */
  dailyRerollsLeft: number;
}

function isObjectiveKey(key: string): key is QuestObjectiveKey {
  return key in QUEST_OBJECTIVE_LABELS;
}

/**
 * Catégorie d'une quête. La base en est le miroir, mais le CATALOGUE
 * TypeScript fait foi : une base en retard d'un seed rendrait sinon des
 * lignes sans icône. `parties` est le repli neutre.
 */
function resolveCategory(code: string | null, stored: string | null): QuestCategory {
  const fromCatalog = code ? questByCode(code)?.category : undefined;
  if (fromCatalog) return fromCatalog;
  if (stored && stored in QUEST_CATEGORY_META) return stored as QuestCategory;
  return "parties";
}

export async function fetchQuestBoard(): Promise<QuestBoard> {
  const now = new Date();
  const empty: QuestBoard = {
    isSignedIn: false,
    daily: [],
    weekly: [],
    dailyEndsAt: questPeriodEndsAt("daily", now).toISOString(),
    weeklyEndsAt: questPeriodEndsAt("weekly", now).toISOString(),
    dailyRerollsLeft: 0,
  };

  let signedIn = false;
  try {
    const supabase = createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return empty;
    signedIn = true;

    await ensureCurrentQuests(user.id, now);

    const dailyKey = questPeriodKey("daily", now);
    const currentKeys = [dailyKey, questPeriodKey("weekly", now)];
    const service = createSupabaseServiceRoleClient();
    const rerollsPromise = service
      .from("player_quest_rerolls")
      .select("used")
      .eq("user_id", user.id)
      .eq("period_key", dailyKey)
      .maybeSingle();
    const [{ data: rows, error }, { data: quests, error: questsError }] = await Promise.all([
      service
        .from("player_quest_progress")
        .select("*")
        .eq("user_id", user.id)
        // Période courante, ou quête terminée non réclamée d'une période passée.
        .or(`period_key.in.(${currentKeys.map((key) => `"${key}"`).join(",")}),and(completed_at.not.is.null,claimed_at.is.null)`),
      service.from("quests").select("*"),
    ]);
    if (error || questsError) {
      console.error("[fetchQuestBoard] Lecture impossible :", error?.message ?? questsError?.message);
      return { ...empty, isSignedIn: true, unavailable: true };
    }

    const questById = new Map((quests ?? []).map((q) => [q.id, q]));
    const entries: QuestEntry[] = [];
    for (const row of rows ?? []) {
      const quest = questById.get(row.quest_id);
      if (!quest || !isObjectiveKey(quest.objective_key)) continue;
      entries.push({
        questId: row.quest_id,
        code: quest.code ?? "",
        periodKey: row.period_key,
        questType: quest.quest_type,
        category: resolveCategory(quest.code, quest.category),
        // Le nom vient du catalogue TypeScript quand la base est en retard
        // d'un seed : mieux vaut un nom correct qu'une ligne anonyme.
        name: quest.name ?? questByCode(quest.code ?? "")?.name ?? "",
        label: questLabel({ objectiveKey: quest.objective_key, targetValue: quest.target_value }),
        progress: row.progress_value,
        target: quest.target_value,
        rewardTides: quest.reward_currency,
        rewardXp: quest.reward_xp ?? 0,
        rewardBoosterId: quest.reward_booster_definition_id,
        botProgressAllowed: quest.bot_progress_allowed,
        completed: row.completed_at !== null,
        claimed: row.claimed_at !== null,
        fromPreviousPeriod: !currentKeys.includes(row.period_key),
      });
    }

    // Réclamables d'abord, puis en cours, puis déjà réclamées.
    const rank = (entry: QuestEntry) => (entry.completed && !entry.claimed ? 0 : entry.claimed ? 2 : 1);
    entries.sort((a, b) => rank(a) - rank(b) || a.label.localeCompare(b.label));

    const { data: rerolls } = await rerollsPromise;
    return {
      ...empty,
      isSignedIn: true,
      daily: entries.filter((e) => e.questType === "daily"),
      weekly: entries.filter((e) => e.questType === "weekly"),
      dailyRerollsLeft: Math.max(0, REROLLS_PER_PERIOD.daily - (rerolls?.used ?? 0)),
    };
  } catch (error) {
    console.error("[fetchQuestBoard] Échec :", error);
    // Une panne APRÈS avoir identifié le joueur n'est pas une déconnexion : ne pas lui demander de se reconnecter.
    return { ...empty, isSignedIn: signedIn, unavailable: signedIn };
  }
}

export interface ClaimQuestResult {
  ok: boolean;
  error?: string;
  tidesGained?: number;
  xpGained?: number;
  boosterId?: string | null;
  balance?: number;
}

export async function claimQuestReward(questId: string, periodKey: string): Promise<ClaimQuestResult> {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Connecte-toi pour réclamer une récompense." };

  const service = createSupabaseServiceRoleClient();
  const { data, error } = await service.rpc("claim_quest_reward", {
    p_user_id: user.id,
    p_quest_id: questId,
    p_period_key: periodKey,
  });
  if (error) {
    console.error("[claimQuestReward] Réclamation refusée :", error.message);
    return { ok: false, error: "Réclamation impossible pour le moment." };
  }
  if (!data?.ok) return { ok: false, error: data?.error ?? "Réclamation impossible." };

  return {
    ok: true,
    tidesGained: data.tides_gained,
    xpGained: data.xp_gained,
    boosterId: data.booster_id ?? null,
    balance: data.balance,
  };
}

export interface RerollQuestResult {
  ok: boolean;
  error?: string;
  /** Remplacements gratuits restants après ce remplacement. */
  remaining?: number;
}

/**
 * Remplace une quête quotidienne non terminée par une autre (Notion §9 :
 * « prévoir 1 remplacement gratuit par jour »).
 *
 * Le TIRAGE de la remplaçante est déterministe (`pickReplacementQuest`) et
 * fait ici ; la base vérifie le quota, refuse une quête déjà terminée, et
 * fait l'échange dans une seule transaction — deux clics simultanés ne
 * peuvent donc pas consommer deux remplacements.
 */
export async function rerollQuest(questId: string, periodKey: string): Promise<RerollQuestResult> {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Connecte-toi pour remplacer une quête." };

  const now = new Date();
  if (periodKey !== questPeriodKey("daily", now)) {
    return { ok: false, error: "Seules les quêtes du jour peuvent être remplacées." };
  }

  const service = createSupabaseServiceRoleClient();
  const { data: rows } = await service
    .from("player_quest_progress")
    .select("quest_id")
    .eq("user_id", user.id)
    .eq("period_key", periodKey);
  const { data: quests } = await service.from("quests").select("id, code");
  const codeById = new Map((quests ?? []).map((q) => [q.id, q.code ?? ""]));

  const currentCodes = (rows ?? []).map((row) => codeById.get(row.quest_id) ?? "").filter(Boolean);
  const replacedCode = codeById.get(questId);
  if (!replacedCode) return { ok: false, error: "Quête introuvable." };

  const replacement = pickReplacementQuest(user.id, "daily", periodKey, currentCodes, replacedCode);
  if (!replacement) return { ok: false, error: "Aucune quête de remplacement disponible." };

  const { data, error } = await service.rpc("reroll_player_quest", {
    p_user_id: user.id,
    p_period_key: periodKey,
    p_quest_id: questId,
    p_new_quest_code: replacement.code,
    p_max_rerolls: REROLLS_PER_PERIOD.daily,
  });
  if (error) {
    console.error("[rerollQuest] Remplacement refusé :", error.message);
    return { ok: false, error: "Remplacement impossible pour le moment." };
  }
  if (!data?.ok) return { ok: false, error: data?.error ?? "Remplacement impossible." };

  return { ok: true, remaining: data.remaining };
}

/** Une quête qui a bougé pendant une partie — avant / après, et sa cible. */
export interface QuestRecapEntry {
  code: string;
  name: string;
  category: QuestCategory;
  before: number;
  after: number;
  target: number;
  completed: boolean;
  rewardTides: number;
  rewardXp: number;
  rewardBoosterId: string | null;
}

/**
 * Relevé de quêtes d'une partie terminée, pour l'écran de fin.
 *
 * Lu en base et non recalculé : le relevé est établi une fois, au moment de
 * l'arbitrage (`record_match_quest_progress`), et persisté. Un
 * rafraîchissement de l'écran de fin, ou un joueur qui y revient, retrouve
 * donc exactement le même — un recalcul depuis la progression courante
 * montrerait l'état d'AUJOURD'HUI, pas ce que cette partie a apporté.
 *
 * Retourne une liste vide plutôt que d'échouer : un relevé manquant ne doit
 * jamais empêcher l'écran de fin de s'afficher.
 */
export async function fetchMatchQuestRecap(matchId: string): Promise<QuestRecapEntry[]> {
  try {
    const supabase = createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
      .from("match_quest_progress")
      .select("quest_recap")
      .eq("match_id", matchId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) throw new Error(error.message);

    return (data?.quest_recap ?? []).map((row) => ({
      code: row.code,
      name: row.name,
      category: isQuestCategory(row.category) ? row.category : "parties",
      before: row.before,
      after: row.after,
      target: row.target,
      completed: row.completed,
      rewardTides: row.reward_tides ?? 0,
      rewardXp: row.reward_xp ?? 0,
      rewardBoosterId: row.reward_booster_id,
    }));
  } catch (cause) {
    console.error("[fetchMatchQuestRecap] Lecture impossible :", cause);
    return [];
  }
}

function isQuestCategory(value: string): value is QuestCategory {
  return value in QUEST_CATEGORY_META;
}
