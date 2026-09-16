import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SERVICES SERVEUR — comportement quand la base ne répond pas.
 *
 * Ces modules partagent une promesse : ils ne LÈVENT jamais. Une lecture
 * refusée, une clé de service absente, une migration en retard ne doivent
 * jamais casser l'écran qui les appelle ni faire échouer le coup de jeu qui
 * vient d'être joué — ils dégradent, et l'écran affiche un état vide plutôt
 * qu'une page blanche.
 *
 * Rien ne le vérifiait : aucun de ces huit services n'avait de test. C'est
 * pourtant la propriété dont tout le reste dépend, et la plus facile à
 * casser en ajoutant un `await` sans `try`.
 */

/** Ce que la base répondra : normal, en erreur, ou en levant. */
let mode: "ok" | "error" | "throw" = "ok";
/** Lignes rendues par une lecture de table, par table. */
const rows: Record<string, unknown[]> = {};
/** Réponse des appels RPC, par nom de fonction. */
const rpcResults: Record<string, unknown> = {};
const rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];

function fakeClient() {
  if (mode === "throw") throw new Error("clé de service absente");

  const table = (name: string) => {
    const builder = {
      select: () => builder,
      eq: () => builder,
      gt: () => builder,
      in: () => builder,
      order: () => builder,
      limit: () => builder,
      maybeSingle: () => Promise.resolve(response(name, true)),
      single: () => Promise.resolve(response(name, true)),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(response(name, false)).then(resolve),
    };
    return builder;
  };

  const response = (name: string, single: boolean) =>
    mode === "error"
      ? { data: null, error: { message: "base injoignable" }, count: null }
      : { data: single ? ((rows[name] ?? [])[0] ?? null) : (rows[name] ?? []), error: null, count: (rows[name] ?? []).length };

  return {
    from: table,
    rpc: (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push({ fn, args });
      return Promise.resolve(
        mode === "error"
          ? { data: null, error: { message: "fonction refusée" } }
          : { data: rpcResults[fn] ?? { ok: true }, error: null }
      );
    },
  };
}

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceRoleClient: () => fakeClient(),
  createSupabaseServerClient: () => fakeClient(),
}));

const { readDeckCatalog } = await import("@/features/decks/catalogService");
const { loadCardBacks, equipCardBackFor } = await import("@/features/cosmetics/cardBackService");
const { readAchievementStats } = await import("@/features/achievements/achievementService");
const { recordMatchQuestProgress, ensureCurrentQuests } = await import("@/features/quests/questService");
const { recycleCardFor, recycleSurplusFor } = await import("@/features/collection/recycleService");
const { readLoginRewards } = await import("@/features/progression/loginService");
const { createGameState } = await import("@/game/state/createGameState");
const { PLAYABLE_DECKS } = await import("@/game/cards/decks/testDecks");
const { DEFAULT_CARD_BACK_ID } = await import("@/game");

const USER = "11111111-1111-1111-1111-111111111111";

