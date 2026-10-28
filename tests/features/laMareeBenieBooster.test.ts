import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeDatabase, createFakeClient } from "./fakeSupabase";

/**
 * LA MARÉE BÉNIE (Lots 20 et 21) : le booster de bout en bout, de l'achat
 * à l'ouverture et à la collection, sur la base factice. Définition et
 * slots recopiés de `20261117120000_booster_la_maree_benie.sql`.
 */

const USER = "33333333-3333-3333-3333-333333333333";

const db = new FakeDatabase();

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceRoleClient: () => createFakeClient(db),
  createSupabaseServerClient: () => createFakeClient(db),
}));

vi.mock("@/lib/supabase/sessionUser", () => ({
  getSessionUser: async () => ({ id: USER, email: "joueur@tidebound.test" }),
}));

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { purchaseBooster, openBooster } = await import("@/features/boosters/actions");
const { cardRows, boosterPoolCardRows } = await import("@/scripts/seedRows");
const { BOOSTER_POOLS } = await import("@/game/boosters/pools");
const { rarityForCardId } = await import("@/game/boosters/cardRarity");
const { LA_MAREE_BENIE_SET, LA_MAREE_BENIE_PUBLIEES, LA_MAREE_BENIE_EN_ATTENTE } = await import("@/game/cards/sets/mareeBenie");
const { getCardDefinition } = await import("@/game/cards/sets/core");
const { BOOSTER_SPECIALIZED_PRICE } = await import("@/game/economy/constants");
const { CORE_SET } = await import("@/game/cards/sets/core");

const MAREE = "la-maree-benie";

function seedReferenceData(): void {
  for (const row of cardRows()) db.table("cards").push({ ...row });
  for (const row of boosterPoolCardRows()) db.table("booster_pool_cards").push({ ...row });
  db.table("booster_definitions").push({
    id: MAREE,
    name: "La Marée Bénie",
    card_count: 8,
    price_currency: 150,
    is_purchasable: true,
    is_enabled: true,
  });
  const slots = [
    { slot_index: 1, guaranteed_rarity: "common", weighted_rarities: null },
    { slot_index: 2, guaranteed_rarity: "common", weighted_rarities: null },
    { slot_index: 3, guaranteed_rarity: "common", weighted_rarities: null },
    { slot_index: 4, guaranteed_rarity: "common", weighted_rarities: null },
    { slot_index: 5, guaranteed_rarity: "uncommon", weighted_rarities: null },
    { slot_index: 6, guaranteed_rarity: "uncommon", weighted_rarities: null },
    { slot_index: 7, guaranteed_rarity: null, weighted_rarities: { rare: 85, epic: 12, legendary: 3 } },
    { slot_index: 8, guaranteed_rarity: null, weighted_rarities: { uncommon: 55, rare: 35, abyssal: 10 } },
  ];
  for (const slot of slots) db.table("booster_slots").push({ booster_definition_id: MAREE, ...slot });
}

function crediterTides(montant: number): void {
  db.upsert("player_currency", { user_id: USER, balance: montant }, (row) => {
    row.balance = montant;
  });
}

function crediterBoosters(quantite: number): void {
  db.upsert("player_boosters", { user_id: USER, booster_definition_id: MAREE, quantity: quantite }, (row) => {
    row.quantity = quantite;
  });
}

