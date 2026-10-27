"use server";

import { revalidatePath } from "next/cache";
import { readStyledUnlockedCardIds } from "@/lib/supabase/cardEditions";
import { isChosenArtwork, shownChosenArtwork, type ChosenArtwork } from "@/game/cosmetics/artworks";
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
import { maskAchievement } from "@/features/progression/achievementMask";
import { DEFAULT_CARD_BACK_ID, STANDARD_BOOSTER_ID } from "@/game";
import { claimLoginReward, readLoginRewards, type LoginRewardView } from "@/features/progression/loginService";
import {
  claimAllMasteryRewards,
  claimAudienceMilestone,
  claimMasteryReward,
  type ClaimAllMasteriesResult,
  claimSponsorGift,
  claimWeeklyChest,
  readProgressionHub,
  type HubClaimResult,
  type ProgressionHubView,
} from "@/features/progression/hubService";
import type { SponsorId, SponsorStage } from "@/game/progression";
import { readAchievementStats, syncAchievements } from "@/features/achievements/achievementService";
import type { PlayerStatsInput } from "@/features/progression/playerStatsSheet";
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
import { repairCardChoices } from "@/features/progression/cardChoices";

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
  /** Code de l'exploit — opaque (`cache-N`) pour un exploit masqué, qui ne doit rien trahir. */
  code: string;
  /** Famille sous laquelle le tableau le range (`ACHIEVEMENT_FAMILIES`). */
  family: string;
  name: string;
  description: string;
  rewardTides: number;
  /**
   * Exploit CACHÉ et pas encore obtenu : nom, condition, jauge, récompense
   * et titre sont retirés ICI, côté serveur — le navigateur n'en reçoit
   * rien (`maskAchievement`). Obtenu, il se révèle entièrement.
   */
  masked: boolean;
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
  /** Illustration de l'avatar : Classique, ou Styled si le joueur l'a débloquée. */
  avatarArtwork: ChosenArtwork;
  /** Cartes dont la Styled est débloquée (Styled ou Full-Art obtenue) : proposées en plus au choix. */
  styledCardIds: string[];
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
  /** Coffre hebdomadaire, Maîtrises, Commanditaires (hub des récompenses). `null` hors connexion. */
  hub: ProgressionHubView | null;
  /** Compteurs de l'onglet Statistiques — ceux déjà lus pour les exploits. `null` si la lecture a échoué. */
  playerStats: PlayerStatsInput | null;
}

const SIGNED_OUT: ProfileSummary = {
  isSignedIn: false,
  displayName: null,
  avatarCardId: null,
  avatarArtwork: "classique",
  styledCardIds: [],
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
  hub: null,
  playerStats: null,
};

/**
 * Exploits débloqués, et lesquels attendent d'être réclamés. Sans la colonne
 * `claimed_at` (migration pas encore passée), tout est considéré réclamé :
 * c'était le comportement d'avant, où l'exploit créditait tout seul.
 */
async function readAchievementRows(userId: string): Promise<{ rows: Array<{ code: string; claimable: boolean }>; claimTracked: boolean }> {
  const service = createSupabaseServiceRoleClient();
  const full = await service.from("player_achievements").select("code, claimed_at").eq("user_id", userId);
  if (!full.error) return { rows: (full.data ?? []).map((row) => ({ code: row.code, claimable: row.claimed_at === null })), claimTracked: true };
  const basic = await service.from("player_achievements").select("code").eq("user_id", userId);
  return { rows: (basic.data ?? []).map((row) => ({ code: row.code, claimable: false })), claimTracked: false };
}

/**
 * Exploits en base APRÈS l'octroi, sans les relire : ceux lus avant, plus
 * ceux que `grant_achievements` vient RÉELLEMENT d'ajouter (il ne rend que
 * ceux-là, insérés avec `claimed_at` nul — donc à réclamer). Même résultat
 * qu'une relecture, un aller-retour de moins.
 */
