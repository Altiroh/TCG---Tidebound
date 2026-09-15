import { describe, expect, it } from "vitest";
import { PLAYABLE_DECKS, getCardDefinition } from "@/game";
import { cardIllustrationUrl, nameplateArtUrl, plateArtUrl, signatureCardId } from "@/features/decks/nameplateArt";

/**
 * L'illustration d'une plaque. Ce qui compte n'est pas QUELLE carte sort,
 * mais que le choix soit DÉTERMINISTE et toujours défini : la plaque d'un
 * deck ne doit pas changer d'image selon l'ordre dans lequel ses cartes ont
 * été ajoutées, et un deck vide ne doit pas donner une plaque nue.
 */
describe("signatureCardId", () => {
  const deck = PLAYABLE_DECKS[0]!;

  it("choisit la carte la plus chère du deck", () => {
    const chosen = signatureCardId(deck.cardIds)!;
    const maxCost = Math.max(...deck.cardIds.map((id) => getCardDefinition(id).cost));
    expect(getCardDefinition(chosen).cost).toBe(maxCost);
  });

  it("ne dépend ni de l'ordre ni des exemplaires", () => {
    const reference = signatureCardId(deck.cardIds);
    expect(signatureCardId([...deck.cardIds].reverse())).toBe(reference);
    expect(signatureCardId([...new Set(deck.cardIds)])).toBe(reference);
  });

  it("ignore une carte absente du catalogue plutôt que d'échouer", () => {
    expect(signatureCardId(["carte-qui-nexiste-pas", ...deck.cardIds])).toBe(signatureCardId(deck.cardIds));
    expect(signatureCardId(["carte-qui-nexiste-pas"])).toBeNull();
  });

  it("rend null sur une liste vide", () => {
    expect(signatureCardId([])).toBeNull();
  });
});

describe("nameplateArtUrl", () => {
  const deck = PLAYABLE_DECKS[0]!;

  it("pointe l'illustration de la carte vedette", () => {
    expect(nameplateArtUrl(deck.cardIds, deck.shipId)).toBe(cardIllustrationUrl(signatureCardId(deck.cardIds)!));
  });

  it("retombe sur le Navire quand le deck n'offre aucune carte", () => {
    const fallback = nameplateArtUrl([], deck.shipId);
    expect(fallback).not.toBeNull();
    expect(fallback).not.toContain("/cards/");
  });

  it("plateArtUrl donne le même résultat à partir d'une carte déjà choisie", () => {
    expect(plateArtUrl(signatureCardId(deck.cardIds), deck.shipId)).toBe(nameplateArtUrl(deck.cardIds, deck.shipId));
    expect(plateArtUrl(null, deck.shipId)).toBe(nameplateArtUrl([], deck.shipId));
  });
});
