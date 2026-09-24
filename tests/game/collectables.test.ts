import { describe, expect, it } from "vitest";
import {
  CARD_BACKS,
  COLLECTABLE_FAMILIES,
  SHIP_FRAMES,
  collectablePrice,
  isCosmeticUnlocked,
  isFree,
  purchasableCollectables,
  unlockLabel,
  unlockProgress,
  unlockedCollectables,
} from "@/game";
import type { AchievementStats } from "@/game/achievements";
import { CARD_DATABASE } from "@/game/cards/sets/core";

const NOTHING: AchievementStats = {
  level: 1,
  wins: 0,
  losses: 0,
  matchesPlayed: 0,
  boostersOpened: 0,
  distinctCardsOwned: 0,
  ownedCardIds: [],
  ownsAbyssalCard: false,
  preconDecksUnlocked: 0,
  decksFullyOwned: 0,
  tutorialCompleted: false,
  voyagesCompleted: [],
};

const NONE = new Set<string>();

describe("catalogue des Collectables", () => {
  it("n'a que des identifiants uniques, toutes familles confondues", () => {
    const ids = COLLECTABLE_FAMILIES.flatMap((family) => family.items.map((item) => `${family.kind}:${item.id}`));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("donne à chacun un visuel, un nom et une description", () => {
    for (const family of COLLECTABLE_FAMILIES) {
      for (const item of family.items) {
        expect(item.src, item.id).toMatch(/^\/assets\/.+\.webp$/);
        expect(item.label.length, item.id).toBeGreaterThan(0);
        expect(item.description.length, item.id).toBeGreaterThan(0);
      }
    }
  });

  it("commence chaque famille par un objet gratuit — un sélecteur vide ne sert à rien", () => {
    for (const family of COLLECTABLE_FAMILIES) {
      expect(family.items.some((item) => isFree(item)), family.kind).toBe(true);
      expect(isFree(family.items[0]!), family.kind).toBe(true);
    }
  });

  it("ne réclame que des cartes qui existent vraiment", () => {
    // Une condition portant sur une carte retirée du catalogue serait
    // impossible à remplir, donc un cosmétique verrouillé à vie.
    for (const family of COLLECTABLE_FAMILIES) {
      for (const item of family.items) {
        if (item.unlock.kind !== "ownsCards") continue;
        expect(item.unlock.cardIds.length, item.id).toBeGreaterThan(0);
        for (const cardId of item.unlock.cardIds) {
          expect(CARD_DATABASE.has(cardId), `${item.id} → ${cardId}`).toBe(true);
        }
      }
    }
  });

  it("dit toujours sa condition en clair", () => {
    for (const family of COLLECTABLE_FAMILIES) {
      for (const item of family.items) {
        expect(unlockLabel(item.unlock).length, item.id).toBeGreaterThan(0);
      }
    }
  });
});

describe("évaluation des conditions", () => {
  it("un compte neuf n'a rien débloqué, et les gratuits ne s'écrivent jamais en base", () => {
    expect(unlockedCollectables(NOTHING, NONE)).toEqual([]);
  });

  it("est monotone : un compteur qui grandit ne retire jamais un Collectable", () => {
    const low = unlockedCollectables({ ...NOTHING, level: 25, wins: 10 }, NONE).map((grant) => grant.id);
    const high = unlockedCollectables({ ...NOTHING, level: 100, wins: 500, matchesPlayed: 900 }, NONE).map((g) => g.id);
    for (const id of low) expect(high).toContain(id);
  });

  it("débloque au palier, et pas avant", () => {
    const at24 = unlockedCollectables({ ...NOTHING, level: 24 }, NONE).map((grant) => grant.id);
    const at25 = unlockedCollectables({ ...NOTHING, level: 25 }, NONE).map((grant) => grant.id);
    expect(at24).not.toContain("back-ogee");
    expect(at25).toContain("back-ogee");
    expect(at25).toContain("ship-skin-palier-25");
  });

  it("compte les DÉFAITES à part, et non les parties moins les victoires", () => {
    // 200 parties dont 200 victoires : aucune défaite, donc pas de Chat noir.
    const winner = unlockedCollectables({ ...NOTHING, matchesPlayed: 200, wins: 200, losses: 0 }, NONE).map((g) => g.id);
    expect(winner).not.toContain("back-chat-noir");
    const loser = unlockedCollectables({ ...NOTHING, matchesPlayed: 200, wins: 0, losses: 200 }, NONE).map((g) => g.id);
    expect(loser).toContain("back-chat-noir");
    expect(loser).toContain("ship-skin-ombre");
  });

  it("exige TOUTES les cartes d'une condition de maîtrise", () => {
    const craPlage = CARD_BACKS.find((back) => back.id === "back-cra-plage")!;
    expect(craPlage.unlock.kind).toBe("ownsCards");
    const cardIds = craPlage.unlock.kind === "ownsCards" ? craPlage.unlock.cardIds : [];

    const partial = { ...NOTHING, ownedCardIds: cardIds.slice(0, 1) };
    expect(isCosmeticUnlocked(craPlage.unlock, partial, NONE, craPlage.id)).toBe(false);

    const complete = { ...NOTHING, ownedCardIds: [...cardIds, "une-autre-carte"] };
    expect(isCosmeticUnlocked(craPlage.unlock, complete, NONE, craPlage.id)).toBe(true);
  });

  it("ne débloque un achat que s'il est payé — aucun compteur ne l'y amène", () => {
    const rich = { ...NOTHING, level: 100, matchesPlayed: 9999, wins: 9999, losses: 9999, distinctCardsOwned: 9999 };
    expect(unlockedCollectables(rich, NONE).map((grant) => grant.id)).not.toContain("back-abyssal");
    expect(isCosmeticUnlocked({ kind: "purchase", priceTides: 2000 }, rich, new Set(["back-abyssal"]), "back-abyssal")).toBe(true);
  });

  it("annonce ce qu'il reste à faire, et rien quand c'est atteint", () => {
    expect(unlockProgress({ kind: "level", level: 25 }, { ...NOTHING, level: 13 })).toBe("encore 12");
    expect(unlockProgress({ kind: "level", level: 25 }, { ...NOTHING, level: 25 })).toBeNull();
    // Un achat ne se compte pas : il se paie.
    expect(unlockProgress({ kind: "purchase", priceTides: 2000 }, NOTHING)).toBeNull();
  });
});

describe("rayon d'achat", () => {
  it("expose un prix positif pour tout ce qui est en vente, et rien pour le reste", () => {
    const sold = purchasableCollectables();
    expect(sold.length).toBeGreaterThan(0);
    for (const row of sold) {
      expect(row.priceTides, row.item.id).toBeGreaterThan(0);
      expect(collectablePrice(row.kind, row.item.id)).toBe(row.priceTides);
    }
    expect(collectablePrice("cardBack", "default")).toBeNull();
    expect(collectablePrice("cardBack", "carte-qui-nexiste-pas")).toBeNull();
  });

  it("vend des cosmétiques des deux familles", () => {
    const kinds = new Set(purchasableCollectables().map((row) => row.kind));
    expect(kinds.has("cardBack")).toBe(true);
    expect(kinds.has("shipSkin")).toBe(true);
  });
});

describe("cadres de Navire", () => {
  it("place les deux cachés hors de la vitrine tant qu'ils ne sont pas obtenus", () => {
    const hidden = SHIP_FRAMES.filter((frame) => frame.hidden).map((frame) => frame.id);
    expect(hidden).toEqual(["ship-skin-chapardeur", "ship-skin-ombre"]);
  });

  it("couvre les paliers annoncés, jusqu'au-delà du dernier niveau récompensé", () => {
    const levels = SHIP_FRAMES.flatMap((frame) => (frame.unlock.kind === "level" ? [frame.unlock.level] : []));
    expect(levels).toEqual([10, 25, 40, 50, 100]);
  });
});