function withGranted(
  stored: { rows: Array<{ code: string; claimable: boolean }>; claimTracked: boolean },
  granted: readonly string[]
): Array<{ code: string; claimable: boolean }> {
  const known = new Set(stored.rows.map((row) => row.code));
  const added = granted.filter((code) => !known.has(code)).map((code) => ({ code, claimable: stored.claimTracked }));
  return [...stored.rows, ...added];
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
    //
    // UN SEUL étage d'attente : tout part en même temps, et seules les
    // vraies dépendances s'enchaînent, chacune sur sa branche —
    //   compteurs → octroi des exploits (`grant_achievements` n'écrit que
    //     `player_achievements` : rien d'autre à lire ne l'attend) ;
    //   exploits en base + octroi → titres (le déblocage se lit dans les
    //     exploits EN BASE, pas dans les compteurs) ;
    //   progression → niveau → vue du hub (ses lectures, elles, n'attendent pas) ;
    //   choix de carte → réparation.
    const service = createSupabaseServiceRoleClient();
    const statsPromise = readAchievementStats(user.id);
    const grantedPromise = statsPromise.then((stats) => syncAchievements(user.id, stats));
    const unlockedPromise = Promise.all([readAchievementRows(user.id), grantedPromise]).then(([stored, granted]) => withGranted(stored, granted));
    const progressionPromise = Promise.resolve(
      service.from("player_progression").select("xp_total, level, matches_played, pvp_wins, precon_tokens, play_streak, best_play_streak, play_streak_day").eq("user_id", user.id).maybeSingle()
    );
    // Illustration Styled de l'avatar : lue À PART (migration `20261110120000`
    // appliquée à la main — sans elle, la colonne manque et l'avatar reste Classique).
    const avatarArtworkPromise = Promise.resolve(service.from("profiles").select("avatar_artwork").eq("id", user.id).maybeSingle());
    const styledPromise = readStyledUnlockedCardIds(user.id, service).catch(() => [] as string[]);
    const levelPromise = progressionPromise.then((row) => progressionView(row.data?.xp_total ?? 0).level);
    const [stats, progression, currency, profile, claimed, unlocked, login, cardBacks, ownedCards, choices, questBoard, titles, hub, , avatarArtworkRow, styledCardIds] = await Promise.all([
      statsPromise,
      progressionPromise,
      service.from("player_currency").select("balance").eq("user_id", user.id).maybeSingle(),
      service.from("profiles").select("display_name, avatar_card_id").eq("id", user.id).maybeSingle(),
      service.from("player_level_rewards").select("level").eq("user_id", user.id).order("level", { ascending: false }),
      unlockedPromise,
      readLoginRewards(user.id),
      loadCardBacks(user.id),
      // `quantity > 0` : une carte entièrement revendue laisse une ligne à
      // zéro, elle ne doit plus être proposée comme illustration.
      service.from("player_cards").select("card_id").eq("user_id", user.id).gt("quantity", 0),
      Promise.resolve(
        service.from("player_card_choices").select("id, source, source_ref, rarity, offered_card_ids").eq("user_id", user.id).is("resolved_at", null)
      ).then((rows) => repairCardChoices(user.id, rows.data ?? [])),
      fetchQuestBoard().catch(() => null),
      loadTitles(user.id, unlockedPromise.then((rows) => new Set(rows.map((row) => row.code))), levelPromise),
      readProgressionHub(user.id, levelPromise),
      // L'octroi n'a rien à rendre à l'écran (il est déjà dans `unlocked`) :
      // attendu ici seulement pour qu'il soit terminé avant de répondre.
      grantedPromise,
      avatarArtworkPromise,
      styledPromise,
    ]);

    const view = progressionView(progression.data?.xp_total ?? 0);
    const unlockedCodes = new Set(unlocked.map((row) => row.code));
    const claimableCodes = new Set(unlocked.filter((row) => row.claimable).map((row) => row.code));

    return {
      isSignedIn: true,
      displayName: profile.data?.display_name ?? user.email ?? null,
      avatarCardId: profile.data?.avatar_card_id ?? null,
      avatarArtwork: profile.data?.avatar_card_id
        ? shownChosenArtwork(profile.data.avatar_card_id, avatarArtworkRow.error ? null : avatarArtworkRow.data?.avatar_artwork, new Set(styledCardIds))
        : "classique",
      styledCardIds,
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
      pendingCardChoices: choices.map((row) => ({
        id: row.id,
        level: row.source === "level" && /^\d+$/.test(row.source_ref) ? Number(row.source_ref) : null,
        rarity: row.rarity,
        offeredCardIds: row.offered_card_ids,
      })),
      claimedLevels: (claimed.data ?? []).slice(0, 8).map((row) => ({ level: row.level, label: levelRewardsLabel(row.level), claimed: true })),
      login,
      achievements: ACHIEVEMENT_CATALOG.map((achievement, index) =>
        maskAchievement(
          {
            code: achievement.code,
            family: achievement.family,
            name: achievement.name,
            description: achievement.description,
            rewardTides: achievement.rewardTides,
            masked: false,
            unlocked: unlockedCodes.has(achievement.code),
            claimable: claimableCodes.has(achievement.code),
            progress: stats ? achievement.progress(stats) : null,
            titleName: titleForAchievement(achievement.code)?.name ?? null,
          },
          achievement.hidden === true,
          index
        )
      ),
      quests: questBoard?.isSignedIn ? [...questBoard.daily, ...questBoard.weekly] : [],
      cardBacks,
      titles,
      maxRewardedLevelReached: view.level >= MAX_REWARDED_LEVEL,
      hub,
      playerStats: stats
        ? {
            matchesPlayed: stats.matchesPlayed,
            wins: stats.wins,
            losses: stats.losses,
            level: stats.level,
            distinctCardsOwned: stats.distinctCardsOwned,
            boostersOpened: stats.boostersOpened,
            lifetime: stats.lifetime,
            records: stats.records,
          }
        : null,
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

/**
 * L'escale du jour et la série, pour le popup de première connexion de la
 * journée (`DailyStreakPopup`). `null` hors connexion.
 */
export async function fetchDailyLogin(): Promise<LoginRewardView | null> {
  const user = await getSessionUser();
  if (!user) return null;
  return readLoginRewards(user.id);
}

/** Niveau de compte du joueur connecté — les réclamations du hub en dépendent (Commanditaires). */
async function accountLevelOf(userId: string): Promise<number> {
  const service = createSupabaseServiceRoleClient();
  const { data } = await service.from("player_progression").select("xp_total").eq("user_id", userId).maybeSingle();
  return progressionView(data?.xp_total ?? 0).level;
}

/** Ouvre le coffre hebdomadaire (10 parties dans la semaine). */
export async function openWeeklyChest(): Promise<HubClaimResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Connecte-toi pour ouvrir le coffre." };
  const result = await claimWeeklyChest(user.id, await accountLevelOf(user.id));
  if (result.ok) revalidatePath("/profil");
  return result;
}

/** Réclame un palier de Maîtrise d'un Navire. */
export async function claimMasteryLevel(shipId: string, level: number): Promise<HubClaimResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Connecte-toi pour réclamer." };
  const result = await claimMasteryReward(user.id, await accountLevelOf(user.id), shipId, level);
  if (result.ok) revalidatePath("/profil");
  return result;
}

