import { notFound } from "next/navigation";
import { isDeckStyleId, type DeckStyleId } from "@/game";
import { DeckEditorScreen } from "@/features/decks/DeckEditorScreen";
import { getOwnedCardIds } from "@/lib/supabase/ownedCards";
import { styledUnlockedFrom } from "@/lib/supabase/cardEditions";
import { shownChosenArtwork, type ChosenArtwork } from "@/game/cosmetics/artworks";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/supabase/sessionUser";

async function loadDeck(deckId: string) {
  const supabase = createSupabaseServerClient();
  const user = await getSessionUser();
  if (!user) return null;

  // Deck, cartes et style se lisent par le même identifiant : un seul étage.
  // Les cartes et le style d'un deck introuvable (ou à la corbeille) sont
  // simplement ignorés — la RLS ne rend de toute façon que ceux du joueur.
  const [{ data: deck }, { data: cards }, styleId, artArtwork] = await Promise.all([
    supabase
      .from("player_decks")
      .select("id, name, ship_id, art_card_id, description")
      .eq("id", deckId)
      // Un deck à la corbeille ne s'édite pas : il faut d'abord le restaurer.
      .is("deleted_at", null)
      .maybeSingle(),
    supabase.from("player_deck_cards").select("card_id, quantity").eq("deck_id", deckId),
    loadChosenStyle(supabase, deckId),
    loadArtArtwork(supabase, deckId),
  ]);
  if (!deck) return null;

  const cardIds = (cards ?? []).flatMap((row) => Array.from({ length: row.quantity }, () => row.card_id));

  return {
    id: deck.id,
    name: deck.name,
    shipId: deck.ship_id,
    cardIds,
    artCardId: deck.art_card_id,
    artArtwork: deck.art_card_id ? shownChosenArtwork(deck.art_card_id, artArtwork, null) : ("classique" as ChosenArtwork),
    description: deck.description ?? "",
    styleId,
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

/** L'illustration de la plaque (Classique ou Styled), lue À PART : migration `20261110120000` appliquée à la main. */
async function loadArtArtwork(supabase: ReturnType<typeof createSupabaseServerClient>, deckId: string): Promise<string | null> {
  const { data, error } = await supabase.from("player_decks").select("art_artwork").eq("id", deckId).maybeSingle();
  return error ? null : (data?.art_artwork ?? null);
}

export default async function DeckDetailPage({ params }: { params: { deckId: string } }) {
  const [deck, { ownedCardIds, ownedCounts, ownedEditions }] = await Promise.all([loadDeck(params.deckId), getOwnedCardIds({ withEditions: true })]);
  if (!deck) notFound();

  return <DeckEditorScreen ownedCardIds={ownedCardIds} ownedCounts={ownedCounts} styledCardIds={styledUnlockedFrom(ownedEditions)} initialDeck={deck} />;
}
