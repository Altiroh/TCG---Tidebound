import { describe, expect, it } from "vitest";
import {
  CARD_BACKS,
  COLLECTABLE_FAMILIES,
  COSMETIC_SECRETS,
  SHIP_FRAMES,
  collectablePrice,
  collectableTokenPrice,
  collectablesForSecret,
  isCosmeticSecret,
  isCosmeticUnlocked,
  isFree,
  purchasableCollectables,
  unlockLabel,
  unlockProgress,
  unlockedCollectables,
  isArtVeiled,
  isPurchasable,
  isSlotMasked,
} from "@/game";
import { MATCH_STATS } from "@/game/quests";
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
  lifetime: {},
  records: {},
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

describe("secrets de l'interface", () => {
  const RICH: AchievementStats = {
    ...NOTHING,
    level: 100,
    wins: 9999,
    losses: 9999,
    matchesPlayed: 9999,
    boostersOpened: 9999,
    distinctCardsOwned: 9999,
    decksFullyOwned: 99,
  };
  const secretItems = COLLECTABLE_FAMILIES.flatMap((family) => family.items).filter((item) => item.unlock.kind === "secret");

  it("tient un catalogue fermé : seul un nom connu passe la garde", () => {
    expect(COSMETIC_SECRETS).toContain("bougie");
    expect(isCosmeticSecret("bougie")).toBe(true);
    for (const intrus of ["", "Bougie", "back-derniere-chandelle", "__proto__", 42, null, undefined, ["bougie"]]) {
      expect(isCosmeticSecret(intrus), String(intrus)).toBe(false);
    }
  });

  it("donne à chaque secret au moins un Collectable, et rien d'autre ne s'y rattache", () => {
    for (const secret of COSMETIC_SECRETS) {
      expect(collectablesForSecret(secret).length, secret).toBeGreaterThan(0);
    }
    const viaSecrets = COSMETIC_SECRETS.flatMap((secret) => collectablesForSecret(secret).map((grant) => grant.id));
    expect(new Set(viaSecrets)).toEqual(new Set(secretItems.map((item) => item.id)));
  });

  it("la bougie rapporte « Dernière chandelle », un dos caché et équipable", () => {
    expect(collectablesForSecret("bougie")).toEqual([
      { kind: "cardBack", id: "back-derniere-chandelle", label: "Dernière chandelle" },
    ]);
    const item = CARD_BACKS.find((back) => back.id === "back-derniere-chandelle")!;
    expect(item.hidden).toBe(true);
    expect(item.artPending).toBeUndefined();
  });

  it("garde tout Collectable à secret caché — une condition affichée n'est plus un secret", () => {
    expect(secretItems.length).toBeGreaterThan(0);
    for (const item of secretItems) {
      expect(item.hidden, item.id).toBe(true);
      expect(isSlotMasked(item, false), item.id).toBe(true);
      expect(isArtVeiled(item, false), item.id).toBe(true);
      expect(isSlotMasked(item, true), item.id).toBe(false);
    }
  });

  it("ne se déduit d'AUCUN compteur : la synchronisation ne l'accorde jamais", () => {
    const granted = unlockedCollectables(RICH, NONE).map((grant) => grant.id);
    for (const item of secretItems) expect(granted, item.id).not.toContain(item.id);
    for (const item of secretItems) expect(isCosmeticUnlocked(item.unlock, RICH, NONE, item.id), item.id).toBe(false);
  });

  it("ne le retire pas non plus : trouvé une fois, la ligne en base fait foi", () => {
    const found = new Set(secretItems.map((item) => item.id));
    for (const item of secretItems) expect(isCosmeticUnlocked(item.unlock, NOTHING, found, item.id), item.id).toBe(true);
    // Et la synchronisation ne cherche pas à le réécrire : elle ne le rend pas.
    expect(unlockedCollectables(NOTHING, found)).toEqual([]);
  });

  it("n'annonce ni progression ni condition chiffrée", () => {
    expect(unlockProgress({ kind: "secret", secret: "bougie" }, RICH)).toBeNull();
    expect(unlockLabel({ kind: "secret", secret: "bougie" })).toBe("Un secret à découvrir");
  });
});

