import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeDatabase, createFakeClient } from "./fakeSupabase";

/**
 * TRAVERSÉES, DU SERVEUR À LA BASE.
 *
 * Même méthode que les autres tests de services : les VRAIS services
 * (`voyageService.ts`, `voyageActions.ts`) sur une base en mémoire qui
 * transcrit `20261007120000_voyages.sql`. Ce qui est vérifié, ce sont les
 * lignes écrites : escale, palier, récompenses créditées, exploit posé.
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

const { recordMatchVoyageProgress } = await import("@/features/quests/voyageService");
const { claimVoyageTier, fetchMatchVoyageRecap, fetchVoyageBoard } = await import("@/features/quests/voyageActions");

let matchCounter = 0;
function nextMatchId(): string {
  matchCounter += 1;
  return `00000000-0000-4000-9000-${matchCounter.toString(16).padStart(12, "0")}`;
}

async function play(progress: Record<string, number>, sets: Record<string, string[]> = {}, matchId = nextMatchId()) {
  await recordMatchVoyageProgress({ matchId, userId: USER, contribution: { progress, sets } });
  return matchId;
}

function voyageRow(voyageId = "premier-quart") {
  return db.one("player_voyages", { user_id: USER, voyage_id: voyageId });
}

beforeEach(() => {
  for (const key of Object.keys(db.tables)) delete db.tables[key];
  db.rpcCalls.length = 0;
  db.table("player_progression").push({ user_id: USER, level: 1, xp_total: 0, matches_played: 0, pvp_wins: 0 });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("avancement d'une escale", () => {
  it("une partie fait avancer l'escale en cours, et la même partie ne compte qu'une fois", async () => {
    const matchId = await play({ play_matches: 1 });
    await play({ play_matches: 1 }, {}, matchId);
    expect(voyageRow()).toMatchObject({ step_index: 0, step_progress: 1 });

    const recap = await fetchMatchVoyageRecap(matchId);
    expect(recap).toMatchObject({ voyageId: "premier-quart", stepName: "Prendre la mer", tier: 1, before: 0, after: 1, target: 3, completedStep: false });
  });

  it("boucler l'escale monte d'un palier ; le palier se réclame une fois, dans l'ordre", async () => {
    for (let i = 0; i < 3; i += 1) await play({ play_matches: 1 });
    expect(voyageRow()).toMatchObject({ step_index: 1, step_progress: 0, claimed_tiers: 0 });

    const claim = await claimVoyageTier("premier-quart");
    expect(claim).toMatchObject({ ok: true, tier: 1, xpGained: 100 });
    expect(db.one("player_progression", { user_id: USER })!.xp_total).toBe(100);
    expect(voyageRow()!.claimed_tiers).toBe(1);

    // Plus rien à réclamer : le palier 2 n'est pas atteint.
    expect((await claimVoyageTier("premier-quart")).ok).toBe(false);
  });

  it("n'écrit rien quand la partie ne touche pas l'escale en cours", async () => {
    await play({ win_matches: 1 });
    expect(voyageRow()).toBeUndefined();
    expect(db.rpcCalls.filter((call) => call.fn === "apply_voyage_progress")).toHaveLength(0);
  });
});

describe("une Traversée bouclée", () => {
  async function finishPremierQuart() {
    for (let i = 0; i < 3; i += 1) await play({ play_matches: 1 });
    await play({ ship_ability_uses: 3 });
    await play({ modify_tide: 2 });
    await play({ activate_reactions: 2 });
    await play({ win_matches: 1 });
  }

  it("pose son exploit (donc le titre) et ouvre la Traversée suivante", async () => {
    await finishPremierQuart();
    expect(voyageRow()).toMatchObject({ step_index: 5 });
    expect(voyageRow()!.completed_at).toBeTruthy();
    expect(db.one("player_achievements", { user_id: USER, code: "voyage_premier_quart" })).toBeDefined();

    await play({ deraison_turns: 2 });
    expect(voyageRow("eaux-troubles")).toMatchObject({ step_index: 0, step_progress: 2 });

    const board = await fetchVoyageBoard();
    expect(board.available).toBe(true);
    expect(board.voyages.map((voyage) => voyage.status)).toEqual(["done", "current", "locked"]);
    expect(board.voyages[0]).toMatchObject({ tier: 5, claimableTier: 1 });
  });

  it("les cinq paliers se réclament l'un après l'autre ; le dernier donne le booster", async () => {
    await finishPremierQuart();
    for (let tier = 1; tier <= 5; tier += 1) {
      expect(await claimVoyageTier("premier-quart"), `palier ${tier}`).toMatchObject({ ok: true, tier });
    }
    expect(db.one("player_boosters", { user_id: USER, booster_definition_id: "standard" })!.quantity).toBe(1);
    // Palier 3 seulement : la petite récompense de l'exploit se réclame à part, sur l'écran des exploits.
    expect(db.one("player_currency", { user_id: USER })!.balance).toBe(25);
    expect(db.one("player_achievements", { user_id: USER, code: "voyage_premier_quart" })!.tides_granted).toBe(25);
    expect((await claimVoyageTier("premier-quart")).ok).toBe(false);
  });
});
