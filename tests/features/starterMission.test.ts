import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeDatabase, createFakeClient } from "./fakeSupabase";

/**
 * PREMIÈRE MISSION — les trois starters (décision du 15/10/2026).
 *
 * Le tutoriel, TERMINÉ OU PASSÉ, débloque d'un coup Le Rempart Vivant, Les
 * Saboteurs du Pont et L'Assaut des Marées. L'octroi est idempotent
 * (tutoriel rejouable), rattrape paresseusement les comptes existants, et
 * ne compte ni pour la quête « Nouvel équipage » ni pour l'exploit des
 * déblocages au Jeton. Le rayon au Jeton refuse les starters et les decks
 * retirés ; un deck retiré déjà débloqué reste jouable.
 *
 * La base est la transcription en mémoire des migrations
 * (`fakeSupabase.ts`) : on vérifie les lignes réellement écrites.
 */

const USER = "11111111-1111-1111-1111-111111111111";
const STARTERS = ["le-rempart-vivant", "les-saboteurs-du-pont", "l-assaut-des-marees"];
const RETIRED = ["la-forteresse", "epavistes", "a-bout-de-raison"];

const db = new FakeDatabase();

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceRoleClient: () => createFakeClient(db),
  createSupabaseServerClient: () => createFakeClient(db),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { finishTutorial, readOnboarding } = await import("@/features/onboarding/onboardingService");
const { readDeckCatalog, unlockPreconDeck } = await import("@/features/decks/catalogService");
const { resolveMatchDeck } = await import("@/features/decks/matchDeck");
const { PRECON_DECKS, SHOP_DECKS, STARTER_DECKS, validateDeckList } = await import("@/game");

function unlocksOf(userId: string) {
  return db.where("player_deck_unlocks", { user_id: userId });
}

