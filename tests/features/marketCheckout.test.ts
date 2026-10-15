import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeDatabase, createFakeClient } from "./fakeSupabase";

/**
 * PANIER DU MARKET — `checkoutCart`, un seul appel pour tout le panier.
 *
 * Il doit faire EXACTEMENT ce que faisaient les achats unitaires appelés
 * ligne par ligne depuis le navigateur : boosters, puis decks, puis
 * cosmétiques, chacun par sa fonction atomique en base, arrêt au premier
 * refus — et ne revalider qu'une fois à la fin. La base est la
 * transcription en mémoire des migrations (`fakeSupabase.ts`) : on vérifie
 * les lignes réellement écrites, pas seulement le récapitulatif.
 */

const USER = "11111111-1111-1111-1111-111111111111";

const db = new FakeDatabase();
let sessionUserId: string | null = USER;
const revalidated: string[] = [];

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceRoleClient: () => createFakeClient(db),
  createSupabaseServerClient: () => createFakeClient(db),
}));
vi.mock("@/lib/supabase/sessionUser", () => ({
  getSessionUser: async () => (sessionUserId ? { id: sessionUserId, email: "joueur@tidebound.test" } : null),
}));
vi.mock("next/cache", () => ({ revalidatePath: (path: string) => void revalidated.push(path) }));

const { checkoutCart } = await import("@/features/market/actions");
const { PRECON_DECKS, purchasableCollectables } = await import("@/game");

const DECK_A = PRECON_DECKS[0]!.id;
const DECK_B = PRECON_DECKS[1]!.id;
const COSMETIC = purchasableCollectables()[0]!;

beforeEach(() => {
  for (const key of Object.keys(db.tables)) delete db.tables[key];
  db.rpcCalls.length = 0;
  db.beforeRpc = null;
  revalidated.length = 0;
  sessionUserId = USER;
  db.table("booster_definitions").push({ id: "standard", name: "Booster Défaut", card_count: 8, price_currency: 100, is_purchasable: true, is_enabled: true });
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("checkoutCart", () => {
  it("panier complet : tout est acheté dans l'ordre, une seule revalidation par écran", async () => {
    db.table("player_currency").push({ user_id: USER, balance: 1000 + COSMETIC.priceTides });
    db.table("player_progression").push({ user_id: USER, xp_total: 0, level: 1, precon_tokens: 2 });

    const result = await checkoutCart({
      boosters: [{ boosterId: "standard", quantity: 3 }],
      decks: [DECK_A, DECK_B],
      cosmetics: [{ kind: COSMETIC.kind, id: COSMETIC.item.id }],
    });

    expect(result.error).toBeUndefined();
    expect(result.ok).toBe(true);
    expect(result.bought).toEqual({ boosters: 3, decks: 2, cosmetics: 1, tides: 300 + COSMETIC.priceTides, tokens: 2 });
    expect(result.remaining).toEqual({ boosters: [], decks: [], cosmetics: [] });
    expect(result.purchased.decks).toEqual([DECK_A, DECK_B]);

    // Les écritures réelles : stock, déblocages, cosmétique, soldes.
    expect(db.one("player_boosters", { user_id: USER, booster_definition_id: "standard" })!.quantity).toBe(3);
    expect(db.where("player_deck_unlocks", { user_id: USER }).map((row) => row.deck_id)).toEqual([DECK_A, DECK_B]);
    expect(db.one("player_cosmetics", { user_id: USER, cosmetic_id: COSMETIC.item.id })).toBeTruthy();
    expect(db.one("player_currency", { user_id: USER })!.balance).toBe(700);
    expect(db.one("player_progression", { user_id: USER })!.precon_tokens).toBe(0);

    // Mêmes fonctions que les achats unitaires, dans le même ordre.
    const purchases = db.rpcCalls.map((call) => call.fn).filter((fn) => ["purchase_booster", "unlock_precon_deck", "purchase_cosmetic"].includes(fn));
    expect(purchases).toEqual(["purchase_booster", "unlock_precon_deck", "unlock_precon_deck", "purchase_cosmetic"]);
    // Le prix du cosmétique vient du catalogue, jamais du navigateur.
    expect(db.rpcCalls.find((call) => call.fn === "purchase_cosmetic")?.args.p_price).toBe(COSMETIC.priceTides);

    // Une seule revalidation par écran touché, pas une par article.
    expect(new Set(revalidated).size).toBe(revalidated.length);
    expect([...revalidated].sort()).toEqual(["/boosters", "/collectables", "/decks", "/market", "/partie"]);
  });

  it("échec au milieu : arrêt net, rien après le refus, lignes restantes rendues", async () => {
    db.table("player_currency").push({ user_id: USER, balance: 1000 });
    // Un seul Jeton pour deux decks : le second est refusé.
    db.table("player_progression").push({ user_id: USER, xp_total: 0, level: 1, precon_tokens: 1 });

    const cosmetics = [{ kind: COSMETIC.kind, id: COSMETIC.item.id }];
    const result = await checkoutCart({
      boosters: [{ boosterId: "standard", quantity: 2 }],
      decks: [DECK_A, DECK_B],
      cosmetics,
    });

    expect(result.ok).toBe(false);
    expect(result.error).toBe("Aucun Jeton de Préconstruit disponible.");
    expect(result.bought).toEqual({ boosters: 2, decks: 1, cosmetics: 0, tides: 200, tokens: 1 });
    expect(result.purchased).toEqual({ boosters: [{ boosterId: "standard", quantity: 2 }], decks: [DECK_A], cosmetics: [] });
    // Le deck refusé ET tout ce qui suit restent à acheter.
    expect(result.remaining).toEqual({ boosters: [], decks: [DECK_B], cosmetics });

    // Le cosmétique n'a même pas été tenté : rien de débité pour lui.
    expect(db.rpcCalls.some((call) => call.fn === "purchase_cosmetic")).toBe(false);
    expect(db.one("player_currency", { user_id: USER })!.balance).toBe(800);
    expect(db.one("player_cosmetics", { user_id: USER, cosmetic_id: COSMETIC.item.id })).toBeUndefined();

    // Ce qui est parti est revalidé, une fois.
    expect([...revalidated].sort()).toEqual(["/boosters", "/decks", "/market", "/partie"]);
  });

  it("premier article refusé : rien d'acheté, rien de revalidé", async () => {
    db.table("player_currency").push({ user_id: USER, balance: 50 });

    const cart = { boosters: [{ boosterId: "standard", quantity: 1 }], decks: [DECK_A], cosmetics: [] };
    const result = await checkoutCart(cart);

    expect(result).toMatchObject({ ok: false, error: "Solde de Tides insuffisant.", remaining: cart });
    expect(result.bought).toEqual({ boosters: 0, decks: 0, cosmetics: 0, tides: 0, tokens: 0 });
    expect(db.rpcCalls.some((call) => call.fn === "unlock_precon_deck")).toBe(false);
    expect(revalidated).toEqual([]);
  });

  it("refuse un panier mal formé et un joueur sans session, sans rien appeler", async () => {
    expect(await checkoutCart({ boosters: "tout", decks: [], cosmetics: [] } as never)).toMatchObject({ ok: false, error: "Panier invalide." });

    sessionUserId = null;
    expect(await checkoutCart({ boosters: [{ boosterId: "standard", quantity: 1 }], decks: [], cosmetics: [] })).toMatchObject({
      ok: false,
      error: "Connecte-toi pour acheter un booster.",
    });
    expect(db.rpcCalls).toEqual([]);
  });
});
