"use server";

import { getSessionUser } from "@/lib/supabase/sessionUser";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AUDIENCE_PER_SPECTACLE, AUDIENCE_RETAIN } from "@/game/audience";

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
  /** Audience AVANT la partie (déduite : la formule est connue). */
  before: number;
  /** Audience après la partie, telle qu'en base. */
  after: number;
}

/**
 * Ce que la partie a fait à l'audience, une fois jugée côté serveur
 * (`recordMatchAudience`, fin de partie). `null` tant qu'elle ne l'est pas.
 */
export async function fetchMatchAudience(matchId: string): Promise<MatchAudienceSummary | null> {
  try {
    const user = await getSessionUser();
    if (!user) return null;
    const supabase = createSupabaseServerClient();
    const [judged, audience] = await Promise.all([
      supabase.from("player_audience_matches").select("spectacle").eq("match_id", matchId).eq("user_id", user.id).maybeSingle(),
      supabase.from("player_audience").select("audience").eq("user_id", user.id).maybeSingle(),
    ]);
    if (judged.error || !judged.data || audience.error) return null;
    const after = audience.data?.audience ?? 0;
    const spectacle = judged.data.spectacle;
    // Inverse de `nextAudience` : assez juste pour afficher le gain (au
    // spectateur près), tant qu'aucune autre partie n'a été jugée depuis.
    const before = Math.max(0, Math.round((after - spectacle * AUDIENCE_PER_SPECTACLE) / AUDIENCE_RETAIN));
    return { spectacle, before, after };
  } catch {
    return null;
  }
}
