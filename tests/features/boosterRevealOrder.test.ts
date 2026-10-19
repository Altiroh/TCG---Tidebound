import { describe, expect, it } from "vitest";
import { sortForReveal, type BoosterOpeningCard } from "@/features/boosters/opening/types";

describe("sortForReveal", () => {
  it("range de la plus commune à la plus rare, la meilleure carte en dernier", () => {
    const tirage: BoosterOpeningCard[] = [
      { id: "a", rarity: "legendary" },
      { id: "b", rarity: "common" },
      { id: "c", rarity: "abyssal" },
      { id: "d", rarity: "rare" },
      { id: "e", rarity: "uncommon" },
      { id: "f", rarity: "epic" },
    ];
    expect(sortForReveal(tirage).map((card) => card.rarity)).toEqual(["common", "uncommon", "rare", "epic", "legendary", "abyssal"]);
  });

  it("à rareté égale, l'édition exceptionnelle passe après la classique, la plus rare en dernier", () => {
    const tirage: BoosterOpeningCard[] = [
      { id: "star", rarity: "rare", finish: "star-foil" },
      { id: "fa", rarity: "rare", artwork: "styled-fa" },
      { id: "classique", rarity: "rare" },
      { id: "styled", rarity: "rare", artwork: "styled" },
      { id: "foil", rarity: "rare", finish: "foil" },
    ];
    expect(sortForReveal(tirage).map((card) => card.id)).toEqual(["classique", "styled", "fa", "foil", "star"]);
  });

  it("garde l'ordre du tirage à égalité complète, sans toucher à la liste reçue", () => {
    const tirage: BoosterOpeningCard[] = [
      { id: "1", rarity: "common" },
      { id: "2", rarity: "rare" },
      { id: "3", rarity: "common" },
    ];
    expect(sortForReveal(tirage).map((card) => card.id)).toEqual(["1", "3", "2"]);
    expect(tirage.map((card) => card.id)).toEqual(["1", "2", "3"]);
  });
});
