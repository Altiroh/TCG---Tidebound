import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { STARTER_DECK_IDS } from "@/game";

/**
 * PREMIÈRE MISSION — opérations SERVEUR (pas de `"use server"`).
 *
 * Décision du propriétaire du 15/10/2026 : quand le tutoriel est TERMINÉ
 * OU PASSÉ, les trois starters (`game/cards/decks/starters.ts`) sont
 * débloqués d'un coup. La mission remplace l'ancien choix gratuit d'un
 * préconstruit ; les déblocages 'borrowed' déjà en base restent valides.
 *
 * L'octroi est IDEMPOTENT (`grant_starter_decks`, `on conflict do nothing`)
 * : le tutoriel est rejouable, deux écrans peuvent rattraper le même compte
 * en même temps, et rien ne se double jamais.
 *
 * Il ne compte NI pour la quête « Nouvel équipage » (pas de
 * `recordQuestEvent`) NI pour l'exploit des déblocages au Jeton (qui ne lit
 * que `source = 'precon_token'`) : ce n'est pas un achat.
 */

export type MissionTutorialStatus = "not_started" | "completed" | "skipped";

/** `true` si la mission est accomplie — tutoriel terminé ou passé. */
export function starterMissionAccomplished(status: MissionTutorialStatus | null | undefined): boolean {
  return status === "completed" || status === "skipped";
}

/** Les starters qui manquent encore parmi `unlockedDeckIds`. */
export function missingStarterDeckIds(unlockedDeckIds: Iterable<string>): string[] {
  const unlocked = new Set(unlockedDeckIds);
  return STARTER_DECK_IDS.filter((deckId) => !unlocked.has(deckId));
}

/**
 * Accorde les starters manquants. Renvoie ceux NOUVELLEMENT accordés (vide
 * si tout était déjà là, ou si la base refuse — la migration
 * `20261104120000_starters_premiere_mission.sql` non appliquée, par
 * exemple). Jamais d'exception : l'écran appelant doit survivre.
 */
export async function grantStarterDecks(userId: string): Promise<string[]> {
  try {
    const service = createSupabaseServiceRoleClient();
    const { data, error } = await service.rpc("grant_starter_decks", {
      p_user_id: userId,
      p_deck_ids: [...STARTER_DECK_IDS],
    });
    if (error) {
      console.error("[grantStarterDecks] Refusé :", error.message);
      return [];
    }
    if (!data?.ok) {
      if (data?.error) console.error("[grantStarterDecks] Refusé :", data.error);
      return [];
    }
    return Array.isArray(data.granted) ? data.granted.filter((id): id is string => typeof id === "string") : [];
  } catch (error) {
    console.error("[grantStarterDecks] Échec :", error);
    return [];
  }
}

/**
 * RATTRAPAGE PARESSEUX : si la mission est accomplie et qu'un starter
 * manque, l'accorde. Les comptes qui avaient terminé ou passé le tutoriel
 * avant le 15/10/2026 reçoivent ainsi leurs starters à la première lecture
 * — sans reprise de données en base.
 *
 * Renvoie l'ensemble des decks débloqués, starters accordés compris.
 */
export async function ensureStarterDecks(
  userId: string,
  status: MissionTutorialStatus | null | undefined,
  unlockedDeckIds: Iterable<string>
): Promise<Set<string>> {
  const unlocked = new Set(unlockedDeckIds);
  if (!starterMissionAccomplished(status) || missingStarterDeckIds(unlocked).length === 0) return unlocked;
  for (const deckId of await grantStarterDecks(userId)) unlocked.add(deckId);
  return unlocked;
}