describe("conditions sur les statistiques à vie", () => {
  const lifetime = { kind: "lifetimeStat", stat: "win_without_deraison", count: 25, label: "25 victoires sans Déraison" } as const;
  const record = { kind: "matchRecord", stat: "max_destroyed_at_once", count: 5, label: "5 unités d'un coup" } as const;

  it("« lifetimeStat » lit le CUMUL à vie, une clé jamais vue valant 0", () => {
    expect(isCosmeticUnlocked(lifetime, NOTHING, NONE, "x")).toBe(false);
    expect(isCosmeticUnlocked(lifetime, { ...NOTHING, lifetime: { win_without_deraison: 24 } }, NONE, "x")).toBe(false);
    expect(isCosmeticUnlocked(lifetime, { ...NOTHING, lifetime: { win_without_deraison: 25 } }, NONE, "x")).toBe(true);
    // Le record d'une partie ne remplace pas le cumul.
    expect(isCosmeticUnlocked(lifetime, { ...NOTHING, records: { win_without_deraison: 99 } }, NONE, "x")).toBe(false);
    expect(unlockLabel(lifetime)).toBe("25 victoires sans Déraison");
    expect(unlockProgress(lifetime, { ...NOTHING, lifetime: { win_without_deraison: 20 } })).toBe("encore 5");
    expect(unlockProgress(lifetime, { ...NOTHING, lifetime: { win_without_deraison: 30 } })).toBeNull();
  });

  it("« matchRecord » lit la MEILLEURE partie, jamais la somme", () => {
    expect(isCosmeticUnlocked(record, { ...NOTHING, lifetime: { max_destroyed_at_once: 12 } }, NONE, "x")).toBe(false);
    expect(isCosmeticUnlocked(record, { ...NOTHING, records: { max_destroyed_at_once: 4 } }, NONE, "x")).toBe(false);
    expect(isCosmeticUnlocked(record, { ...NOTHING, records: { max_destroyed_at_once: 5 } }, NONE, "x")).toBe(true);
    expect(unlockLabel(record)).toBe("5 unités d'un coup");
    expect(unlockProgress(record, { ...NOTHING, records: { max_destroyed_at_once: 3 } })).toBe("record : 3 sur 5");
    expect(unlockProgress(record, NOTHING)).toBe("record : 0 sur 5");
  });

  it("n'appuie aucune condition sur une clé absente du catalogue des statistiques", () => {
    for (const item of COLLECTABLE_FAMILIES.flatMap((family) => family.items)) {
      if (item.unlock.kind !== "lifetimeStat" && item.unlock.kind !== "matchRecord") continue;
      const definition = MATCH_STATS[item.unlock.stat];
      expect(definition, item.id).toBeDefined();
      // Un cumul à vie sur une clé de record additionnerait des maxima.
      if (item.unlock.kind === "lifetimeStat") expect(definition.nature, item.id).toBe("sum");
      expect(item.unlock.count, item.id).toBeGreaterThan(0);
      expect(item.unlock.label.length, item.id).toBeGreaterThan(0);
    }
  });

  it("la synchronisation accorde les dos gagnés sur les statistiques", () => {
    const veteran = {
      ...NOTHING,
      lifetime: { win_without_deraison: 25, lethal_by_ship_ability: 1 },
      records: { max_destroyed_at_once: 5 },
    };
    const granted = unlockedCollectables(veteran, NONE).map((grant) => grant.id);
    expect(granted).toEqual(expect.arrayContaining(["back-rose-de-jade", "back-le-rassemblement", "back-puits-sans-fond"]));
    expect(unlockedCollectables(NOTHING, NONE).map((grant) => grant.id)).not.toContain("back-puits-sans-fond");
  });
});

describe("achat en Jetons de Préconstruit", () => {
  const consigne = CARD_BACKS.find((back) => back.id === "back-la-consigne")!;

  it("« La Consigne » coûte 3 Jetons, et pas un Tide", () => {
    expect(consigne.unlock).toEqual({ kind: "purchaseTokens", priceTokens: 3 });
    expect(collectableTokenPrice("cardBack", "back-la-consigne")).toBe(3);
    expect(collectablePrice("cardBack", "back-la-consigne")).toBeNull();
    expect(collectableTokenPrice("cardBack", "back-abyssal")).toBeNull();
    expect(collectableTokenPrice("cardBack", "carte-qui-nexiste-pas")).toBeNull();
    expect(unlockLabel(consigne.unlock)).toBe("3 Jetons de Préconstruit");
  });

  it("se traite comme un achat : jamais accordé par un compteur, montré en vitrine, sans jauge", () => {
    expect(isPurchasable(consigne.unlock)).toBe(true);
    const rich = { ...NOTHING, level: 100, wins: 9999, matchesPlayed: 9999, distinctCardsOwned: 9999 };
    expect(unlockedCollectables(rich, NONE).map((grant) => grant.id)).not.toContain("back-la-consigne");
    expect(isCosmeticUnlocked(consigne.unlock, NOTHING, new Set(["back-la-consigne"]), consigne.id)).toBe(true);
    expect(isArtVeiled(consigne, false)).toBe(false);
    expect(unlockProgress(consigne.unlock, NOTHING)).toBeNull();
  });
});

describe("dos de carte du 29/09/2026", () => {
  const byId = (id: string) => CARD_BACKS.find((back) => back.id === id);

  it("sont au catalogue avec leur visuel, leur condition et leur visibilité", () => {
    expect(byId("back-oeil-du-maelstrom")).toMatchObject({ label: "Œil du Maelström", unlock: { kind: "purchase", priceTides: 8000 } });
    expect(byId("back-cuirasse-du-leviathan")).toMatchObject({ label: "Cuirasse du Léviathan", unlock: { kind: "purchase", priceTides: 10000 } });
    expect(byId("back-la-consigne")?.label).toBe("La Consigne");
    expect(byId("back-puits-sans-fond")).toMatchObject({ hidden: true, unlock: { kind: "matchRecord", stat: "max_destroyed_at_once", count: 5 } });
    expect(byId("back-le-rassemblement")).toMatchObject({ hidden: true, unlock: { kind: "lifetimeStat", stat: "lethal_by_ship_ability", count: 1 } });
    expect(byId("back-rose-de-jade")).toMatchObject({ unlock: { kind: "lifetimeStat", stat: "win_without_deraison", count: 25 } });
    expect(byId("back-rose-de-jade")?.hidden).toBeUndefined();
    for (const id of ["back-oeil-du-maelstrom", "back-cuirasse-du-leviathan", "back-la-consigne"]) {
      expect(byId(id)?.hidden, id).toBeUndefined();
    }
  });
});
