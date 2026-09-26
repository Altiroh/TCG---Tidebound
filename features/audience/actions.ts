"use server";

import { AUDIENCE_OPPONENT_WEIGHT } from "@/game/audience";
import { audienceOpponent } from "@/game/progression";
import { botCountsAsPvp } from "@/features/progression/botRewardPolicy";
import { getSessionUser } from "@/lib/supabase/sessionUser";
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";

/**
 * Audience du joueur connecté — lecture légère pour la table (le compteur
 * en direct part de là). 0 hors connexion ou sans la table (migration pas
 * encore passée) : le public d'un invité part de rien, comme au premier jour.
 */
export async function fetchMyAudience(): Promise<number> {
  try {
    const user = await getSessionUser();
    if (!user) return 0;
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase.from("player_audience").select("audience").eq("user_id", user.id).maybeSingle();
    return error ? 0 : (data?.audience ?? 0);
  } catch {
    return 0;
  }
}

/**
 * De quoi tenir le compteur EN PARTIE : l'audience du joueur au départ, et
 * le POIDS que le verdict donnera à cette partie — la règle exacte de
 * `recordMatchAudience` (`audienceOpponent`, dérogation de développement
 * comprise). Sans partie arbitrée (partie locale, tutoriel) ou pour qui n'y
 * joue pas, le poids est nul : rien ne sera jugé, le compteur ne bouge pas.
 */
export async function fetchLiveAudienceContext(matchId?: string): Promise<{ audience: number; weight: number }> {
  const audience = await fetchMyAudience();
  if (!matchId) return { audience, weight: 0 };
  try {
    const user = await getSessionUser();
    if (!user) return { audience, weight: 0 };
    const { data: match, error } = await createSupabaseServiceRoleClient()
      .from("matches")
      .select("mode, bot_difficulty, player1_id, player2_id")
      .eq("id", matchId)
      .maybeSingle();
    if (error || !match || (match.player1_id !== user.id && match.player2_id !== user.id)) return { audience, weight: 0 };
    const botAsPvp = match.mode === "bot" && botCountsAsPvp();
    return { audience, weight: AUDIENCE_OPPONENT_WEIGHT[audienceOpponent(match.mode, match.bot_difficulty, botAsPvp)] };
  } catch {
    return { audience, weight: 0 };
  }
}

export interface MatchAudienceSummary {
  spectacle: number;
  /** Audience AVANT la partie. */
  before: number;
  /** Audience après la partie, telle qu'en base. */
  after: number;
  /** Prime du public déjà octroyée avec la partie (`game/audience/prize.ts`). Absente : aucune, ou partie jugée avant la prime. */
  prize?: { xp: number; tides: number };
}

/**
 * Ancienne formule (migration 20261010120000) : ne sert qu'à relire une
 * partie jugée avant que l'audience d'avant ne soit enregistrée.
 */
const LEGACY_RETAIN = 0.8;
const LEGACY_PER_SPECTACLE = 5;

/**
 * Ce que la partie a fait à l'audience, une fois jugée côté serveur
 * (`recordMatchAudience`, fin de partie). `null` tant qu'elle ne l'est pas.
 */
export async function fetchMatchAudience(matchId: string): Promise<MatchAudienceSummary | null> {
  try {
    const user = await getSessionUser();
    if (!user) return null;
    const supabase = createSupabaseServerClient();
    const judged = await supabase
      .from("player_audience_matches")
      .select("spectacle, audience_before, audience_after, prize_xp, prize_tides")
      .eq("match_id", matchId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!judged.error && judged.data) {
      const { spectacle, audience_before: before, audience_after: after, prize_xp: xp, prize_tides: tides } = judged.data;
      if (before !== null && after !== null) return { spectacle, before, after, ...(xp > 0 || tides > 0 ? { prize: { xp, tides } } : {}) };
    }
    return await legacyMatchAudience(supabase, matchId, user.id);
  } catch {
    return null;
  }
}

/**
 * Sans les colonnes avant/après (migration 20261013120000 pas encore passée,
 * ou partie jugée avant elle) : l'audience d'avant se DÉDUIT de l'ancienne
 * formule — juste au spectateur près tant qu'aucune autre partie n'a été
 * jugée depuis.
 */
async function legacyMatchAudience(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  matchId: string,
  userId: string
): Promise<MatchAudienceSummary | null> {
  const [judged, audience] = await Promise.all([
    supabase.from("player_audience_matches").select("spectacle").eq("match_id", matchId).eq("user_id", userId).maybeSingle(),
    supabase.from("player_audience").select("audience").eq("user_id", userId).maybeSingle(),
  ]);
  if (judged.error || !judged.data || audience.error) return null;
  const after = audience.data?.audience ?? 0;
  const spectacle = judged.data.spectacle;
  const before = Math.max(0, Math.round((after - spectacle * LEGACY_PER_SPECTACLE) / LEGACY_RETAIN));
  return { spectacle, before, after };
}
