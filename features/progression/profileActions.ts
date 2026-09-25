"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import {
  LOGIN_STREAK_MILESTONE,
  MAX_REWARDED_LEVEL,
  levelRewardsLabel,
  nextMilestones,
  progressionView,
  utcDayKey,
  type ProgressionView,
} from "@/game/progression";
import { ACHIEVEMENT_CATALOG } from "@/game/achievements";
import { DEFAULT_CARD_BACK_ID, STANDARD_BOOSTER_ID } from "@/game";
import { claimLoginReward, readLoginRewards, type LoginRewardView } from "@/features/progression/loginService";
import { readAchievementStats, syncAchievements } from "@/features/achievements/achievementService";
import { equipTitleFor, loadTitles, type EquipTitleResult, type ProfileTitles } from "@/features/progression/titleService";
import { titleForAchievement } from "@/game/titles";
import { equipCardBackFor, loadCardBacks, type CardBackCollection } from "@/features/cosmetics/cardBackService";
import { getSessionUser } from "@/lib/supabase/sessionUser";
import { fetchQuestBoard, type QuestEntry } from "@/features/quests/actions";
import {
  claimAchievementFor,
  claimEverythingFor,
  type ClaimAchievementResult,
  type ClaimEverythingResult,
} from "@/features/progression/rewardCenterService";
import {
  claimLevelRewardFor,
  claimableLevelsFor,
  reachedLevel,
  resolveCardChoiceFor,
  type ClaimLevelRewardResult,
  type PendingCardChoice,
} from "@/features/progression/levelRewardService";

/**
 * Profil joueur — Server Actions exposées au navigateur.
 *
 * Rassemble ce que la spec demande d'afficher (Notion « Progression
 * joueur » §12) : niveau, jauge, XP restante, récompense du prochain
 * niveau, prochains gros paliers, historique des paliers déjà récupérés,
 * état des connexions, exploits. Une seule lecture serveur pour tout
 * l'écran, plutôt qu'une requête par bloc.
 */

export interface ProfileLevelRow {
  level: number;
  label: string;
  /** `true` si ce palier a déjà été crédité (`player_level_rewards`). */
  claimed: boolean;
}

export interface ProfileAchievement {
  code: string;
  name: string;
  description: string;
  rewardTides: number;
  unlocked: boolean;
  /** Débloqué et Tides pas encore réclamées. */
  claimable: boolean;
  /**
   * Avancement vers la condition, d'après les compteurs persistés — `null`
   * si les compteurs n'ont pas pu être lus (la jauge ne s'affiche pas).
   */
  progress: { current: number; target: number } | null;
  /** Titre que cet exploit débloque, s'il y en a un. */
  titleName: string | null;
}

export interface ProfileSummary {
  isSignedIn: boolean;
  displayName: string | null;
  /**
   * Carte servant d'illustration de profil, ou `null`. Toujours une carte
   * POSSÉDÉE : c'est `set_profile_identity` qui le garantit, pas l'écran.
   */
  avatarCardId: string | null;
  /**
   * Cartes que le joueur possède, pour le choix de l'illustration. Les
   * identifiants seuls : le nom et l'image viennent du catalogue côté
   * client, il n'y a rien à transporter de plus.
   */
  ownedCardIds: string[];
  view: ProgressionView;
  balance: number;
  preconTokens: number;
  matchesPlayed: number;
  wins: number;
  /** Série de jours consécutifs joués : la courante, et la meilleure tenue. */
  playStreak: { current: number; best: number };
  /** Récompense du niveau suivant, en toutes lettres. */
  nextLevelReward: string;
  /** Prochains gros paliers (niveau + libellé). */
  upcomingMilestones: ProfileLevelRow[];
  /** Derniers paliers déjà récupérés, du plus récent au plus ancien. */
  claimedLevels: ProfileLevelRow[];
  /** TOUS les niveaux dont la récompense a été créditée — la frise des récompenses les coche un à un. */
  claimedLevelNumbers: number[];
  /** Paliers atteints et PAS encore réclamés — ce que l'interface doit faire briller. */
  claimableLevels: number[];
  /** « Cartes au choix » ouvertes et pas encore tranchées. */
  pendingCardChoices: PendingCardChoice[];
  /** Quêtes du jour et de la semaine — elles se consultent et se réclament aussi au profil. */
  quests: QuestEntry[];
  /** Cycle de connexion : étape à réclamer, escales de la semaine, disponibilité du jour et série. */
  login: LoginRewardView;
  achievements: ProfileAchievement[];
  /**
   * Dos de carte débloqués et celui équipé. Seule famille de cosmétiques
   * rendue pour l'instant — les autres sont stockées mais pas encore
   * portées par le jeu.
   */
  cardBacks: CardBackCollection;
  /** Titres : le catalogue vu par ce joueur et celui qu'il porte. */
  titles: ProfileTitles;
  /** `true` si le niveau maximum récompensé de cette version est atteint. */
  maxRewardedLevelReached: boolean;
}

