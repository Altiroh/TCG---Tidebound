import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeDatabase, createFakeClient } from "./fakeSupabase";

/**
 * PRÉCONSTRUITS DE LA MARÉE BÉNIE (28/10/2026).
 *
 * La Communion des Profondeurs (Lot 20) et L'Équipage Félin (Lot 21)
 * s'achètent au Jeton. Le second a d'abord été VERROUILLÉ tant que ses
 * cartes attendaient leur illustration : le verrou se DÉDUIT des cartes
 * (`deckOfferFor`), il n'est écrit nulle part à la main.
 */

const USER = "11111111-1111-1111-1111-111111111111";
const COMMUNION = "la-communion-des-profondeurs";
const FELINS = "l-equipage-felin";

const db = new FakeDatabase();

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceRoleClient: () => createFakeClient(db),
  createSupabaseServerClient: () => createFakeClient(db),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { unlockPreconDeck } = await import("@/features/decks/catalogService");
const { resolveMatchDeck } = await import("@/features/decks/matchDeck");
const { PRECON_DECKS, SHOP_DECKS, catalogDeckById, isOpenDeck, shelfOrder, validateDeckList } = await import("@/game");
const { deckOfferFor } = await import("@/game/cards/decks/catalog");
const { HELD_BACK_SET, CORE_SET } = await import("@/game/cards/sets/core");
const { systemDeckRows, systemDeckCardRows } = await import("@/scripts/seedRows");

beforeEach(() => {
  for (const key of Object.keys(db.tables)) delete db.tables[key];
  db.rpcCalls.length = 0;
  db.beforeRpc = null;
  db.table("player_progression").push({ user_id: USER, xp_total: 0, level: 1, precon_tokens: 3 });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("La Marée Bénie — les deux préconstruits", () => {
  it("sont valides, de 40 cartes, et passent AVANT les starters", () => {
    for (const id of [COMMUNION, FELINS]) {
      const deck = catalogDeckById(id)!;
      expect(deck, id).toBeDefined();
      expect(deck.cardIds).toHaveLength(40);
      expect(validateDeckList(deck).ok, id).toBe(true);
    }
    expect(PRECON_DECKS.slice(-3).every((deck) => deck.offer === "starter")).toBe(true);
  });

  it("sont au rayon au Jeton, ouverts, et ne jouent que des cartes du catalogue", () => {
    expect(HELD_BACK_SET).toEqual([]);
    const catalogue = new Set(CORE_SET.map((card) => card.id));
    for (const id of [COMMUNION, FELINS]) {
      const deck = catalogDeckById(id)!;
      expect(deck.offer, id).toBe("shop");
      expect(isOpenDeck(deck), id).toBe(true);
      expect(SHOP_DECKS.some((entry) => entry.id === id), id).toBe(true);
      for (const cardId of deck.cardIds) expect(catalogue.has(cardId), cardId).toBe(true);
    }
  });

  it("le verrou se DÉDUIT des cartes : une carte retenue suffit, et il s'en va avec elle", () => {
    const deck = catalogDeckById(FELINS)!;
    expect(deckOfferFor(deck, new Set(["mousse-patapouf"]))).toBe("locked");
    expect(deckOfferFor(deck, new Set())).toBe("shop");
    // Un starter reste un starter, un retiré reste retiré.
    const starter = catalogDeckById("le-rempart-vivant")!;
    expect(deckOfferFor(starter, new Set([starter.cardIds[0]!]))).toBe("starter");
    expect(deckOfferFor(catalogDeckById("la-forteresse")!, new Set())).toBe("retired");
    // Un verrouillé reste au rayon, entre le Jeton et les retirés, et n'est pas ouvert.
    const verrouille = { ...deck, offer: "locked" as const };
    expect(shelfOrder(verrouille)).toBeGreaterThan(shelfOrder(catalogDeckById(COMMUNION)!));
    expect(shelfOrder(verrouille)).toBeLessThan(shelfOrder(catalogDeckById("la-forteresse")!));
    expect(isOpenDeck(verrouille)).toBe(false);
  });

  it("chacun se débloque au Jeton et devient jouable", async () => {
    expect(await unlockPreconDeck(USER, COMMUNION)).toMatchObject({ ok: true, tokens: 2 });
    expect(await unlockPreconDeck(USER, FELINS)).toMatchObject({ ok: true, tokens: 1 });
    expect((await resolveMatchDeck(USER, COMMUNION)).ok).toBe(true);
    expect((await resolveMatchDeck(USER, FELINS)).ok).toBe(true);
  });

  it("la base vend aussi L'Équipage Félin (migration 20261119120000)", async () => {
    const { data } = await createFakeClient(db).rpc("unlock_precon_deck", { p_user_id: USER, p_deck_id: FELINS });
    expect(data.ok).toBe(true);
  });

  it("le seed écrit les deux decks, et seulement des cartes de la table `cards`", () => {
    for (const id of [COMMUNION, FELINS]) expect(systemDeckRows().some((row) => row.id === id), id).toBe(true);
    const catalogue = new Set(CORE_SET.map((card) => card.id));
    for (const row of systemDeckCardRows()) expect(catalogue.has(row.card_id as string), String(row.card_id)).toBe(true);
  });
});
