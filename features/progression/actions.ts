"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { progressionView, type ProgressionView } from "@/game/progression";

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
  matchesPlayed: number;
  pvpWins: number;
  /** Pseudo affiché à côté du niveau (`profiles.display_name`), repli sur l'e-mail. `null` hors connexion. */
  displayName: string | null;
  /**
   * Quêtes terminées mais pas encore réclamées — la pastille du bandeau.
   *
   * Lue ici plutôt que par une seconde requête : le bandeau lit déjà la
   * progression à chaque écran, et un compteur d'attention qui arriverait
   * après coup ferait sauter la mise en page.
   */
  claimableQuests: number;
}

const SIGNED_OUT: ProgressionSummary = {
  isSignedIn: false,
  view: progressionView(0),
  balance: 0,
  matchesPlayed: 0,
  pvpWins: 0,
  displayName: null,
  claimableQuests: 0,
};

/**
 * Progression du joueur connecté, pour affichage. Ne fait jamais planter la
 * page appelante : une config Supabase absente dégrade vers "non connecté",
 * comme le reste des lectures de l'app.
 */
export async function fetchProgression(): Promise<ProgressionSummary> {
  try {
    const supabase = createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return SIGNED_OUT;

    const [progression, currency, profile, claimable] = await Promise.all([
      supabase.from("player_progression").select("*").eq("user_id", user.id).maybeSingle(),
      supabase.from("player_currency").select("balance").eq("user_id", user.id).maybeSingle(),
      supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle(),
      // Terminées et pas encore réclamées : `head` + `count`, on ne veut
      // que le nombre.
      supabase
        .from("player_quest_progress")
        .select("quest_id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .not("completed_at", "is", null)
        .is("claimed_at", null),
    ]);

    return {
      isSignedIn: true,
      view: progressionView(progression.data?.xp_total ?? 0),
      balance: currency.data?.balance ?? 0,
      matchesPlayed: progression.data?.matches_played ?? 0,
      pvpWins: progression.data?.pvp_wins ?? 0,
      // Repli sur l'e-mail comme le menu principal : mieux vaut un identifiant
      // qu'un vide à côté du niveau.
      displayName: profile.data?.display_name ?? user.email ?? null,
      claimableQuests: claimable.count ?? 0,
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
    const {
      data: { user },
    } = await supabase.auth.getUser();
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