beforeEach(() => {
  for (const key of Object.keys(db.tables)) delete db.tables[key];
  db.rpcCalls.length = 0;
  seedReferenceData();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

const ABYSSALES = ["amiral-griffenoire-abyssal", "le-grand-bienfaiteur-abyssal"];
/** Les deux sont distribuées depuis l'arrivée des illustrations de l'Équipage Félin (28/10/2026). */
const ABYSSALES_DISTRIBUEES = ABYSSALES;

describe("La Marée Bénie — le pool", () => {
  it("compte 66 cartes et deux Abyssales, dont il distribue celles qui ont leur illustration", () => {
    expect(LA_MAREE_BENIE_SET.filter((def) => def.archetype === "bienfaits-du-fond" && !def.id.endsWith("-abyssal"))).toHaveLength(36);
    expect(LA_MAREE_BENIE_SET.filter((def) => def.archetype === "equipage-felin" && !def.id.endsWith("-abyssal"))).toHaveLength(30);
    expect([...BOOSTER_POOLS[MAREE]!].sort()).toEqual(LA_MAREE_BENIE_PUBLIEES.map((def) => def.id).sort());
    expect(BOOSTER_POOLS[MAREE]!.filter((id) => id.endsWith("-abyssal")).sort()).toEqual(ABYSSALES);
  });

  it("plus aucune carte n'attend son illustration : toutes au catalogue et au pool", () => {
    const retenues = LA_MAREE_BENIE_EN_ATTENTE.map((def) => def.id);
    expect(retenues).toEqual([]);
    for (const def of LA_MAREE_BENIE_SET) {
      expect(CORE_SET.some((card) => card.id === def.id), def.id).toBe(true);
      expect(BOOSTER_POOLS[MAREE], def.id).toContain(def.id);
      expect(getCardDefinition(def.id).id).toBe(def.id);
    }
  });

  it("chaque carte a sa rareté, et les Abyssales sont les seules Abyssales", () => {
    for (const def of LA_MAREE_BENIE_SET) {
      const rarete = rarityForCardId(def.id);
      expect(rarete, def.id).toBeDefined();
      expect(rarete === "abyssal", def.id).toBe(ABYSSALES.includes(def.id));
    }
  });

  it("aucune de ses cartes n'entre dans le pool d'un autre booster", () => {
    const ids = new Set(LA_MAREE_BENIE_SET.map((def) => def.id));
    for (const [boosterId, pool] of Object.entries(BOOSTER_POOLS)) {
      if (boosterId === MAREE) continue;
      expect(pool.filter((id) => ids.has(id)), boosterId).toEqual([]);
    }
  });

  it("ne réemploie aucun identifiant de carte existant", () => {
    const tous = CORE_SET.map((def) => def.id);
    expect(new Set(tous).size).toBe(tous.length);
  });
});

describe("La Marée Bénie — achat, ouverture, collection", () => {
  it("coûte le prix d'un booster spécialisé", async () => {
    expect(BOOSTER_SPECIALIZED_PRICE).toBe(150);
    crediterTides(400);
    const achat = await purchaseBooster(MAREE, 1);
    expect(achat.ok).toBe(true);
    expect(db.one("player_currency", { user_id: USER })!.balance).toBe(250);
  });

  it("rend 8 cartes du pool aux raretés des slots, et les range dans la collection, doublons compris", async () => {
    const pool = new Set(BOOSTER_POOLS[MAREE]);
    const tirees = new Map<string, number>();
    crediterBoosters(10);
    for (let i = 0; i < 10; i++) {
      // Voir La mutation mondiale : la garantie de nouveauté remplacerait un slot.
      db.upsert("player_pity", { user_id: USER, booster_definition_id: MAREE, packs_since_abyssal: 0, packs_since_new_card: 0 }, (row) => {
        row.packs_since_new_card = 0;
      });
      const result = await openBooster(MAREE);
      expect(result.ok).toBe(true);
      const cards = result.data!.cards;
      expect(cards).toHaveLength(8);
      for (const card of cards) {
        expect(pool.has(card.cardId), card.cardId).toBe(true);
        tirees.set(card.cardId, (tirees.get(card.cardId) ?? 0) + 1);
      }
      expect(cards.slice(0, 4).every((c) => c.rarity === "common")).toBe(true);
      expect(cards.slice(4, 6).every((c) => c.rarity === "uncommon")).toBe(true);
    }
    // 80 cartes pour 36 au pool : des doublons, et chaque exemplaire compte.
    expect([...tirees.values()].some((n) => n > 1)).toBe(true);
    for (const [cardId, n] of tirees) expect(db.one("player_cards", { user_id: USER, card_id: cardId })?.quantity, cardId).toBe(n);
  });

  it("au 20e booster sans Abyssale, le pity rend l'une des deux variantes Abyssales", async () => {
    crediterBoosters(1);
    db.upsert("player_pity", { user_id: USER, booster_definition_id: MAREE, packs_since_abyssal: 19, packs_since_new_card: 0 }, (row) => {
      row.packs_since_abyssal = 19;
    });
    const result = await openBooster(MAREE);
    expect(result.ok).toBe(true);
    expect(result.data!.abyssalPulled).toBe(true);
    expect(result.data!.cards.some((c) => ABYSSALES_DISTRIBUEES.includes(c.cardId))).toBe(true);
  });
});
