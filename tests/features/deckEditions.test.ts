import { describe, expect, it } from "vitest";
import {
  alignCardEditions,
  clampRareCopies,
  copiesOfEdition,
  countsFromRareCopies,
  rareCopiesFrom,
} from "@/features/decks/deckEditions";
import { CLASSIC_EDITION } from "@/game/cosmetics/editions";

const STAR = { artwork: "classique", finish: "star-foil" } as const;
const FA = { artwork: "styled-fa", finish: "classique" } as const;
const G = "le-gardien-des-jouets";

describe("éditions par exemplaire d'un deck", () => {
  it("comptes ↔ copies, aller-retour", () => {
    const copies = rareCopiesFrom([
      { cardId: G, ...STAR, quantity: 1 },
      { cardId: G, ...FA, quantity: 1 },
    ]);
    expect(copies[G]).toHaveLength(2);
    expect(countsFromRareCopies(copies).sort((a, b) => a.finish.localeCompare(b.finish))).toEqual([
      { cardId: G, ...FA, quantity: 1 },
      { cardId: G, ...STAR, quantity: 1 },
    ]);
  });

  it("compte chaque édition : la Classique = les copies sans édition rare", () => {
    const cardIds = [G, G, "stop"];
    const copies = { [G]: [STAR] };
    expect(copiesOfEdition(cardIds, copies, G, CLASSIC_EDITION)).toBe(1);
    expect(copiesOfEdition(cardIds, copies, G, STAR)).toBe(1);
    expect(copiesOfEdition(cardIds, copies, G, FA)).toBe(0);
  });

  it("bride à la possession et au nombre de copies ; le surplus redevient Classique", () => {
    const owned = { [G]: [{ ...STAR, quantity: 1 }] };
    // Deux Star Foil demandées pour une seule possédée, et une Full-Art jamais tirée.
    expect(clampRareCopies([G, G], { [G]: [STAR, STAR, FA] }, owned)).toEqual({ [G]: [STAR] });
    // Plus d'éditions rares que de copies dans le deck : les plus rares restent.
    expect(clampRareCopies([G], { [G]: [STAR, FA] }, null)).toEqual({ [G]: [FA] });
  });

  it("aligne une édition par exemplaire, les rares d'abord", () => {
    expect(alignCardEditions([G, "stop", G], { [G]: [STAR] })).toEqual([STAR, CLASSIC_EDITION, CLASSIC_EDITION]);
  });
});