const SIGNED_OUT: ProfileSummary = {
  isSignedIn: false,
  displayName: null,
  avatarCardId: null,
  ownedCardIds: [],
  view: progressionView(0),
  balance: 0,
  preconTokens: 0,
  matchesPlayed: 0,
  wins: 0,
  playStreak: { current: 0, best: 0 },
  nextLevelReward: "—",
  upcomingMilestones: [],
  claimedLevels: [],
  claimedLevelNumbers: [],
  claimableLevels: [],
  pendingCardChoices: [],
  quests: [],
  login: {
    step: 1,
    items: [],
    cycle: [],
    weekBoosterId: STANDARD_BOOSTER_ID,
    claimable: false,
    totalClaims: 0,
    streak: 0,
    bestStreak: 0,
    daysToStreakBonus: LOGIN_STREAK_MILESTONE,
  },
  achievements: [],
  cardBacks: { options: [], equipped: DEFAULT_CARD_BACK_ID },
  titles: { options: [], equipped: null, available: false },
  maxRewardedLevelReached: false,
};

/**
 * Exploits débloqués, et lesquels attendent d'être réclamés. Sans la colonne
 * `claimed_at` (migration pas encore passée), tout est considéré réclamé :
 * c'était le comportement d'avant, où l'exploit créditait tout seul.
 */
async function readAchievementRows(userId: string): Promise<Array<{ code: string; claimable: boolean }>> {
  const service = createSupabaseServiceRoleClient();
  const full = await service.from("player_achievements").select("code, claimed_at").eq("user_id", userId);
  if (!full.error) return (full.data ?? []).map((row) => ({ code: row.code, claimable: row.claimed_at === null }));
  const basic = await service.from("player_achievements").select("code").eq("user_id", userId);
  return (basic.data ?? []).map((row) => ({ code: row.code, claimable: false }));
}

/** `true` si une série dont le dernier jour compté est `day` court toujours. */
function isStreakAlive(day: string | null): boolean {
  if (!day) return false;
  const today = utcDayKey();
  const yesterday = utcDayKey(new Date(Date.now() - 86_400_000));
  return day === today || day === yesterday;
}

