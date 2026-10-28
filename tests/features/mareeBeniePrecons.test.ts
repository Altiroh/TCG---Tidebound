import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeDatabase, createFakeClient } from "./fakeSupabase";

/**
 * PRÉCONSTRUITS DE LA MARÉE BÉNIE (28/10/2026).
 *
 * La Communion des Profondeurs (Lot 20) s'achète au Jeton. L'Équipage
 * Félin (Lot 21) est VERROUILLÉ : ses cartes attendent leur illustration
 * (`HELD_BACK_SET`), il se montre au rayon mais ne s'achète pas, n'est pas
 * tiré par le bot et n'est pas semé en base. Le verrou se DÉDUIT des
 * cartes : il n'est écrit nulle part à la main.
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

const { readDeckCatalog, unlockPreconDeck } = await import("@/features/decks/catalogService");
const { resolveMatchDeck } = await import("@/features/decks/matchDeck");
const { PRECON_DECKS, SHOP_DECKS, catalogDeckById, isOpenDeck, shelfOrder, validateDeckList } = await import("@/game");
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

  it("La Communion est au rayon au Jeton, ouverte, et ne joue aucune carte retenue", () => {
    const deck = catalogDeckById(COMMUNION)!;
    expect(deck.offer).toBe("shop");
    expect(isOpenDeck(deck)).toBe(true);
    expect(SHOP_DECKS.some((entry) => entry.id === COMMUNION)).toBe(true);
    const catalogue = new Set(CORE_SET.map((card) => card.id));
    for (const cardId of deck.cardIds) expect(catalogue.has(cardId), cardId).toBe(true);
  });

  it("L'Équipage Félin est verrouillé PARCE QU'il joue des cartes retenues", () => {
    const deck = catalogDeckById(FELINS)!;
    const retenues = new Set(HELD_BACK_SET.map((card) => card.id));
    expect(deck.cardIds.some((cardId) => retenues.has(cardId))).toBe(true);
    expect(deck.offer).toBe("locked");
    expect(isOpenDeck(deck)).toBe(false);
    expect(SHOP_DECKS.some((entry) => entry.id === FELINS)).toBe(false);
    // Après le rayon au Jeton, avant les retirés.
    expect(shelfOrder(deck)).toBeGreaterThan(shelfOrder(catalogDeckById(COMMUNION)!));
    expect(shelfOrder(deck)).toBeLessThan(shelfOrder(catalogDeckById("la-forteresse")!));
  });

  it("le rayon MONTRE l'Équipage Félin, non débloqué", async () => {
    const view = await readDeckCatalog(USER);
    const felins = view.decks.find((entry) => entry.deck.id === FELINS);
    expect(felins).toBeDefined();
    expect(felins!.unlocked).toBe(false);
  });

  it("le serveur refuse de le vendre, sans toucher au Jeton ni appeler la base", async () => {
    const result = await unlockPreconDeck(USER, FELINS);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/pas encore disponible/);
    expect(db.one("player_progression", { user_id: USER })?.precon_tokens).toBe(3);
    expect(db.rpcCalls.some((call) => call.fn === "unlock_precon_deck")).toBe(false);
  });

  it("la base le refuse aussi (migration 20261118120000)", async () => {
    const { data } = await createFakeClient(db).rpc("unlock_precon_deck", { p_user_id: USER, p_deck_id: FELINS });
    expect(data.ok).toBe(false);
  });

  it("La Communion se débloque au Jeton et devient jouable", async () => {
    const result = await unlockPreconDeck(USER, COMMUNION);
    expect(result.ok).toBe(true);
    expect(result.tokens).toBe(2);
    expect((await resolveMatchDeck(USER, COMMUNION)).ok).toBe(true);
    // Le Félin, lui, n'entre pas en partie : personne ne l'a débloqué.
    expect(await resolveMatchDeck(USER, FELINS)).toMatchObject({ ok: false, reason: "locked" });
  });

  it("le seed n'écrit pas le deck verrouillé (ses cartes ne sont pas dans `cards`)", () => {
    expect(systemDeckRows().some((row) => row.id === FELINS)).toBe(false);
    expect(systemDeckCardRows().some((row) => row.system_deck_id === FELINS)).toBe(false);
    expect(systemDeckRows().some((row) => row.id === COMMUNION)).toBe(true);
    const catalogue = new Set(CORE_SET.map((card) => card.id));
    for (const row of systemDeckCardRows()) expect(catalogue.has(row.card_id as string), String(row.card_id)).toBe(true);
  });
});
