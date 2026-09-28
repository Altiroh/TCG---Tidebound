import { notFound } from "next/navigation";
import { isDeckStyleId, type DeckStyleId } from "@/game";
import { DeckEditorScreen } from "@/features/decks/DeckEditorScreen";
import { getOwnedCardIds } from "@/lib/supabase/ownedCards";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/supabase/sessionUser";

async function loadDeck(deckId: string) {
  const supabase = createSupabaseServerClient();
  const user = await getSessionUser();
  if (!user) return null;

  const { data: deck } = await supabase
    .from("player_decks")
    .select("id, name, ship_id, art_card_id, description")
    .eq("id", deckId)
    // Un deck à la corbeille ne s'édite pas : il faut d'abord le restaurer.
    .is("deleted_at", null)
    .maybeSingle();
  if (!deck) return null;

  const { data: cards } = await supabase.from("player_deck_cards").select("card_id, quantity").eq("deck_id", deckId);

  const cardIds = (cards ?? []).flatMap((row) => Array.from({ length: row.quantity }, () => row.card_id));

  return {
    id: deck.id,
    name: deck.name,
    shipId: deck.ship_id,
    cardIds,
    artCardId: deck.art_card_id,
    description: deck.description ?? "",
    styleId: await loadChosenStyle(supabase, deckId),
  };
}

/**
 * Le style CHOISI par le joueur (« Ma fiche de deck »), ou `null` : le jeu
 * le déduit alors des cartes. Lu À PART, comme dans `listPlayerDecks` : la
 * colonne vient d'une migration appliquée à la main (`20260930120000`), et
 * tant qu'elle manque, un `select` groupé ferait tomber tout l'éditeur en 404.
 */
async function loadChosenStyle(supabase: ReturnType<typeof createSupabaseServerClient>, deckId: string): Promise<DeckStyleId | null> {
  const { data, error } = await supabase.from("player_decks").select("style").eq("id", deckId).maybeSingle();
  if (error) return null;
  return isDeckStyleId(data?.style) ? data.style : null;
}

export default async function DeckDetailPage({ params }: { params: { deckId: string } }) {
  const [deck, { ownedCardIds, ownedCounts }] = await Promise.all([loadDeck(params.deckId), getOwnedCardIds()]);
  if (!deck) notFound();

  return <DeckEditorScreen ownedCardIds={ownedCardIds} ownedCounts={ownedCounts} initialDeck={deck} />;
}