export async function fetchProfile(): Promise<ProfileSummary> {
  try {
    const user = await getSessionUser();
    if (!user) return SIGNED_OUT;

    // Rattrape les exploits dus mais pas encore octroyés : le profil est
    // l'endroit naturel pour ça, et l'opération est idempotente.
    // Les compteurs sont lus UNE fois : ils servent à l'octroi et aux jauges.
    const stats = await readAchievementStats(user.id);
    await syncAchievements(user.id, stats);

    const service = createSupabaseServiceRoleClient();
    const [progression, currency, profile, claimed, unlocked, login, cardBacks, ownedCards, choices, questBoard] = await Promise.all([
      service.from("player_progression").select("xp_total, level, matches_played, pvp_wins, precon_tokens, play_streak, best_play_streak, play_streak_day").eq("user_id", user.id).maybeSingle(),
      service.from("player_currency").select("balance").eq("user_id", user.id).maybeSingle(),
      service.from("profiles").select("display_name, avatar_card_id").eq("id", user.id).maybeSingle(),
      service.from("player_level_rewards").select("level").eq("user_id", user.id).order("level", { ascending: false }),
      readAchievementRows(user.id),
      readLoginRewards(user.id),
      loadCardBacks(user.id),
      // `quantity > 0` : une carte entièrement revendue laisse une ligne à
      // zéro, elle ne doit plus être proposée comme illustration.
      service.from("player_cards").select("card_id").eq("user_id", user.id).gt("quantity", 0),
      service.from("player_card_choices").select("id, source, source_ref, rarity, offered_card_ids").eq("user_id", user.id).is("resolved_at", null),
      fetchQuestBoard().catch(() => null),
    ]);

    const view = progressionView(progression.data?.xp_total ?? 0);
    const unlockedCodes = new Set(unlocked.map((row) => row.code));
    const claimableCodes = new Set(unlocked.filter((row) => row.claimable).map((row) => row.code));
    // Le déblocage des titres se lit dans les exploits EN BASE, pas dans les compteurs.
    const titles = await loadTitles(user.id, unlockedCodes);

    return {
      isSignedIn: true,
      displayName: profile.data?.display_name ?? user.email ?? null,
      avatarCardId: profile.data?.avatar_card_id ?? null,
      ownedCardIds: (ownedCards.data ?? []).map((row) => row.card_id),
      view,
      balance: currency.data?.balance ?? 0,
      preconTokens: progression.data?.precon_tokens ?? 0,
      matchesPlayed: progression.data?.matches_played ?? 0,
      wins: progression.data?.pvp_wins ?? 0,
      // Une série ne se met à jour qu'en jouant : affichée telle quelle, une
      // série vieille de trois jours se lirait « 5 jours d'affilée » alors
      // qu'elle est morte. On la considère vivante seulement si le dernier
      // jour compté est aujourd'hui ou hier — c'est exactement la fenêtre
      // dans laquelle une partie la prolongerait.
      playStreak: {
        current: isStreakAlive(progression.data?.play_streak_day ?? null) ? (progression.data?.play_streak ?? 0) : 0,
        best: progression.data?.best_play_streak ?? 0,
      },
      nextLevelReward: view.level >= MAX_REWARDED_LEVEL ? "—" : levelRewardsLabel(view.level + 1),
      upcomingMilestones: nextMilestones(view.level, 3).map((level) => ({ level, label: levelRewardsLabel(level), claimed: false })),
      claimedLevelNumbers: (claimed.data ?? []).map((row) => row.level),
      claimableLevels: claimableLevelsFor(
        reachedLevel(progression.data?.xp_total ?? 0, progression.data?.level ?? 1),
        (claimed.data ?? []).map((row) => row.level)
      ),
      pendingCardChoices: (choices.data ?? []).map((row) => ({
        id: row.id,
        level: row.source === "level" && /^d+$/.test(row.source_ref) ? Number(row.source_ref) : null,
        rarity: row.rarity,
        offeredCardIds: row.offered_card_ids,
      })),
      claimedLevels: (claimed.data ?? []).slice(0, 8).map((row) => ({ level: row.level, label: levelRewardsLabel(row.level), claimed: true })),
      login,
      achievements: ACHIEVEMENT_CATALOG.map((achievement) => ({
        code: achievement.code,
        name: achievement.name,
        description: achievement.description,
        rewardTides: achievement.rewardTides,
        unlocked: unlockedCodes.has(achievement.code),
        claimable: claimableCodes.has(achievement.code),
        progress: stats ? achievement.progress(stats) : null,
        titleName: titleForAchievement(achievement.code)?.name ?? null,
      })),
      quests: questBoard?.isSignedIn ? [...questBoard.daily, ...questBoard.weekly] : [],
      cardBacks,
      titles,
      maxRewardedLevelReached: view.level >= MAX_REWARDED_LEVEL,
    };
  } catch (error) {
    console.error("[fetchProfile] Lecture impossible :", error);
    return SIGNED_OUT;
  }
}

