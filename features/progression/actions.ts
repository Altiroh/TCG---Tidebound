"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SPONSORS, progressionView, sponsorRevealed, utcDayKey, type ProgressionView } from "@/game/progression";
import { claimableLevelsFor, reachedLevel } from "@/features/progression/levelRewardService";
import { getSessionUser } from "@/lib/supabase/sessionUser";

/**
 * Progression joueur — LECTURES uniquement.
 *
 * Tout ce fichier est exposé au navigateur (directive `"use server"`) : il
 * ne doit contenir aucune fonction qui écrit ou qui prend un identifiant de
 * joueur en paramètre. L'octroi vit dans `features/progression/rewards.ts`,
 * joignable par le seul code serveur.
 */

export interface ProgressionSummary {
  isSignedIn: boolean;
  view: ProgressionView;
  /** Solde de Tides, affiché à côté du niveau. */
  balance: number;
  /** Jetons de Préconstruit — la seconde monnaie du bandeau. */
  preconTokens: number;
  matchesPlayed: number;
  pvpWins: number;
  /** Pseudo affiché à côté du niveau (`profiles.display_name`), repli sur l'e-mail. `null` hors connexion. */
  displayName: string | null;
  /** Carte choisie comme illustration de profil (`profiles.avatar_card_id`) — l'avatar du bandeau. */
  avatarCardId: string | null;
  /**
   * Quêtes terminées mais pas encore réclamées — la pastille du bandeau.
   *
   * Lue ici plutôt que par une seconde requête : le bandeau lit déjà la
   * progression à chaque écran, et un compteur d'attention qui arriverait
   * après coup ferait sauter la mise en page.
   */
  claimableQuests: number;
  /**
   * Récompenses qui ATTENDENT le joueur au profil : paliers de niveau à
   * réclamer, cartes au choix à trancher, escale de connexion du jour. La
   * pastille de l'avatar — ce qui donne envie d'y aller.
   */
  claimableRewards: number;
  /**
   * Le détail de `claimableRewards`, par endroit où le réclamer : les
   * raccourcis flottants sous le bandeau en font une icône chacun.
   */
  claimableBreakdown: { levels: number; cardChoices: number; login: number; quests: number; achievements: number };
  /** L'escale de connexion du jour n'est pas encore réclamée : première venue de la journée (popup de série). */
  loginClaimable: boolean;
  /** Spectateurs qui suivent le joueur (moteur d'audience, `game/audience/`). Visible en haut à droite. */
  audience: number;
  /** Spectacle de la dernière partie (0 à 100), `null` avant la première. */
  lastSpectacle: number | null;
  /** Mécènes qui ont commencé à l'observer, et ceux qui se sont fait connaître — pour la notification. */
  sponsorsWatching: number;
  sponsorsRevealed: number;
}

/** Mécènes du catalogue actuel — une ligne d'un mécène retiré ne compte plus. */
const KNOWN_SPONSORS: ReadonlySet<string> = new Set(SPONSORS.map((sponsor) => sponsor.id));

const SIGNED_OUT: ProgressionSummary = {
  isSignedIn: false,
  view: progressionView(0),
  balance: 0,
  preconTokens: 0,
  matchesPlayed: 0,
  pvpWins: 0,
  displayName: null,
  avatarCardId: null,
  claimableQuests: 0,
  claimableRewards: 0,
  claimableBreakdown: { levels: 0, cardChoices: 0, login: 0, quests: 0, achievements: 0 },
  loginClaimable: false,
  audience: 0,
  lastSpectacle: null,
  sponsorsWatching: 0,
  sponsorsRevealed: 0,
};

/**
 * Pseudo et illustration du profil. L'illustration est une colonne plus
 * récente que le pseudo : si elle manque en base (migration pas encore
 * passée), le pseudo doit continuer de s'afficher — d'où le repli.
 */
async function readProfileHeader(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  userId: string
): Promise<{ displayName: string | null; avatarCardId: string | null }> {
  const full = await supabase.from("profiles").select("display_name, avatar_card_id").eq("id", userId).maybeSingle();
  if (!full.error) return { displayName: full.data?.display_name ?? null, avatarCardId: full.data?.avatar_card_id ?? null };
  const basic = await supabase.from("profiles").select("display_name").eq("id", userId).maybeSingle();
  return { displayName: basic.data?.display_name ?? null, avatarCardId: null };
}

/**
 * Progression du joueur connecté, pour affichage. Ne fait jamais planter la
 * page appelante : une config Supabase absente dégrade vers "non connecté",
 * comme le reste des lectures de l'app.
 */
