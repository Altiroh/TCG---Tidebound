import { PLAYABLE_DECKS } from "@/game/cards/decks/catalog";
import type { DeckList } from "@/game/cards/decks/types";
import { BIENFAITS_DU_FOND_SET, EQUIPAGE_FELIN_SET } from "@/game/cards/sets/mareeBenie";
import { getMaxCopies, type CardDefinition } from "@/game/cards/types";
import { RULES } from "@/game/rules/constants";

/** Decks d'essai de La Marée Bénie, partagés par `mareeBenieDecks.test.ts` et sa version lente. */

/** Un deck de 40 cartes tiré d'un archétype (Abyssale exclue), au maximum d'exemplaires autorisé. */
function deckDe(id: string, cartes: CardDefinition[], complement: string[] = []): DeckList {
  const cardIds: string[] = [];
  for (const def of cartes.filter((d) => !d.id.endsWith("-abyssal"))) {
    for (let n = 0; n < getMaxCopies(def) && cardIds.length < RULES.DECK_SIZE_MIN; n += 1) cardIds.push(def.id);
  }
  for (const cardId of complement) if (cardIds.length < RULES.DECK_SIZE_MIN) cardIds.push(cardId);
  return { id, name: id, shipId: PLAYABLE_DECKS[0]!.shipId, description: id, cardIds };
}

export const BIENFAITS = deckDe("bienfaits", BIENFAITS_DU_FOND_SET);
export const FELINS = deckDe("felins", EQUIPAGE_FELIN_SET, PLAYABLE_DECKS[0]!.cardIds);
