import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeDatabase, createFakeClient } from "./fakeSupabase";

/**
 * LA MUTATION MONDIALE (Lot 16 — Les Altérés) : le booster de bout en bout,
 * de l'achat à l'ouverture, sur la base factice. Définition et slots
 * recopiés de `20261024120000_booster_la_mutation_mondiale.sql`.
 */

const USER = "22222222-2222-2222-2222-222222222222";

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
const { BOOSTER_SPECIALIZED_PRICE } = await import("@/game/economy/constants");
const { CORE_SET } = await import("@/game/cards/sets/core");

const MUTATION = "la-mutation-mondiale";

function seedReferenceData(): void {
  for (const row of cardRows()) db.table("cards").push({ ...row });
  for (const row of boosterPoolCardRows()) db.table("booster_pool_cards").push({ ...row });
  db.table("booster_definitions").push({
    id: MUTATION,
    name: "La mutation mondiale",
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
  for (const slot of slots) db.table("booster_slots").push({ booster_definition_id: MUTATION, ...slot });
}

function crediterTides(montant: number): void {
  db.upsert("player_currency", { user_id: USER, balance: montant }, (row) => {
    row.balance = montant;
  });
}

function crediterBoosters(quantite: number): void {
  db.upsert("player_boosters", { user_id: USER, booster_definition_id: MUTATION, quantity: quantite }, (row) => {
    row.quantity = quantite;
  });
}

beforeEach(() => {
  for (const key of Object.keys(db.tables)) delete db.tables[key];
  db.rpcCalls.length = 0;
  seedReferenceData();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("La mutation mondiale — le pool", () => {
  it("porte les cartes du Lot 16 et elles seules", () => {
    const lot = CORE_SET.filter((def) => def.setCode === MUTATION).map((def) => def.id);
    expect(lot.length).toBeGreaterThanOrEqual(20);
    expect([...BOOSTER_POOLS[MUTATION]!].sort()).toEqual([...lot].sort());
  });

  it("a ses propres Abyssales, et L'Anomalie Première y reste Légendaire", () => {
    expect(BOOSTER_POOLS[MUTATION]!.filter((id) => id.endsWith("-abyssal")).sort()).toEqual([
      "la-chute-de-lange-abyssal",
      "le-diable-en-personne-abyssal",
    ]);
    expect(BOOSTER_POOLS[MUTATION]).toContain("lanomalie-premiere");
  });
});

describe("La mutation mondiale — achat et ouverture", () => {
  it("coûte le prix d'un booster spécialisé", async () => {
    expect(BOOSTER_SPECIALIZED_PRICE).toBe(150);
    crediterTides(400);
    const achat = await purchaseBooster(MUTATION, 1);
    expect(achat.ok).toBe(true);
    expect(db.one("player_currency", { user_id: USER })!.balance).toBe(250);
  });

  it("rend 8 cartes, toutes du pool, aux raretés annoncées par les slots", async () => {
    const pool = new Set(BOOSTER_POOLS[MUTATION]);
    crediterBoosters(10);
    for (let i = 0; i < 10; i++) {
      const result = await openBooster(MUTATION);
      expect(result.ok).toBe(true);
      const cards = result.data!.cards;
      expect(cards).toHaveLength(8);
      for (const card of cards) expect(pool.has(card.cardId), card.cardId).toBe(true);
      expect(cards.slice(0, 4).every((c) => c.rarity === "common")).toBe(true);
      expect(cards.slice(4, 6).every((c) => c.rarity === "uncommon")).toBe(true);
    }
  });

  it("au 20e booster sans Abyssale, le pity rend l'une des deux variantes Abyssales", async () => {
    crediterBoosters(1);
    db.upsert("player_pity", { user_id: USER, booster_definition_id: MUTATION, packs_since_abyssal: 19, packs_since_new_card: 0 }, (row) => {
      row.packs_since_abyssal = 19;
    });
    const result = await openBooster(MUTATION);
    expect(result.ok).toBe(true);
    expect(result.data!.abyssalPulled).toBe(true);
    const ids = result.data!.cards.map((c) => c.cardId);
    expect(ids.some((id) => id === "la-chute-de-lange-abyssal" || id === "le-diable-en-personne-abyssal")).toBe(true);
  });
});
