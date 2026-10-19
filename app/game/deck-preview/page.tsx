import type { Metadata } from "next";
import { CORE_SET, PRECON_DECK_LISTS } from "@/game";
import { DeckEditorScreen } from "@/features/decks/DeckEditorScreen";
import { cardIdsWithAlternateArt, hasArtwork } from "@/game/cosmetics/artworks";
import type { OwnedEdition } from "@/game/cosmetics/editions";

export const metadata: Metadata = {
  title: "Éditeur de deck Preview · Tidebound",
  description: "Écran temporaire de réglage de l'éditeur de deck « sur le livre » (développement).",
  // Écran de développement : jamais indexé.
  robots: { index: false, follow: false },
};

/**
 * Route de laboratoire : `/game/deck-preview` — l'ÉDITEUR DE DECK ouvert
 * sur un préconstruit de 40 cartes (Le Grand Banc, comme la maquette du
 * 26/09/2026), tout le catalogue possédé. `?vide=1` pour un deck neuf.
 * Chaque carte à illustration alternative est possédée aussi en Styled et en
 * Full-Art, et Le Gardien des Jouets en un seul exemplaire Star Foil : de
 * quoi régler les cellules de variantes et la mention « 1 possédée ».
 * Aucune lecture de session : sauvegarder échoue proprement, c'est attendu.
 */
/** Éditions rares de démonstration (voir l'en-tête). */
function demoEditions(): Record<string, OwnedEdition[]> {
  const result: Record<string, OwnedEdition[]> = {};
  for (const cardId of cardIdsWithAlternateArt()) {
    const list: OwnedEdition[] = [];
    if (hasArtwork(cardId, "styled")) list.push({ artwork: "styled", finish: "classique", quantity: 1 });
    if (hasArtwork(cardId, "styled-fa")) list.push({ artwork: "styled-fa", finish: "classique", quantity: 1 });
    result[cardId] = list;
  }
  result["le-gardien-des-jouets"] = [{ artwork: "classique", finish: "star-foil", quantity: 1 }];
  return result;
}

export default function DeckPreviewRoute({ searchParams = {} }: { searchParams?: Record<string, string | string[] | undefined> }) {
  const deck = PRECON_DECK_LISTS[0]!;
  return (
    <DeckEditorScreen
      ownedCardIds={CORE_SET.map((def) => def.id)}
      ownedCounts={{ ...Object.fromEntries(CORE_SET.map((def) => [def.id, 99])), "le-gardien-des-jouets": 1 }}
      ownedEditions={demoEditions()}
      initialDeck={
        searchParams.vide
          ? null
          : { id: "00000000-0000-4000-8000-00000000d3c0", name: "Cra-Poi - Swarm", shipId: deck.shipId, cardIds: [...deck.cardIds], artCardId: null, description: deck.description }
      }
    />
  );
}
