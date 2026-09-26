"use server";

import { getSessionUser } from "@/lib/supabase/sessionUser";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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
