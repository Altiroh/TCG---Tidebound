import { describe, expect, it } from "vitest";
import { BOOSTER_STANDARD_PRICE } from "@/game/economy/constants";
import {
  PITY,
  RARITY_ORDER,
  RARITY_WEIGHTS,
  RECYCLE_VALUE,
  abyssalChanceWithPity,
  drawBooster,
  type BoosterPoolCard,
  type BoosterSlotRule,
} from "@/game/boosters";

/** Format standard verrouillé : 8 cartes, 4 Communes, 2 Peu communes, 1 Rare, 1 slot Profondeur. */
const STANDARD_SLOTS: BoosterSlotRule[] = [
  { slotIndex: 1, guaranteedRarity: "common" },
  { slotIndex: 2, guaranteedRarity: "common" },
  { slotIndex: 3, guaranteedRarity: "common" },
  { slotIndex: 4, guaranteedRarity: "common" },
  { slotIndex: 5, guaranteedRarity: "uncommon" },
  { slotIndex: 6, guaranteedRarity: "uncommon" },
  { slotIndex: 7, guaranteedRarity: "rare" },
  { slotIndex: 8, weightedRarities: { uncommon: 55, rare: 35, abyssal: 10 } },
];

function makePool(counts = { common: 20, uncommon: 12, rare: 8, abyssal: 4 }): BoosterPoolCard[] {
  const pool: BoosterPoolCard[] = [];
  for (const [rarity, count] of Object.entries(counts)) {
    for (let i = 0; i < count; i++) {
      pool.push({ id: `${rarity}-${i}`, rarity: rarity as BoosterPoolCard["rarity"] });
    }
  }
  return pool;
}

describe("pity Abyssal", () => {
  it("reste à la chance de base pendant les 10 premiers boosters", () => {
    for (let packsSince = 0; packsSince < PITY.rampStartsAfterPacks; packsSince++) {
      expect(abyssalChanceWithPity(packsSince, 0.1)).toBeCloseTo(0.1);
    }
  });

  it("augmente strictement à partir du 11e booster", () => {
    const eleventh = abyssalChanceWithPity(PITY.rampStartsAfterPacks, 0.1);
    expect(eleventh).toBeGreaterThan(0.1);

    let previous = eleventh;
    for (let packsSince = PITY.rampStartsAfterPacks + 1; packsSince < PITY.guaranteeAtPack - 1; packsSince++) {
      const chance = abyssalChanceWithPity(packsSince, 0.1);
      expect(chance).toBeGreaterThan(previous);
      previous = chance;
    }
  });

  it("garantit l'Abyssale au 20e booster et au-delà", () => {
    expect(abyssalChanceWithPity(PITY.guaranteeAtPack - 1, 0.1)).toBe(1);
    expect(abyssalChanceWithPity(PITY.guaranteeAtPack + 5, 0.1)).toBe(1);
  });

  it("garantit réellement une Abyssale dans le tirage au 20e booster, quelle que soit la graine", () => {
    const pool = makePool();
    for (let seed = 0; seed < 40; seed++) {
      const result = drawBooster({
        slots: STANDARD_SLOTS,
        pool,
        ownedCardIds: new Set(),
        packsSinceAbyssal: PITY.guaranteeAtPack - 1,
        seed,
      });
      expect(result.abyssalPulled).toBe(true);
      expect(result.nextPacksSinceAbyssal).toBe(0);
    }
  });
});

