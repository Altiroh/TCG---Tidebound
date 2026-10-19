import { describe, expect, it } from "vitest";
import { hasArtwork, shownChosenArtwork, unlocksStyled } from "@/game/cosmetics/artworks";
import { deckArtUrl } from "@/features/decks/nameplateArt";
import { styledUnlockedFrom } from "@/lib/supabase/cardEditions";

const AVEC_STYLED = "la-revenante";
const SANS_STYLED = "stop";

describe("illustration Styled du profil et des decks", () => {
  it("les cartes de référence ont (ou non) une Styled", () => {
    expect(hasArtwork(AVEC_STYLED, "styled")).toBe(true);
    expect(hasArtwork(SANS_STYLED, "styled")).toBe(false);
  });

  it("la Styled se débloque en l'obtenant, ou en obtenant la Full-Art seule", () => {
    expect(unlocksStyled(AVEC_STYLED, ["styled"])).toBe(true);
    expect(unlocksStyled(AVEC_STYLED, ["styled-fa"])).toBe(true);
    expect(unlocksStyled(AVEC_STYLED, ["classique"])).toBe(false);
    expect(unlocksStyled(AVEC_STYLED, [])).toBe(false);
    // Pas d'illustration Styled pour cette carte : rien à débloquer.
    expect(unlocksStyled(SANS_STYLED, ["styled-fa"])).toBe(false);
  });

  it("une Full-Art Star Foil possédée débloque la Styled ; une finition seule, non", () => {
    expect(
      styledUnlockedFrom({
        [AVEC_STYLED]: [{ artwork: "styled-fa", finish: "star-foil", quantity: 1 }],
        "le-brise-ligne": [{ artwork: "classique", finish: "foil", quantity: 2 }],
      })
    ).toEqual([AVEC_STYLED]);
  });

  it("l'illustration montrée retombe sur la Classique si la Styled n'est pas (ou plus) débloquée", () => {
    expect(shownChosenArtwork(AVEC_STYLED, "styled", new Set([AVEC_STYLED]))).toBe("styled");
    expect(shownChosenArtwork(AVEC_STYLED, "styled", new Set())).toBe("classique");
    expect(shownChosenArtwork(AVEC_STYLED, "styled", null)).toBe("styled");
    expect(shownChosenArtwork(AVEC_STYLED, "styled-fa", null)).toBe("classique");
    expect(shownChosenArtwork(SANS_STYLED, "styled", null)).toBe("classique");
    expect(shownChosenArtwork(AVEC_STYLED, undefined, null)).toBe("classique");
  });

  it("la plaque d'un deck suit l'illustration CHOISIE, Styled comprise ; sans choix, la règle par défaut", () => {
    expect(deckArtUrl({ cardIds: [AVEC_STYLED], shipId: "x", artCardId: AVEC_STYLED, artArtwork: "styled" })).toBe(
      `/assets/cards/illustrations/styled/${AVEC_STYLED}.webp`
    );
    expect(deckArtUrl({ cardIds: [AVEC_STYLED, SANS_STYLED], shipId: "x", artCardId: SANS_STYLED })).toBe(`/assets/cards/illustrations/${SANS_STYLED}.webp`);
    expect(deckArtUrl({ cardIds: [AVEC_STYLED], shipId: "x" })).toBe(`/assets/cards/illustrations/${AVEC_STYLED}.webp`);
  });
});