/** Réclame d'un coup les paliers de Maîtrise en attente : tous Navires confondus, ou ceux d'un seul (`shipId`). */
export async function claimAllMasteryLevels(shipId?: string): Promise<ClaimAllMasteriesResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Connecte-toi pour réclamer.", items: [], count: 0 };
  if (shipId !== undefined && typeof shipId !== "string") return { ok: false, error: "Navire inconnu.", items: [], count: 0 };
  const result = await claimAllMasteryRewards(user.id, await accountLevelOf(user.id), shipId);
  if (result.count > 0) {
    revalidatePath("/profil");
    revalidatePath("/boosters");
  }
  return result;
}

/** Ouvre le colis d'un Commanditaire. */
export async function openSponsorGift(sponsorId: SponsorId, stage: SponsorStage): Promise<HubClaimResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Connecte-toi pour ouvrir le colis." };
  const result = await claimSponsorGift(user.id, await accountLevelOf(user.id), sponsorId, stage);
  if (result.ok) revalidatePath("/profil");
  return result;
}

/** Ouvre un palier d'audience franchi par le record (`game/audience/milestones.ts`). */
export async function claimAudienceMilestoneReward(threshold: number): Promise<HubClaimResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Connecte-toi pour réclamer." };
  const result = await claimAudienceMilestone(user.id, await accountLevelOf(user.id), threshold);
  if (result.ok) revalidatePath("/profil");
  return result;
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
  /** Illustration de l'avatar choisi : Styled seulement si elle est débloquée (revérifié ici). */
  avatarArtwork?: ChosenArtwork;
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
/**
 * Écrit `profiles.avatar_artwork`. Une Styled non débloquée retombe sur la
 * Classique ; colonne absente (migration pas passée) : rien, on le journalise.
 * Module `"use server"` : fonction NON exportée, joignable du seul serveur.
 */
async function writeAvatarArtwork(userId: string, cardId: string | null, wanted: unknown): Promise<void> {
  const service = createSupabaseServiceRoleClient();
  let artwork: ChosenArtwork = "classique";
  if (cardId && isChosenArtwork(wanted) && wanted === "styled") {
    const unlocked = await readStyledUnlockedCardIds(userId, service).catch(() => [] as string[]);
    if (unlocked.includes(cardId)) artwork = "styled";
  }
  const { error } = await service.from("profiles").update({ avatar_artwork: artwork }).eq("id", userId);
  if (error) console.warn("[updateProfileIdentity] Illustration de l'avatar non enregistrée (migration 20261110120000 appliquée ?) :", error.message);
}

export async function updateProfileIdentity({ displayName, avatarCardId, avatarArtwork }: UpdateIdentityInput): Promise<UpdateIdentityActionResult> {
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

    // L'illustration de l'avatar suit sa carte : Styled seulement si le
    // joueur l'a débloquée, Classique sinon (et à chaque retrait).
    if (avatarCardId !== undefined) await writeAvatarArtwork(user.id, avatarCardId, avatarArtwork);

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
    return { ok: false, error: "Connecte-toi pour réclamer tes récompenses.", levels: [], quests: { count: 0, tides: 0, xp: 0, boosterIds: [] }, achievements: { count: 0, tides: 0 }, masteries: { count: 0, items: [] }, hub: { count: 0, items: [] } };
  }
  const result = await claimEverythingFor(user.id);
  revalidatePath("/profil");
  revalidatePath("/boosters");
  revalidatePath("/collectables");
  return result;
}