describe("format du booster", () => {
  it("produit exactement une carte par slot, avec les raretés garanties", () => {
    const pool = makePool();
    const result = drawBooster({ slots: STANDARD_SLOTS, pool, ownedCardIds: new Set(), packsSinceAbyssal: 0, seed: 1234 });

    expect(result.cards).toHaveLength(8);
    expect(result.cards.map((c) => c.slotIndex)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(result.cards.slice(0, 4).every((c) => c.rarity === "common")).toBe(true);
    expect(result.cards.slice(4, 6).every((c) => c.rarity === "uncommon")).toBe(true);
    expect(result.cards[6]!.rarity).toBe("rare");
    expect(["uncommon", "rare", "abyssal"]).toContain(result.cards[7]!.rarity);
  });

  it("est déterministe pour une même graine, et varie avec la graine", () => {
    const pool = makePool();
    const input = { slots: STANDARD_SLOTS, pool, ownedCardIds: new Set<string>(), packsSinceAbyssal: 0 };

    const a = drawBooster({ ...input, seed: 42 });
    const b = drawBooster({ ...input, seed: 42 });
    const c = drawBooster({ ...input, seed: 43 });

    expect(a.cards).toEqual(b.cards);
    expect(a.cards).not.toEqual(c.cards);
  });

  it("incrémente le compteur de pity quand aucune Abyssale ne sort, et le remet à zéro sinon", () => {
    const noAbyssalPool = makePool({ common: 20, uncommon: 12, rare: 8, abyssal: 0 });
    const withoutAbyssal = drawBooster({
      slots: STANDARD_SLOTS,
      pool: noAbyssalPool,
      ownedCardIds: new Set(),
      packsSinceAbyssal: 3,
      seed: 7,
    });
    expect(withoutAbyssal.abyssalPulled).toBe(false);
    expect(withoutAbyssal.nextPacksSinceAbyssal).toBe(4);
  });
});

describe("protection Abyssale", () => {
  it("privilégie une Abyssale non possédée", () => {
    const pool = makePool({ common: 5, uncommon: 5, rare: 5, abyssal: 3 });
    const owned = new Set(["abyssal-0", "abyssal-1"]);

    // Pity au maximum : l'Abyssale est garantie, on observe donc laquelle sort.
    for (let seed = 0; seed < 25; seed++) {
      const result = drawBooster({
        slots: STANDARD_SLOTS,
        pool,
        ownedCardIds: owned,
        packsSinceAbyssal: PITY.guaranteeAtPack - 1,
        seed,
      });
      const abyssals = result.cards.filter((c) => c.rarity === "abyssal");
      expect(abyssals.length).toBeGreaterThan(0);
      expect(abyssals.some((c) => c.cardId === "abyssal-2")).toBe(true);
    }
  });

  it("retombe sur un tirage normal quand toutes les Abyssales sont déjà possédées", () => {
    const pool = makePool({ common: 5, uncommon: 5, rare: 5, abyssal: 2 });
    const owned = new Set(["abyssal-0", "abyssal-1"]);

    const result = drawBooster({
      slots: STANDARD_SLOTS,
      pool,
      ownedCardIds: owned,
      packsSinceAbyssal: PITY.guaranteeAtPack - 1,
      seed: 99,
    });

    const abyssals = result.cards.filter((c) => c.rarity === "abyssal");
    expect(abyssals.length).toBeGreaterThan(0);
    expect(abyssals.every((c) => owned.has(c.cardId))).toBe(true);
    expect(abyssals.every((c) => c.isNew === false)).toBe(true);
  });

  it("marque correctement les cartes nouvelles", () => {
    const pool = makePool({ common: 1, uncommon: 1, rare: 1, abyssal: 1 });
    const result = drawBooster({
      slots: STANDARD_SLOTS,
      pool,
      ownedCardIds: new Set(["common-0"]),
      packsSinceAbyssal: 0,
      seed: 5,
    });

    // `common-0` est la seule Commune du pool : le premier slot la donne en
    // doublon, les suivants aussi — aucune ne doit être marquée "nouvelle".
    expect(result.cards.filter((c) => c.cardId === "common-0").every((c) => c.isNew === false)).toBe(true);
    // Une carte tirée deux fois dans le MÊME booster n'est nouvelle qu'une fois.
    const newIds = result.cards.filter((c) => c.isNew).map((c) => c.cardId);
    expect(new Set(newIds).size).toBe(newIds.length);
  });
});

describe("pool par booster", () => {
  /**
   * Mini Booster de Bienvenue : 2 Communes, 1 Peu commune, 1 slot Rare ou
   * mieux — et Abyssales EXCLUES du pool (décision de design 2026-09-12,
   * déjà présente au cadrage). L'exclusion se fait en amont, en filtrant le
   * pool passé au tirage (cf. `openBooster`).
   */
  const WELCOME_SLOTS: BoosterSlotRule[] = [
    { slotIndex: 1, guaranteedRarity: "common" },
    { slotIndex: 2, guaranteedRarity: "common" },
    { slotIndex: 3, guaranteedRarity: "uncommon" },
    { slotIndex: 4, guaranteedRarity: "rare" },
  ];

  it("ne sort jamais d'Abyssale quand le palier est retiré du pool, même pity au maximum", () => {
    const poolWithoutAbyssal = makePool().filter((card) => card.rarity !== "abyssal");

    for (let seed = 0; seed < 50; seed++) {
      const result = drawBooster({
        slots: WELCOME_SLOTS,
        pool: poolWithoutAbyssal,
        ownedCardIds: new Set(),
        packsSinceAbyssal: PITY.guaranteeAtPack - 1,
        seed,
      });

      expect(result.cards).toHaveLength(4);
      expect(result.cards.every((c) => c.rarity !== "abyssal")).toBe(true);
      expect(result.abyssalPulled).toBe(false);
    }
  });

  it("un booster standard n'a PAS systématiquement d'Abyssale", () => {
    // Le slot Profondeur est à 10% : la grande majorité des boosters doit
    // en être dépourvue. Garde-fou contre une régression qui rendrait
    // l'Abyssale banale (repli de rareté trop permissif, pity mal borné).
    const pool = makePool();
    let withAbyssal = 0;
    const draws = 200;

    for (let seed = 0; seed < draws; seed++) {
      const result = drawBooster({
        slots: STANDARD_SLOTS,
        pool,
        ownedCardIds: new Set(),
        // Compteur neuf à chaque tirage : on mesure la chance de BASE,
        // sans renforcement.
        packsSinceAbyssal: 0,
        seed,
      });
      if (result.abyssalPulled) withAbyssal += 1;
    }

    expect(withAbyssal).toBeGreaterThan(0);
    expect(withAbyssal / draws).toBeLessThan(0.3);
  });
});

describe("robustesse du pool", () => {
  it("remplit tous les slots même si un palier est vide", () => {
    const pool = makePool({ common: 10, uncommon: 0, rare: 0, abyssal: 0 });
    const result = drawBooster({ slots: STANDARD_SLOTS, pool, ownedCardIds: new Set(), packsSinceAbyssal: 0, seed: 3 });

    expect(result.cards).toHaveLength(8);
    expect(result.cards.every((c) => c.rarity === "common")).toBe(true);
  });

  it("ne rend aucune carte si le pool est entièrement vide, sans planter", () => {
    const result = drawBooster({ slots: STANDARD_SLOTS, pool: [], ownedCardIds: new Set(), packsSinceAbyssal: 0, seed: 3 });
    expect(result.cards).toEqual([]);
  });
});

describe("valeurs verrouillées par le cadrage", () => {
  it("conserve les quatre poids de palier verrouillés", () => {
    // Épique et Légendaire sont arrivés avec le Lot 11 : ils s'ajoutent
    // SANS toucher aux quatre poids que le cadrage verrouille.
    expect(RARITY_WEIGHTS.common).toBe(55);
    expect(RARITY_WEIGHTS.uncommon).toBe(28);
    expect(RARITY_WEIGHTS.rare).toBe(12);
    expect(RARITY_WEIGHTS.abyssal).toBe(5);
  });

  it("intercale Épique et Légendaire entre Rare et Abyssale", () => {
    expect(RARITY_ORDER).toEqual(["common", "uncommon", "rare", "epic", "legendary", "abyssal"]);
    // Plus rare que Rare, moins fréquent d'un palier au suivant.
    expect(RARITY_WEIGHTS.epic).toBeLessThan(RARITY_WEIGHTS.rare);
    expect(RARITY_WEIGHTS.legendary).toBeLessThan(RARITY_WEIGHTS.epic);
  });

  it("garde les valeurs de recyclage très inférieures au prix d'un booster", () => {
    // Repère : les VALEURS DE TRAVAIL du cadrage (5 / 15 / 45 / 120), et
    // non plus ses ratios. Les ratios avaient été retenus quand le booster
    // est passé de 500 à 100 Tides, ce qui divisait du même coup toutes les
    // valeurs par cinq : une Commune tombait à 1 Tide, une somme que
    // personne ne traverse un écran pour encaisser. La Commune revaut donc
    // les 5 Tides du cadrage.
    expect(RECYCLE_VALUE.common).toBe(5);
    // Rare et Abyssale restent EN DESSOUS de leur valeur de travail (45 et
    // 120) : à 120, une seule Abyssale rembourserait plus qu'un booster à
    // 100 — exactement la boucle autosuffisante que le cadrage interdit.
    expect(RECYCLE_VALUE.rare).toBeLessThan(45);
    expect(RECYCLE_VALUE.abyssal).toBeLessThan(120);
    // La règle qui compte : jamais de boucle d'ouverture autosuffisante.
    expect(RECYCLE_VALUE.abyssal).toBeLessThan(BOOSTER_STANDARD_PRICE / 2);
    // Monotone : un palier plus rare ne peut jamais recycler pour moins.
    const values = RARITY_ORDER.map((rarity) => RECYCLE_VALUE[rarity]);
    expect(values).toEqual([...values].sort((a, b) => a - b));
    // Le recyclage reste un amortisseur de doublons, pas une boucle
    // autosuffisante : il ne doit jamais approcher le prix d'un booster.
    expect(Math.max(...values)).toBeLessThan(BOOSTER_STANDARD_PRICE);
  });
});

describe("garantie de nouveauté (17/09/2026)", () => {
  /** Un booster d'un seul slot commun, et un pool où la seule nouveauté est Légendaire. */
  const slots = [{ slotIndex: 0, guaranteedRarity: "common" as const, weightedRarities: null }];
  const pool = [
    { id: "commune-possedee", rarity: "common" as const },
    { id: "legendaire-manquante", rarity: "legendary" as const },
  ];
  const owned = new Set(["commune-possedee"]);

  it("sans compteur au bout, le booster peut ne rien apporter de neuf", () => {
    const draw = drawBooster({ slots, pool, ownedCardIds: owned, packsSinceAbyssal: 0, packsSinceNewCard: 0, seed: 7 });
    expect(draw.cards.map((card) => card.cardId)).toEqual(["commune-possedee"]);
    expect(draw.newCardPulled).toBe(false);
    expect(draw.nextPacksSinceNewCard).toBe(1);
  });

  it("au seuil, une carte manquante est garantie quelle que soit sa rareté", () => {
    const draw = drawBooster({
      slots,
      pool,
      ownedCardIds: owned,
      packsSinceAbyssal: 0,
      packsSinceNewCard: PITY.newCardGuaranteeAfterPacks,
      seed: 7,
    });
    expect(draw.cards.map((card) => card.cardId)).toEqual(["legendaire-manquante"]);
    expect(draw.cards[0]!.rarity).toBe("legendary");
    expect(draw.cards[0]!.isNew).toBe(true);
    expect(draw.newCardPulled).toBe(true);
    // Compteur remis à zéro : la garantie ne se redéclenche pas au booster suivant.
    expect(draw.nextPacksSinceNewCard).toBe(0);
  });

  it("un booster qui apporte déjà une nouveauté ne déclenche pas la garantie", () => {
    const draw = drawBooster({
      slots,
      pool: [{ id: "commune-manquante", rarity: "common" as const }],
      ownedCardIds: owned,
      packsSinceAbyssal: 0,
      packsSinceNewCard: PITY.newCardGuaranteeAfterPacks,
      seed: 7,
    });
    expect(draw.cards.map((card) => card.cardId)).toEqual(["commune-manquante"]);
    expect(draw.nextPacksSinceNewCard).toBe(0);
  });

  it("collection complète : la garantie ne peut rien forcer et n'invente rien", () => {
    const draw = drawBooster({
      slots,
      pool: [{ id: "commune-possedee", rarity: "common" as const }],
      ownedCardIds: owned,
      packsSinceAbyssal: 0,
      packsSinceNewCard: 99,
      seed: 7,
    });
    expect(draw.cards.map((card) => card.cardId)).toEqual(["commune-possedee"]);
    expect(draw.newCardPulled).toBe(false);
  });
});
