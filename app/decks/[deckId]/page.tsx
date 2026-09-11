import { notFound } from "next/navigation";
import { DeckEditorScreen } from "@/features/decks/DeckEditorScreen";
import { getOwnedCardIds } from "@/lib/supabase/ownedCards";
import { createSupabaseServerClient } from "@/lib/supabase/server";

async function loadDeck(deckId: string) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: deck } = await supabase
    .from("player_decks")
    .select("id, name, ship_id")
    .eq("id", deckId)
    .maybeSingle();
  if (!deck) return null;

  const { data: cards } = await supabase.from("player_deck_cards").select("card_id, quantity").eq("deck_id", deckId);

  const cardIds = (cards ?? []).flatMap((row) => Array.from({ length: row.quantity }, () => row.card_id));

  return { id: deck.id, name: deck.name, shipId: deck.ship_id, cardIds };
}

export default async function DeckDetailPage({ params }: { params: { deckId: string } }) {
  const [deck, { ownedCardIds }] = await Promise.all([loadDeck(params.deckId), getOwnedCardIds()]);
  if (!deck) notFound();

  return <DeckEditorScreen ownedCardIds={ownedCardIds} initialDeck={deck} />;
}