export interface ClaimLoginActionResult {
  ok: boolean;
  error?: string;
  tides?: number;
  xp?: number;
  boosterId?: string | null;
  /** Carte aléatoire de l'escale. */
  cardId?: string | null;
  /** Série après la réclamation. */
  streak?: number;
  /** Carte Abyssale du palier de série. */
  streakCardId?: string | null;
}

/** Réclame la récompense de connexion du jour (§8). Une par jour UTC, jamais de remise à zéro. */
export async function claimDailyLogin(): Promise<ClaimLoginActionResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Connecte-toi pour réclamer ta récompense." };

  const result = await claimLoginReward(user.id);
  if (result.ok) {
    revalidatePath("/profil");
    revalidatePath("/");
  }
  return {
    ok: result.ok,
    error: result.error,
    tides: result.tides,
    xp: result.xp,
    boosterId: result.boosterId ?? null,
    cardId: result.cardId ?? null,
    streak: result.streak,
    streakCardId: result.streakCardId ?? null,
  };
}

export interface EquipCardBackActionResult {
  ok: boolean;
  error?: string;
  /** Identifiant réellement équipé — le client aligne son miroir dessus. */
  equipped?: string;
}

/**
 * Équipe un dos de carte. Le joueur vient TOUJOURS de la session : un
 * identifiant de joueur en paramètre ferait de cette action un moyen
 * d'équiper le cosmétique de quelqu'un d'autre.
 */
export async function equipCardBack(cardBackId: string): Promise<EquipCardBackActionResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Connecte-toi pour changer de dos de carte." };

  const result = await equipCardBackFor(user.id, cardBackId);
  if (result.ok) {
    revalidatePath("/profil");
    revalidatePath("/collectables");
  }
  return result;
}

export type EquipTitleActionResult = EquipTitleResult;

/**
 * Porte un titre (`null` : n'en porter aucun). Le joueur vient de sa
 * SESSION ; le déblocage est vérifié côté serveur (`equipTitleFor`, puis
 * `set_player_title` en base) — le navigateur ne peut pas s'attribuer un
 * titre qu'il n'a pas gagné.
 */
export async function equipTitle(titleId: string | null): Promise<EquipTitleActionResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Connecte-toi pour choisir un titre." };
  const result = await equipTitleFor(user.id, titleId);
  if (result.ok) revalidatePath("/profil");
  return result;
}

export interface UpdateIdentityActionResult {
  ok: boolean;
  error?: string;
}

export interface UpdateIdentityInput {
  /** Nouveau pseudo, ou `undefined` pour n'y pas toucher. */
  displayName?: string;
  /**
   * Nouvelle illustration : un `card_id` pour en choisir une, `null` pour
   * retirer celle en place, `undefined` pour n'y pas toucher. Les trois cas
   * sont distincts, et c'est voulu — sans ça, retirer son illustration et
   * ne pas la changer se confondraient.
   */
  avatarCardId?: string | null;
}

/**
 * Change le pseudo et/ou l'illustration de profil.
 *
 * Le joueur vient de sa SESSION. Rien n'est validé ici qui ne le soit aussi
 * en base : `set_profile_identity` rogne le pseudo, contrôle sa longueur et
 * vérifie que l'illustration demandée est une carte POSSÉDÉE — un
 * navigateur qui appellerait l'action avec n'importe quel `card_id`
 * n'obtiendrait rien.
 */
