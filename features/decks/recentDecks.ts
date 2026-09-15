import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { NEW_DECK_WINDOW_HOURS } from "@/game/quests";

/**
 * « Deck récemment monté » — la donnée derrière l'objectif `play_new_deck`.
 *
 * Deux façons d'avoir un deck neuf entre les mains, et la quête ne doit pas
 * privilégier l'une :
 *   - l'avoir CRÉÉ soi-même (`player_decks.created_at`) ;
 *   - l'avoir OBTENU, deck d'emprunt ou préconstruit débloqué avec un Jeton
 *     (`player_deck_unlocks.unlocked_at`).
 *
 * Les deux branches travaillent : depuis `resolveMatchDeck`
 * (`features/decks/matchDeck.ts`), un deck monté par le joueur arrive
 * jusqu'à une partie arbitrée au même titre qu'une liste du catalogue.
 *
 * La fenêtre est GLISSANTE (`NEW_DECK_WINDOW_HOURS`) et non « depuis minuit
 * UTC » : un deck monté à 23 h ne vaudrait sinon qu'une heure de quête.
 */
export async function isRecentDeck(userId: string, deckId: string | null | undefined, now: Date = new Date()): Promise<boolean> {
  if (!deckId) return false;

  const since = new Date(now.getTime() - NEW_DECK_WINDOW_HOURS * 3_600_000).toISOString();

  try {
    const service = createSupabaseServiceRoleClient();

    const unlocked = await service
      .from("player_deck_unlocks")
      .select("deck_id")
      .eq("user_id", userId)
      .eq("deck_id", deckId)
      .gte("unlocked_at", since)
      .maybeSingle();
    if (unlocked.data) return true;

    // Un identifiant de deck du catalogue n'est pas un uuid : inutile
    // d'interroger `player_decks` avec, Postgres refuserait la comparaison.
    if (!UUID.test(deckId)) return false;

    const created = await service
      .from("player_decks")
      .select("id")
      .eq("user_id", userId)
      .eq("id", deckId)
      .gte("created_at", since)
      .maybeSingle();
    return Boolean(created.data);
  } catch (error) {
    // Une quête qui n'avance pas vaut mieux qu'une fin de partie qui échoue.
    console.error("[isRecentDeck] Lecture impossible :", error);
    return false;
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