beforeEach(() => {
  mode = "ok";
  for (const key of Object.keys(rows)) delete rows[key];
  for (const key of Object.keys(rpcResults)) delete rpcResults[key];
  rpcCalls.length = 0;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

/** Chaque cas est joué dans les trois régimes : normal, erreur, exception. */
const REGIMES: ("ok" | "error" | "throw")[] = ["ok", "error", "throw"];

describe("catalogue de decks", () => {
  it.each(REGIMES)("rend toujours le catalogue complet (base : %s)", async (regime) => {
    mode = regime;
    const catalog = await readDeckCatalog(USER);
    // Le catalogue est du CODE, pas de la base : il doit sortir entier même
    // quand plus rien ne répond — sinon l'écran Decks se vide.
    expect(catalog.borrowed.length).toBeGreaterThan(0);
    expect(catalog.precon.length).toBeGreaterThan(0);
    expect(catalog.preconTokens).toBe(0);
    expect(catalog.borrowedDeckId).toBeNull();
  });

  it("hors connexion, ne consulte pas la base du tout", async () => {
    mode = "throw";
    const catalog = await readDeckCatalog(null);
    expect(catalog.borrowed.length).toBeGreaterThan(0);
  });
});

describe("dos de carte", () => {
  it.each(REGIMES)("rend le catalogue et un dos équipé valide (base : %s)", async (regime) => {
    mode = regime;
    const collection = await loadCardBacks(USER);
    expect(collection.options.length).toBeGreaterThan(0);
    expect(collection.equipped).toBe(DEFAULT_CARD_BACK_ID);
  });

  it("refuse un dos inconnu sans appeler la base", async () => {
    const result = await equipCardBackFor(USER, "dos-qui-nexiste-pas");
    expect(result.ok).toBe(false);
    expect(rpcCalls).toEqual([]);
  });
});

describe("exploits", () => {
  it.each(["error", "throw"] as const)("rend null plutôt que de lever (base : %s)", async (regime) => {
    mode = regime;
    await expect(readAchievementStats(USER)).resolves.toBeNull();
  });
});

describe("quêtes", () => {
  const finishedMatch = () =>
    createGameState({
      gameId: "m",
      player1: { id: USER, deck: PLAYABLE_DECKS[0]! },
      player2: { id: "bot", deck: PLAYABLE_DECKS[1]! },
      seed: 3,
    });

  it.each(REGIMES)("n'échoue jamais sur une fin de partie (base : %s)", async (regime) => {
    mode = regime;
    await expect(
      recordMatchQuestProgress({
        matchId: "22222222-2222-2222-2222-222222222222",
        userId: USER,
        playerId: USER,
        finalState: finishedMatch(),
        vsBot: true,
        won: true,
      })
    ).resolves.toBeUndefined();
  });

  it("attribue les quêtes du jour ET de la semaine", async () => {
    await ensureCurrentQuests(USER, new Date("2026-09-15T12:00:00Z"));
    const assigned = rpcCalls.filter((call) => call.fn === "assign_player_quests");
    expect(assigned.map((call) => call.args.p_quest_type).sort()).toEqual(["daily", "weekly"]);
    // Des codes réels, pas une liste vide : une période sans quête laisserait
    // le joueur sans rien à faire, sans que rien ne le signale.
    for (const call of assigned) expect((call.args.p_quest_codes as string[]).length).toBeGreaterThan(0);
  });

  it.each(REGIMES)("n'échoue pas non plus sur l'attribution (base : %s)", async (regime) => {
    mode = regime;
    await expect(ensureCurrentQuests(USER)).resolves.toBeUndefined();
  });
});

describe("revente", () => {
  it("refuse une quantité absurde avant d'atteindre la base", async () => {
    for (const quantity of [0, -3, 1.5, Number.NaN]) {
      const result = await recycleCardFor(USER, "murene-aveugle", quantity);
      expect(result.ok).toBe(false);
    }
    expect(rpcCalls).toEqual([]);
  });

  it("refuse une carte inconnue avant d'atteindre la base", async () => {
    const result = await recycleCardFor(USER, "carte-qui-nexiste-pas", 1);
    expect(result.ok).toBe(false);
    expect(rpcCalls).toEqual([]);
  });

  it.each(["error", "throw"] as const)("dégrade sans lever (base : %s)", async (regime) => {
    mode = regime;
    const result = await recycleCardFor(USER, "murene-aveugle", 1);
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it("transmet la valeur unitaire du catalogue, jamais une valeur reçue", async () => {
    rpcResults.recycle_card = { ok: true, tides_gained: 3, balance: 10, remaining: 1 };
    await recycleCardFor(USER, "murene-aveugle", 2);
    const call = rpcCalls.find((c) => c.fn === "recycle_card");
    expect(call?.args.p_quantity).toBe(2);
    expect(typeof call?.args.p_unit_value).toBe("number");
    expect(call?.args.p_unit_value as number).toBeGreaterThan(0);
    // Revente À LA CARTE : aucun plancher. Le joueur a choisi la quantité
    // sur la fiche et confirmé, il peut aller jusqu'au dernier exemplaire.
    // Le plancher n'existe plus que pour « Revendre le surplus », vérifié
    // par le test suivant (chaque ligne y porte son `keep`).
    expect(call?.args.p_min_keep).toBe(0);
  });

  it("revend le surplus avec les valeurs du catalogue et ignore l'inconnu", async () => {
    rpcResults.recycle_surplus = { ok: true, tides_gained: 6, cards_sold: 2, balance: 16 };
    const result = await recycleSurplusFor(USER, [
      { cardId: "murene-aveugle", quantity: 2 },
      { cardId: "murene-aveugle", quantity: 5 },
      { cardId: "carte-qui-nexiste-pas", quantity: 1 },
    ]);
    expect(result).toMatchObject({ ok: true, tidesGained: 6, cardsSold: 2 });
    const call = rpcCalls.find((c) => c.fn === "recycle_surplus");
    const items = call?.args.p_items as Array<Record<string, unknown>>;
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ card_id: "murene-aveugle", quantity: 2 });
    // Le ménage en masse, lui, GARDE de quoi jouer la carte : c'est ce qui
    // le distingue de la revente à la carte, sans plancher.
    expect(items[0]!.keep as number).toBeGreaterThanOrEqual(1);
  });

  it("refuse une liste vide avant d'atteindre la base", async () => {
    const result = await recycleSurplusFor(USER, [{ cardId: "murene-aveugle", quantity: 0 }]);
    expect(result.ok).toBe(false);
    expect(rpcCalls).toEqual([]);
  });
});

describe("récompenses de connexion", () => {
  it.each(REGIMES)("rend toujours un cycle lisible (base : %s)", async (regime) => {
    mode = regime;
    const view = await readLoginRewards(USER);
    expect(view.step).toBeGreaterThanOrEqual(1);
    expect(view.items.length).toBeGreaterThan(0);
  });
});