export async function updateProfileIdentity({ displayName, avatarCardId }: UpdateIdentityInput): Promise<UpdateIdentityActionResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Connecte-toi pour modifier ton profil." };

  try {
    const { data, error } = await createSupabaseServiceRoleClient().rpc("set_profile_identity", {
      p_user_id: user.id,
      p_display_name: displayName ?? null,
      p_avatar_card_id: avatarCardId ?? null,
      p_clear_avatar: avatarCardId === null,
    });
    if (error) {
      console.error("[updateProfileIdentity] Écriture refusée :", error.message);
      return { ok: false, error: "Modification impossible pour l'instant — réessaie dans un instant." };
    }
    if (!data?.ok) return { ok: false, error: data?.error ?? "Modification impossible." };

    // Le pseudo s'affiche dans le bandeau de TOUS les écrans, pas seulement
    // au profil : la racine est revalidée avec lui.
    revalidatePath("/profil");
    revalidatePath("/");
    return { ok: true };
  } catch (cause) {
    console.error("[updateProfileIdentity] Échec inattendu :", cause);
    return { ok: false, error: "Modification impossible pour l'instant — réessaie dans un instant." };
  }
}

export type { ClaimLevelRewardResult, PendingCardChoice };

/** Réclame un palier de niveau atteint. Le joueur vient de sa session ; le contenu, de la table du serveur. */
export async function claimLevelReward(level: number): Promise<ClaimLevelRewardResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Connecte-toi pour réclamer tes récompenses." };
  const result = await claimLevelRewardFor(user.id, level);
  if (result.ok) {
    revalidatePath("/profil");
    revalidatePath("/boosters");
    revalidatePath("/collectables");
  }
  return result;
}

export interface ClaimAllLevelRewardsResult {
  ok: boolean;
  error?: string;
  claimed: ClaimLevelRewardResult[];
}

/** Réclame d'un coup tous les paliers en attente, dans l'ordre. S'arrête au premier refus. */
export async function claimAllLevelRewards(): Promise<ClaimAllLevelRewardsResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Connecte-toi pour réclamer tes récompenses.", claimed: [] };

  const service = createSupabaseServiceRoleClient();
  const [progression, claimedRows] = await Promise.all([
    service.from("player_progression").select("xp_total, level").eq("user_id", user.id).maybeSingle(),
    service.from("player_level_rewards").select("level").eq("user_id", user.id),
  ]);
  const levels = claimableLevelsFor(
    reachedLevel(progression.data?.xp_total ?? 0, progression.data?.level ?? 1),
    (claimedRows.data ?? []).map((row) => row.level)
  );

  const claimed: ClaimLevelRewardResult[] = [];
  for (const level of levels) {
    const result = await claimLevelRewardFor(user.id, level);
    if (!result.ok) {
      if (claimed.length > 0) revalidatePath("/profil");
      return { ok: false, error: result.error, claimed };
    }
    claimed.push(result);
  }
  revalidatePath("/profil");
  revalidatePath("/boosters");
  revalidatePath("/collectables");
  return { ok: true, claimed };
}

/** Tranche une « carte au choix » : la carte doit faire partie des propositions figées en base. */
export async function chooseRewardCard(choiceId: string, cardId: string): Promise<{ ok: boolean; error?: string }> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Connecte-toi pour choisir ta carte." };
  const result = await resolveCardChoiceFor(user.id, choiceId, cardId);
  if (result.ok) {
    revalidatePath("/profil");
    revalidatePath("/collection");
  }
  return result;
}

export type { ClaimAchievementResult, ClaimEverythingResult };

/** Réclame les Tides d'un exploit débloqué. */
export async function claimAchievement(code: string): Promise<ClaimAchievementResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Connecte-toi pour réclamer tes récompenses." };
  const result = await claimAchievementFor(user.id, code);
  if (result.ok) revalidatePath("/profil");
  return result;
}

/** Réclame TOUT ce qui attend : paliers, quêtes terminées, exploits. */
export async function claimEverything(): Promise<ClaimEverythingResult> {
  const user = await getSessionUser();
  if (!user) {
    return { ok: false, error: "Connecte-toi pour réclamer tes récompenses.", levels: [], quests: { count: 0, tides: 0, xp: 0, boosterIds: [] }, achievements: { count: 0, tides: 0 } };
  }
  const result = await claimEverythingFor(user.id);
  revalidatePath("/profil");
  revalidatePath("/boosters");
  revalidatePath("/collectables");
  return result;
}
