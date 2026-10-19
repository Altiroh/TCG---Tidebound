import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { isCardArtwork } from "@/game/cosmetics/artworks";
import { isCardFinish } from "@/game/cosmetics/finishes";
import { rareCopiesFrom, type DeckEditionCount } from "@/features/decks/deckEditions";
import type { CardEdition } from "@/game/cosmetics/editions";

/**
 * Éditions RARES des exemplaires des decks (`player_deck_card_editions`,
 * migration `20261111120000` appliquée à la main). Module SERVEUR.
 *
 * Table absente ou lecture en échec : aucun deck n'a d'édition, tout reste
 * Classique — un deck ne doit jamais devenir illisible pour une variante.
 */
type Client = SupabaseClient<Database>;

/** Éditions rares par deck, puis par carte : une entrée par exemplaire. */
export async function readDeckRareCopies(client: Client, deckIds: readonly string[]): Promise<Record<string, Record<string, CardEdition[]>>> {
  const result: Record<string, Record<string, CardEdition[]>> = {};
  if (deckIds.length === 0) return result;
  let data, error;
  try {
    ({ data, error } = await client.from("player_deck_card_editions").select("deck_id, card_id, artwork, finish, quantity").in("deck_id", [...deckIds]));
  } catch (cause) {
    // Une partie ou un deck ne tombe jamais pour une variante : tout reste Classique.
    console.warn("[readDeckRareCopies] Lecture impossible :", cause);
    return result;
  }
  if (error) {
    console.warn("[readDeckRareCopies] Éditions des decks illisibles (migration 20261111120000 appliquée ?) :", error.message);
    return result;
  }
  const byDeck = new Map<string, DeckEditionCount[]>();
  for (const row of data ?? []) {
    const artwork: string = row.artwork;
    const finish: string = row.finish;
    if (!isCardArtwork(artwork) || !isCardFinish(finish)) continue;
    const list = byDeck.get(row.deck_id) ?? [];
    list.push({ cardId: row.card_id, artwork, finish, quantity: row.quantity });
    byDeck.set(row.deck_id, list);
  }
  for (const [deckId, counts] of byDeck) result[deckId] = rareCopiesFrom(counts);
  return result;
}

/** Remplace les éditions rares d'un deck. Échec (table absente) : journalisé, le deck reste Classique. */
export async function writeDeckEditions(client: Client, deckId: string, counts: readonly DeckEditionCount[]): Promise<void> {
  const { error: deleteError } = await client.from("player_deck_card_editions").delete().eq("deck_id", deckId);
  if (deleteError) {
    console.warn("[writeDeckEditions] Éditions du deck non enregistrées (migration 20261111120000 appliquée ?) :", deleteError.message);
    return;
  }
  const rows = counts
    .filter((count) => count.quantity > 0 && !(count.artwork === "classique" && count.finish === "classique"))
    .map((count) => ({ deck_id: deckId, card_id: count.cardId, artwork: count.artwork, finish: count.finish, quantity: count.quantity }));
  if (rows.length === 0) return;
  const { error } = await client.from("player_deck_card_editions").insert(rows);
  if (error) console.warn("[writeDeckEditions] Éditions du deck non enregistrées :", error.message);
}
