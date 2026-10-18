import { describe, expect, it } from "vitest";
import { boosterArtworksFor, drawBooster } from "@/game/boosters";
import {
  CARD_ARTWORK_ODDS,
  editionKey,
  editionLabel,
  editionRank,
  parseEditionKey,
  rollCardArtwork,
} from "@/game/cosmetics/editions";

/**
 * ÉDITIONS (Collection visuelle V2, 18/10/2026) : une illustration ET une
 * finition, tirées APRÈS la carte. Règles de l'utilisatrice :
 *  - les raretés se cumulent ;
 *  - une édition jamais vue a son badge « Nouveau » ;
 *  - elle ne compte jamais comme carte nouvelle (garantie de nouveauté,
 *    protection Abyssale).
 */
const POOL = [
  { id: "aberration-vorace", rarity: "uncommon" as const },
  { id: "chirurgien-du-bord", rarity: "uncommon" as const },
];
const SLOTS = [1, 2, 3, 4, 5, 6, 7, 8].map((slotIndex) => ({ slotIndex, guaranteedRarity: "uncommon" as const }));
const TOUT_POSSEDE = new Set(POOL.map((card) => card.id));
// Chaque carte du pool d'essai tirée depuis le booster où ses illustrations sont réparties.
const BOOSTER_DE: Record<string, string> = { "aberration-vorace": "la-mutation-mondiale", "chirurgien-du-bord": "necessaire-du-marin" };
const artworksFor = (cardId: string) => boosterArtworksFor(BOOSTER_DE[cardId] ?? "standard", cardId);

describe("éditions de carte", () => {
  it("un booster propose les illustrations qui y sont réparties, et elles seules", () => {
    expect(boosterArtworksFor("la-mutation-mondiale", "aberration-vorace")).toEqual(["styled", "styled-fa"]);
    expect(boosterArtworksFor("standard", "aberration-vorace")).toEqual([]);
    expect(boosterArtworksFor("standard", "marin-des-jetees")).toEqual([]);
    expect(boosterArtworksFor("dungeon-et-ladalle", "le-geant-qui-croyait-etre-discret")).toEqual(["styled", "styled-fa"]);
  });

  it("le tirage d'illustration respecte ses chances, sans reporter une illustration absente sur l'autre", () => {
    const n = 200_000;
    const counts: Record<string, number> = {};
    const seulementStyled: Record<string, number> = {};
    let state = 99;
    let state2 = 99;
    for (let i = 0; i < n; i += 1) {
      const roll = rollCardArtwork(state, ["styled", "styled-fa"]);
      state = roll.nextState;
      if (roll.artwork) counts[roll.artwork] = (counts[roll.artwork] ?? 0) + 1;
      const seul = rollCardArtwork(state2, ["styled"]);
      state2 = seul.nextState;
      if (seul.artwork) seulementStyled[seul.artwork] = (seulementStyled[seul.artwork] ?? 0) + 1;
    }
    for (const artwork of ["styled", "styled-fa"] as const) {
      expect(counts[artwork] ?? 0).toBeGreaterThan(n * CARD_ARTWORK_ODDS[artwork] * 0.8);
      expect(counts[artwork] ?? 0).toBeLessThan(n * CARD_ARTWORK_ODDS[artwork] * 1.2);
    }
    expect(seulementStyled.styled ?? 0).toBeLessThan(n * CARD_ARTWORK_ODDS.styled * 1.2);
  });

  it("ne changent ni la composition du booster ni ses finitions", () => {
    for (let seed = 0; seed < 300; seed += 1) {
      const sans = drawBooster({ slots: SLOTS, pool: POOL, ownedCardIds: TOUT_POSSEDE, packsSinceAbyssal: 0, seed });
      const avec = drawBooster({ slots: SLOTS, pool: POOL, ownedCardIds: TOUT_POSSEDE, packsSinceAbyssal: 0, seed, artworksFor });
      expect(avec.cards.map((c) => [c.cardId, c.finish])).toEqual(sans.cards.map((c) => [c.cardId, c.finish]));
    }
  });

  it("une édition nouvelle n'est jamais une carte nouvelle : la garantie de nouveauté n'en tient pas compte", () => {
    let editions = 0;
    for (let seed = 0; seed < 2000; seed += 1) {
      const result = drawBooster({ slots: SLOTS, pool: POOL, ownedCardIds: TOUT_POSSEDE, packsSinceAbyssal: 0, packsSinceNewCard: 1, seed, artworksFor });
      editions += result.cards.filter((c) => c.artwork).length;
      expect(result.cards.every((c) => !c.isNew)).toBe(true);
      expect(result.newCardPulled).toBe(false);
      expect(result.nextPacksSinceNewCard).toBe(2);
    }
    expect(editions).toBeGreaterThan(0);
  });

  it("le badge « Nouveau » d'une édition ne vaut que pour une édition jamais obtenue, même dans le même booster", () => {
    let vues = 0;
    for (let seed = 0; seed < 3000; seed += 1) {
      const result = drawBooster({ slots: SLOTS, pool: POOL, ownedCardIds: TOUT_POSSEDE, packsSinceAbyssal: 0, seed, artworksFor });
      const cles = new Set<string>();
      for (const card of result.cards) {
        if (!card.artwork && !card.finish) {
          expect(card.editionNew).toBeUndefined();
          continue;
        }
        const cle = `${card.cardId}|${editionKey({ artwork: card.artwork ?? "classique", finish: card.finish ?? "classique" })}`;
        expect(card.editionNew).toBe(!cles.has(cle));
        cles.add(cle);
        vues += 1;
      }
      // Les mêmes éditions déjà possédées : plus aucun badge.
      const encore = drawBooster({ slots: SLOTS, pool: POOL, ownedCardIds: TOUT_POSSEDE, packsSinceAbyssal: 0, seed, artworksFor, ownedEditionKeys: cles });
      for (const card of encore.cards) if (card.artwork || card.finish) expect(card.editionNew).toBe(false);
    }
    expect(vues).toBeGreaterThan(0);
  });

  it("libellés, clés et rang : l'illustration passe avant la finition", () => {
    expect(editionLabel({ artwork: "styled-fa", finish: "star-foil" })).toBe("Styled Full-Art · Star Foil");
    expect(editionLabel({ artwork: "classique", finish: "foil" })).toBe("Foil");
    expect(parseEditionKey("styled/negative")).toEqual({ artwork: "styled", finish: "negative" });
    expect(parseEditionKey("nimporte/quoi")).toBeNull();
    expect(editionRank({ artwork: "styled", finish: "classique" })).toBeGreaterThan(editionRank({ artwork: "classique", finish: "star-foil" }));
    expect(editionRank({ artwork: "styled-fa", finish: "star-foil" })).toBeGreaterThan(editionRank({ artwork: "styled-fa", finish: "prismatic" }));
  });
});
