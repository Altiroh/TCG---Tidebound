import { describe, expect, it } from "vitest";
import { editionRecycleValueOf, recycleValueOf, roundResale } from "@/features/collection/recycleValue";
import { CARD_ARTWORKS } from "@/game/cosmetics/artworks";
import { CARD_FINISHES } from "@/game/cosmetics/finishes";

/**
 * REVENTE PAR ÉDITION (Collection visuelle V2, barème du 18/10/2026) :
 * rareté × illustration × finition, arrondi. Les deux repères de Notion
 * doivent tenir tant que le barème ne change pas sur décision.
 */
describe("revente par édition", () => {
  it("tient les repères de Notion : Aberration Vorace 11 en Classique, 1 500 en Styled Full-Art Star Foil", () => {
    expect(editionRecycleValueOf("aberration-vorace", { artwork: "classique", finish: "classique" })).toBe(11);
    expect(editionRecycleValueOf("aberration-vorace", { artwork: "styled-fa", finish: "star-foil" })).toBe(1500);
  });

  it("la Classique vaut exactement l'ancienne revente à la rareté", () => {
    for (const cardId of ["marin-des-jetees", "chirurgien-du-bord", "le-brise-ligne", "lamiral-sans-pavillon", "leviathan-balafre"]) {
      expect(editionRecycleValueOf(cardId, { artwork: "classique", finish: "classique" })).toBe(recycleValueOf(cardId));
    }
  });

  it("une édition plus rare vaut toujours plus, sur les deux axes", () => {
    for (const artwork of CARD_ARTWORKS) {
      const valeurs = CARD_FINISHES.map((finish) => editionRecycleValueOf("aberration-vorace", { artwork, finish })!);
      expect([...valeurs].sort((a, b) => a - b)).toEqual(valeurs);
    }
    for (const finish of CARD_FINISHES) {
      const valeurs = CARD_ARTWORKS.map((artwork) => editionRecycleValueOf("aberration-vorace", { artwork, finish })!);
      expect([...valeurs].sort((a, b) => a - b)).toEqual(valeurs);
    }
  });

  it("arrondit pour se lire : unité sous 100, dizaine jusqu'à 999, cinquantaine au-delà", () => {
    expect(roundResale(44.4)).toBe(44);
    expect(roundResale(176)).toBe(180);
    expect(roundResale(1485)).toBe(1500);
    expect(roundResale(0.2)).toBe(1);
  });

  it("une carte inconnue n'a pas de prix", () => {
    expect(editionRecycleValueOf("carte-qui-nexiste-pas", { artwork: "classique", finish: "classique" })).toBeNull();
  });
});
