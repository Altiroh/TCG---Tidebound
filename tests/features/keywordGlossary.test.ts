import { describe, expect, it } from "vitest";
import { CARD_DATABASE } from "@/game/cards/sets/core";
import { glossaryTermsIn, KEYWORD_GLOSSARY } from "@/features/match/keywordGlossary";

describe("glossaire des mots-clés", () => {
  it("repère les mots-clés d'un texte de carte, mot entier, quelle que soit la forme", () => {
    const labels = (text: string) => glossaryTermsIn(text).map((entry) => entry.label);
    expect(labels("Garde. Pied marin.")).toEqual(["Garde", "Pied marin"]);
    expect(labels("Sabordez cet Équipement : restaurez 2 Résistance.")).toEqual(["Saborder"]);
    // « Gardien » n'est pas « Garde ».
    expect(labels("Gardien du Sondeur")).toEqual([]);
  });

  it("chaque entrée a une définition, et les cartes du catalogue en trouvent", () => {
    for (const entry of KEYWORD_GLOSSARY) expect(entry.description.length, entry.label).toBeGreaterThan(10);
    const found = [...CARD_DATABASE.values()].filter((card) => glossaryTermsIn(card.text).length > 0).length;
    expect(found).toBeGreaterThan(20);
  });
});
