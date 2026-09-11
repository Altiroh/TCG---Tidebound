"use server";

import { revalidatePath } from "next/cache";
import { validateDeckList } from "@/game/rules/deckValidation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface PlayerDeckSummary {
  id: string;
  name: string;
  shipId: string;
  cardCount: number;
  /** Jusqu'à 5 `card_id` du deck, pour l'empilement d'en-tête de la tuile — ordre arbitraire pour l'instant. */
  headerCardIds: string[];
}

export interface DeckActionResult {
  ok: boolean;
  error?: string;
  id?: string;
}

async function currentUserId(supabase: ReturnType<typeof createSupabaseServerClient>): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

/** Liste les decks personnels du joueur connecté, avec de quoi peupler la tuile (nombre de cartes, aperçu d'en-tête). Tableau vide si non connecté — jamais d'erreur qui casse la page. */
export async function listPlayerDecks(): Promise<PlayerDeckSummary[]> {
  const supabase = createSupabaseServerClient();
  const userId = await currentUserId(supabase);
  if (!userId) return [];

  const { data: decks, error: decksError } = await supabase
    .from("player_decks")
    .select("id, name, ship_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (decksError) console.error("[listPlayerDecks] Échec de la lecture de player_decks :", decksError.message);
  if (!decks || decks.length === 0) return [];

  const { data: cards, error: cardsError } = await supabase
    .from("player_deck_cards")
    .select("deck_id, card_id, quantity")
    .in(
      "deck_id",
      decks.map((deck) => deck.id)
    );
  if (cardsError) console.error("[listPlayerDecks] Échec de la lecture de player_deck_cards :", cardsError.message);

  const cardsByDeck = new Map<string, { card_id: string; quantity: number }[]>();
  for (const row of cards ?? []) {
    const list = cardsByDeck.get(row.deck_id) ?? [];
    list.push(row);
    cardsByDeck.set(row.deck_id, list);
  }

  return decks.map((deck) => {
    const deckCards = cardsByDeck.get(deck.id) ?? [];
    return {
      id: deck.id,
      name: deck.name,
      shipId: deck.ship_id,
      cardCount: deckCards.reduce((sum, card) => sum + card.quantity, 0),
      headerCardIds: deckCards.slice(0, 5).map((card) => card.card_id),
    };
  });
}

export interface SaveDeckInput {
  /** `null` pour un deck pas encore créé (première sauvegarde depuis `/decks/nouveau`). */
  id: string | null;
  name: string;
  shipId: string;
  /** Un élément par exemplaire (pas groupé) — reflète directement la liste de l'éditeur. */
  cardIds: string[];
}

/**
 * Sauvegarde intégrale d'un deck personnel (nom + contenu), depuis
 * l'éditeur : crée le deck s'il n'existe pas encore, sinon remplace tout
 * son contenu. `is_valid` est recalculé ici via `validateDeckList` — jamais
 * fait confiance à un état client (cf. commentaire de la migration SQL) ;
 * un deck hors de `RULES.DECK_SIZE_MIN`/`MAX` se sauvegarde quand même,
 * juste marqué non jouable.
 */
export async function saveDeck(input: SaveDeckInput): Promise<DeckActionResult> {
  const name = input.name.trim() || "Deck sans nom";
  const supabase = createSupabaseServerClient();
  const userId = await currentUserId(supabase);
  if (!userId) return { ok: false, error: "Connecte-toi pour sauvegarder ce deck." };

  const validation = validateDeckList({
    id: input.id ?? "draft",
    name,
    shipId: input.shipId,
    description: "",
    cardIds: input.cardIds,
  });

  let deckId = input.id;

  if (!deckId) {
    const { data, error } = await supabase
      .from("player_decks")
      .insert({ user_id: userId, ship_id: input.shipId, name, is_valid: validation.ok })
      .select("id")
      .single();
    if (error || !data) return { ok: false, error: error?.message ?? "Échec de la création du deck." };
    deckId = data.id;
  } else {
    const { error: updateError } = await supabase
      .from("player_decks")
      .update({ name, is_valid: validation.ok })
      .eq("id", deckId);
    if (updateError) return { ok: false, error: updateError.message };

    const { error: deleteError } = await supabase.from("player_deck_cards").delete().eq("deck_id", deckId);
    if (deleteError) return { ok: false, error: deleteError.message };
  }

  const quantities = new Map<string, number>();
  for (const cardId of input.cardIds) quantities.set(cardId, (quantities.get(cardId) ?? 0) + 1);

  if (quantities.size > 0) {
    const finalDeckId = deckId;
    const { error: insertError } = await supabase
      .from("player_deck_cards")
      .insert(Array.from(quantities.entries()).map(([card_id, quantity]) => ({ deck_id: finalDeckId, card_id, quantity })));
    if (insertError) return { ok: false, error: insertError.message };
  }

  revalidatePath("/decks");
  revalidatePath(`/decks/${deckId}`);
  return { ok: true, id: deckId };
}

export async function renameDeck(deckId: string, name: string): Promise<DeckActionResult> {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "Le nom ne peut pas être vide." };

  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("player_decks").update({ name: trimmed }).eq("id", deckId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/decks");
  return { ok: true };
}

export async function duplicateDeck(deckId: string): Promise<DeckActionResult> {
  const supabase = createSupabaseServerClient();
  const userId = await currentUserId(supabase);
  if (!userId) return { ok: false, error: "Connecte-toi pour dupliquer un deck." };

  const { data: original, error: fetchError } = await supabase
    .from("player_decks")
    .select("name, ship_id")
    .eq("id", deckId)
    .single();
  if (fetchError || !original) return { ok: false, error: "Deck introuvable." };

  const { data: created, error: insertError } = await supabase
    .from("player_decks")
    .insert({ user_id: userId, ship_id: original.ship_id, name: `${original.name} (copie)` })
    .select("id")
    .single();
  if (insertError || !created) return { ok: false, error: insertError?.message ?? "Échec de la duplication." };

  const { data: cards } = await supabase.from("player_deck_cards").select("card_id, quantity").eq("deck_id", deckId);
  if (cards && cards.length > 0) {
    const { error: cardsError } = await supabase
      .from("player_deck_cards")
      .insert(cards.map((card) => ({ deck_id: created.id, card_id: card.card_id, quantity: card.quantity })));
    if (cardsError) return { ok: false, error: cardsError.message };
  }

  revalidatePath("/decks");
  return { ok: true, id: created.id };
}

export async function deleteDeck(deckId: string): Promise<DeckActionResult> {
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("player_decks").delete().eq("id", deckId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/decks");
  return { ok: true };
}