export async function fetchProgression(): Promise<ProgressionSummary> {
  try {
    const supabase = createSupabaseServerClient();
    const user = await getSessionUser();
    if (!user) return SIGNED_OUT;

    const [progression, currency, profile, claimable, levelRewards, cardChoices, login, achievements, audience, sponsors] = await Promise.all([
      supabase.from("player_progression").select("*").eq("user_id", user.id).maybeSingle(),
      supabase.from("player_currency").select("balance").eq("user_id", user.id).maybeSingle(),
      readProfileHeader(supabase, user.id),
      // Terminées et pas encore réclamées : `head` + `count`, on ne veut
      // que le nombre.
      supabase
        .from("player_quest_progress")
        .select("quest_id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .not("completed_at", "is", null)
        .is("claimed_at", null),
      supabase.from("player_level_rewards").select("level").eq("user_id", user.id),
      supabase.from("player_card_choices").select("id", { count: "exact", head: true }).eq("user_id", user.id).is("resolved_at", null),
      supabase.from("player_login_rewards").select("last_claimed_day").eq("user_id", user.id).maybeSingle(),
      supabase.from("player_achievements").select("code", { count: "exact", head: true }).eq("user_id", user.id).is("claimed_at", null),
      // Tables récentes : absentes (migration pas encore passée), elles valent zéro.
      supabase.from("player_audience").select("audience, last_spectacle").eq("user_id", user.id).maybeSingle(),
      supabase.from("player_sponsor_interest").select("sponsor_id, points").eq("user_id", user.id),
    ]);
    // Le niveau ATTEINT, pas celui de la colonne : elle n'est rafraîchie
    // qu'en fin de partie, et la pastille doit s'allumer dès que l'XP d'une
    // quête fait franchir un palier (cf. `reachedLevel`).
    const reached = reachedLevel(progression.data?.xp_total ?? 0, progression.data?.level ?? 1);
    const levelsToClaim = claimableLevelsFor(reached, (levelRewards.data ?? []).map((row) => row.level)).length;
    const loginToClaim = login.error ? 0 : login.data?.last_claimed_day === utcDayKey() ? 0 : 1;

    return {
      isSignedIn: true,
      view: progressionView(progression.data?.xp_total ?? 0),
      balance: currency.data?.balance ?? 0,
      preconTokens: progression.data?.precon_tokens ?? 0,
      matchesPlayed: progression.data?.matches_played ?? 0,
      pvpWins: progression.data?.pvp_wins ?? 0,
      // Repli sur l'e-mail comme le menu principal : mieux vaut un identifiant
      // qu'un vide à côté du niveau.
      displayName: profile.displayName ?? user.email ?? null,
      avatarCardId: profile.avatarCardId,
      claimableQuests: claimable.count ?? 0,
      // Tout ce qui se réclame au profil — quêtes comprises, elles y ont leur onglet.
      claimableRewards: levelsToClaim + (cardChoices.count ?? 0) + loginToClaim + (claimable.count ?? 0) + (achievements.error ? 0 : (achievements.count ?? 0)),
      claimableBreakdown: {
        levels: levelsToClaim,
        cardChoices: cardChoices.count ?? 0,
        login: loginToClaim,
        quests: claimable.count ?? 0,
        achievements: achievements.error ? 0 : (achievements.count ?? 0),
      },
      loginClaimable: loginToClaim === 1,
      audience: audience.error ? 0 : (audience.data?.audience ?? 0),
      lastSpectacle: audience.error ? null : (audience.data?.last_spectacle ?? null),
      sponsorsWatching: sponsors.error ? 0 : (sponsors.data ?? []).filter((row) => KNOWN_SPONSORS.has(row.sponsor_id) && row.points > 0).length,
      sponsorsRevealed: sponsors.error ? 0 : (sponsors.data ?? []).filter((row) => KNOWN_SPONSORS.has(row.sponsor_id) && sponsorRevealed(row.points)).length,
    };
  } catch (error) {
    console.error("[fetchProgression] Lecture impossible :", error);
    return SIGNED_OUT;
  }
}

export interface MatchRewardSummary {
  xp: number;
  tides: number;
  levelBefore: number;
  levelAfter: number;
  firstWinOfDay: boolean;
}

/**
 * Récompense déjà octroyée au joueur connecté pour une partie, ou `null` si
 * elle n'existe pas (encore). Lecture sous RLS : un joueur ne voit que ses
 * propres lignes de `match_rewards`.
 */
export async function fetchMatchReward(matchId: string): Promise<MatchRewardSummary | null> {
  try {
    const supabase = createSupabaseServerClient();
    const user = await getSessionUser();
    if (!user) return null;

    const { data } = await supabase
      .from("match_rewards")
      .select("*")
      .eq("match_id", matchId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!data) return null;

    return {
      xp: data.xp_granted,
      tides: data.tides_granted,
      levelBefore: data.level_before,
      levelAfter: data.level_after,
      firstWinOfDay: data.first_win_of_day,
    };
  } catch (error) {
    console.error("[fetchMatchReward] Lecture impossible :", error);
    return null;
  }
}
