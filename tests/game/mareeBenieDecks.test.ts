import { describe, expect, it } from "vitest";
import { PLAYABLE_DECKS } from "@/game/cards/decks/catalog";
import type { DeckList } from "@/game/cards/decks/types";
import { validateDeckList } from "@/game/rules/deckValidation";
import { RULES } from "@/game/rules/constants";
import { BIENFAITS, FELINS } from "./mareeBenieDecks";

/**
 * LA MARÉE BÉNIE dans des decks : les cartes des deux archétypes se
 * construisent en decks valides, cohabitent avec les cartes existantes, et
 * le bot les joue d'un bout à l'autre d'une partie sans jamais proposer un
 * coup que le moteur refuse (`mareeBenieDecks.lent.test.ts`).
 */

describe("decks de La Marée Bénie", () => {
  it("chaque archétype forme un deck valide, seul ou mêlé à des cartes existantes", () => {
    expect(BIENFAITS.cardIds).toHaveLength(RULES.DECK_SIZE_MIN);
    expect(validateDeckList(BIENFAITS).ok).toBe(true);
    expect(validateDeckList(FELINS).ok).toBe(true);
    const mixte: DeckList = { ...PLAYABLE_DECKS[0]!, cardIds: [...PLAYABLE_DECKS[0]!.cardIds.slice(0, 30), ...BIENFAITS.cardIds.slice(0, 10)] };
    expect(validateDeckList(mixte).ok).toBe(true);
  });

  it("les decks préconstruits existants restent valides", () => {
    for (const deck of PLAYABLE_DECKS) expect(validateDeckList(deck), deck.id).toMatchObject({ ok: true });
  });
});