beforeEach(() => {
  for (const key of Object.keys(db.tables)) delete db.tables[key];
  db.rpcCalls.length = 0;
  db.beforeRpc = null;
  db.table("player_progression").push({ user_id: USER, xp_total: 0, level: 1, precon_tokens: 3 });
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("catalogue — starters et rayon", () => {
  it("les trois starters sont EN FIN de PRECON_DECKS, valides, et offerts par la mission", () => {
    expect(PRECON_DECKS.slice(-3).map((deck) => deck.id)).toEqual(STARTERS);
    expect(STARTER_DECKS.map((deck) => deck.id)).toEqual(STARTERS);
    for (const deck of STARTER_DECKS) {
      expect(deck.offer).toBe("starter");
      expect(deck.difficulty).toBeLessThanOrEqual(2);
      expect(validateDeckList(deck).ok, deck.id).toBe(true);
    }
  });

  it("les decks retirés restent au catalogue mais quittent le rayon au Jeton", () => {
    for (const id of RETIRED) {
      expect(PRECON_DECKS.find((deck) => deck.id === id)?.offer, id).toBe("retired");
      expect(SHOP_DECKS.some((deck) => deck.id === id), id).toBe(false);
    }
    for (const id of STARTERS) expect(SHOP_DECKS.some((deck) => deck.id === id), id).toBe(false);
  });
});

describe("première mission", () => {
  it("tutoriel TERMINÉ : les trois starters, source 'starter', sans quête ni exploit de Jeton", async () => {
    const result = await finishTutorial(USER, true);
    expect(result.ok).toBe(true);
    expect(result.startersGranted).toEqual(STARTERS);
    expect(unlocksOf(USER).map((row) => [row.deck_id, row.source])).toEqual(STARTERS.map((id) => [id, "starter"]));

    // Ni « Nouvel équipage » (quête), ni « Équipage recruté » (exploit du Jeton).
    expect(db.rpcCalls.some((call) => call.fn === "record_quest_event_progress")).toBe(false);
    expect(db.where("player_achievements", { user_id: USER, code: "first_precon" })).toHaveLength(0);
    // Aucun Jeton dépensé.
    expect(db.one("player_progression", { user_id: USER })?.precon_tokens).toBe(3);
  });

  it("tutoriel PASSÉ : les trois starters aussi", async () => {
    const result = await finishTutorial(USER, false);
    expect(result.ok).toBe(true);
    expect(result.boosterGranted).toBe(false);
    expect(result.startersGranted).toEqual(STARTERS);
    expect(unlocksOf(USER)).toHaveLength(3);
  });

  it("tutoriel REJOUÉ : aucun doublon, rien de nouveau accordé", async () => {
    await finishTutorial(USER, false);
    const replay = await finishTutorial(USER, true);
    expect(replay.ok).toBe(true);
    expect(replay.startersGranted).toEqual([]);
    expect(unlocksOf(USER)).toHaveLength(3);
    const again = await finishTutorial(USER, true);
    expect(again.startersGranted).toEqual([]);
    expect(unlocksOf(USER)).toHaveLength(3);
  });

  it("tutoriel pas encore fait : la base refuse l'octroi, rien n'est débloqué", async () => {
    const state = await readOnboarding(USER);
    expect(state.tutorialStatus).toBe("not_started");
    expect(state.starterMissionDone).toBe(false);
    expect(unlocksOf(USER)).toHaveLength(0);
    const catalog = await readDeckCatalog(USER);
    expect(catalog.decks.filter((entry) => entry.unlocked)).toHaveLength(0);
  });

  it("compte EXISTANT (tutoriel déjà passé, ancien deck gratuit) : rattrapé à la lecture, l'ancien déblocage reste", async () => {
    db.table("player_onboarding").push({ user_id: USER, tutorial_status: "skipped", tutorial_reward_claimed: false });
    db.table("player_deck_unlocks").push({ user_id: USER, deck_id: "la-veillee", source: "borrowed" });

    const state = await readOnboarding(USER);
    expect(state.startersJustGranted).toEqual(STARTERS);
    expect(state.starterMissionDone).toBe(true);
    expect(unlocksOf(USER).map((row) => row.deck_id).sort()).toEqual(["la-veillee", ...STARTERS].sort());

    // Seconde lecture : déjà tout là, rien de neuf.
    const second = await readOnboarding(USER);
    expect(second.startersJustGranted).toEqual([]);
    expect(second.starterMissionDone).toBe(true);
    expect(unlocksOf(USER)).toHaveLength(4);
  });

  it("le rattrapage passe aussi par le rayon de Decks (compte qui n'est pas passé par l'accueil)", async () => {
    db.table("player_onboarding").push({ user_id: USER, tutorial_status: "completed", tutorial_reward_claimed: true });
    const catalog = await readDeckCatalog(USER);
    expect(catalog.decks.slice(0, 3).map((entry) => [entry.deck.id, entry.unlocked])).toEqual(STARTERS.map((id) => [id, true]));
    expect(unlocksOf(USER)).toHaveLength(3);
  });
});

describe("rayon au Jeton", () => {
  it("refuse un starter et un deck retiré, sans dépenser de Jeton", async () => {
    for (const id of [...STARTERS, ...RETIRED]) {
      const result = await unlockPreconDeck(USER, id);
      expect(result.ok, id).toBe(false);
    }
    expect(db.one("player_progression", { user_id: USER })?.precon_tokens).toBe(3);
    expect(unlocksOf(USER)).toHaveLength(0);
    expect(db.rpcCalls.some((call) => call.fn === "unlock_precon_deck")).toBe(false);
  });

  it("vend toujours un deck du rayon", async () => {
    const result = await unlockPreconDeck(USER, SHOP_DECKS[0]!.id);
    expect(result.ok).toBe(true);
    expect(result.tokens).toBe(2);
  });

  it("la base refuse aussi, même si le serveur laissait passer", () => {
    const client = createFakeClient(db);
    return Promise.all(
      [...STARTERS, ...RETIRED].map(async (id) => {
        const { data } = await client.rpc("unlock_precon_deck", { p_user_id: USER, p_deck_id: id });
        expect(data.ok, id).toBe(false);
      })
    );
  });

  it("masque les retirés à qui ne les a pas, les montre (jouables) à qui les a débloqués", async () => {
    const anonymous = await readDeckCatalog(null);
    for (const id of RETIRED) expect(anonymous.decks.some((entry) => entry.deck.id === id), id).toBe(false);
    // Starters en tête du rayon.
    expect(anonymous.decks.slice(0, 3).map((entry) => entry.deck.id)).toEqual(STARTERS);

    db.table("player_deck_unlocks").push({ user_id: USER, deck_id: "la-forteresse", source: "precon_token" });
    const owner = await readDeckCatalog(USER);
    expect(owner.decks.find((entry) => entry.deck.id === "la-forteresse")?.unlocked).toBe(true);
    expect(owner.decks.some((entry) => entry.deck.id === "epavistes")).toBe(false);
  });
});

describe("deck retiré possédé", () => {
  it("reste jouable (resolveMatchDeck) ; non possédé, il est refusé", async () => {
    db.table("player_deck_unlocks").push({ user_id: USER, deck_id: "epavistes", source: "borrowed" });
    const owned = await resolveMatchDeck(USER, "epavistes");
    expect(owned.ok).toBe(true);
    const notOwned = await resolveMatchDeck(USER, "a-bout-de-raison");
    expect(notOwned).toMatchObject({ ok: false, reason: "locked" });
  });

  it("un starter accordé se joue", async () => {
    await finishTutorial(USER, false);
    for (const id of STARTERS) expect((await resolveMatchDeck(USER, id)).ok, id).toBe(true);
  });
});
