import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeDatabase, createFakeClient } from "./fakeSupabase";

/**
 * LA BOUCLE COMPLÈTE, DE BOUT EN BOUT.
 *
 * connexion → deck → Navire → partie → victoire/défaite → récompenses →
 * XP → quêtes → réclamation → collection.
 *
 * Tout ce qui est testé ici passe par les VRAIS services serveur
 * (`features/bot/actions.ts`, `features/matches/matchStore.ts`,
 * `features/progression/*`, `features/quests/*`, `features/boosters/*`),
 * dans l'ordre où l'application les appelle. Seule la base est remplacée,
 * par une transcription en mémoire des migrations (`fakeSupabase.ts`) — ce
 * qui permet de vérifier LES LIGNES RÉELLEMENT ÉCRITES, et pas seulement
 * que chaque service rend `ok: true` quand on l'appelle isolément.
 *
 * La partie elle-même n'est pas simulée : c'est le moteur qui la joue, coup
 * après coup, jusqu'à ce qu'un des deux Navires tombe.
 */

const USER = "11111111-1111-1111-1111-111111111111";
const OPPONENT = "22222222-2222-2222-2222-222222222222";

const db = new FakeDatabase();
let sessionUserId: string | null = USER;

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceRoleClient: () => createFakeClient(db),
  createSupabaseServerClient: () => createFakeClient(db),
}));

vi.mock("@/lib/supabase/sessionUser", () => ({
  getSessionUser: async () => (sessionUserId ? { id: sessionUserId, email: "joueur@tidebound.test" } : null),
}));

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({
  redirect: () => {
    throw new Error("redirection vers /connexion");
  },
}));

const { startBotMatch } = await import("@/features/bot/actions");
const { submitMatchAction, createOnlineMatch, joinOnlineMatch, fetchMatchView } = await import("@/features/online/actions");
const { claimQuestReward, fetchQuestBoard } = await import("@/features/quests/actions");
const { claimAllLevelRewards } = await import("@/features/progression/profileActions");
const { purchaseBooster, openBooster } = await import("@/features/boosters/actions");
const { chooseBotAction } = await import("@/game/bot/chooseAction");
const { RULES } = await import("@/game/rules/constants");
const { PLAYABLE_DECKS } = await import("@/game");
const { cardRows, questRows, boosterPoolCardRows } = await import("@/scripts/seedRows");

/**
 * Données de référence : le catalogue de cartes, de quêtes et les pools de
 * boosters viennent de `scripts/seedRows.ts` — la même source que
 * `npm run seed:cards`. Seules les définitions de boosters sont recopiées
 * des migrations, qui les portent en SQL littéral.
 */
function seedReferenceData(): void {
  for (const row of cardRows()) db.table("cards").push({ ...row });
  questRows().forEach((row, index) => {
    db.table("quests").push({ ...row, id: `quest-${index}` });
  });
  for (const row of boosterPoolCardRows()) db.table("booster_pool_cards").push({ ...row });

  db.table("booster_definitions").push({
    id: "standard",
    name: "Booster Défaut",
    card_count: 8,
    price_currency: 100,
    is_purchasable: true,
    is_enabled: true,
  });
  // Format verrouillé par `20260916120000_lot11_rarities_and_booster_pools.sql`.
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
  for (const slot of slots) db.table("booster_slots").push({ booster_definition_id: "standard", ...slot });
}

beforeEach(() => {
  for (const key of Object.keys(db.tables)) delete db.tables[key];
  db.rpcCalls.length = 0;
  sessionUserId = USER;
  seedReferenceData();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

/** Les deux premières listes du catalogue : de quoi asseoir deux joueurs. */
const DECK = PLAYABLE_DECKS[0]!;
const OTHER_DECK = PLAYABLE_DECKS[1]!;

/**
 * Joue la partie jusqu'au bout depuis le siège de `userId`, en soumettant
 * de vrais coups au serveur. Le « joueur » est piloté par le bot le plus
 * faible — ce qui compte ici est que chaque coup traverse `submitAction`,
 * pas la qualité du jeu.
 */
async function playToTheEnd(matchId: string, userId: string, limit = 400): Promise<void> {
  for (let move = 0; move < limit; move += 1) {
    const stateRow = db.one("match_states", { match_id: matchId });
    const match = db.one("matches", { id: matchId });
    if (!stateRow || match?.status !== "active") return;

    const action = chooseBotAction(stateRow.state, userId, "moyen");
    const result = await submitMatchAction(matchId, action);
    expect(result.error).toBeUndefined();
    expect(result.ok).toBe(true);
  }
  throw new Error("La partie ne s'est pas terminée dans la limite de coups.");
}

describe("boucle complète — partie contre bot, arbitrée côté serveur", () => {
  it("connexion → deck → partie → fin → récompenses → XP → quêtes → collection", async () => {
    // --- lancement ------------------------------------------------------
    const started = await startBotMatch(DECK.id, OTHER_DECK.id, "facile");
    expect(started.error).toBeUndefined();
    expect(started.ok).toBe(true);
    const matchId = started.matchId!;

    const created = db.one("matches", { id: matchId })!;
    expect(created.status).toBe("active");
    expect(created.mode).toBe("bot");
    expect(created.player1_id).toBe(USER);
    // Le Navire du deck choisi est bien celui de la partie : la sélection du
    // Navire se fait au deck, pas à l'écran de lancement.
    const initial = db.one("match_states", { match_id: matchId })!.state;
    expect(initial.players[0].shipId).toBe(DECK.shipId);
    expect(initial.players[1].shipId).toBe(OTHER_DECK.shipId);

    // --- la partie ------------------------------------------------------
    await playToTheEnd(matchId, USER);

    const finished = db.one("matches", { id: matchId })!;
    expect(finished.status).toBe("finished");
    expect(finished.finished_at).toBeTruthy();
    const finalState = db.one("match_states", { match_id: matchId })!.state;
    expect(finalState.status).toBe("finished");
    expect(finalState.winnerId).toBeTruthy();
    // Vainqueur cohérent entre l'état du moteur et la ligne de métadonnées.
    expect(finished.winner_id).toBe(finalState.winnerId === USER ? USER : null);

    // --- récompenses et XP ----------------------------------------------
    const reward = db.one("match_rewards", { match_id: matchId, user_id: USER });
    expect(reward, "aucune récompense écrite pour la partie terminée").toBeTruthy();
    expect(reward!.xp_granted).toBeGreaterThan(0);

    const progression = db.one("player_progression", { user_id: USER })!;
    expect(progression.xp_total).toBe(reward!.xp_granted);
    expect(progression.matches_played).toBe(1);
    expect(progression.play_streak).toBe(1);

    // --- quêtes ----------------------------------------------------------
    expect(db.one("match_quest_progress", { match_id: matchId, user_id: USER })).toBeTruthy();
    const advanced = db.table("player_quest_progress").filter((row) => row.user_id === USER && row.progress_value > 0);
    expect(advanced.length, "aucune quête n'a avancé après une partie complète").toBeGreaterThan(0);

    const board = await fetchQuestBoard();
    expect(board.isSignedIn).toBe(true);
    expect(board.unavailable).toBeFalsy();
    expect(board.daily.length).toBeGreaterThan(0);

    // --- réclamation d'une quête terminée --------------------------------
    // Les objectifs du jour se comptent en plusieurs parties (« Prendre le
    // large » en demande 3) : on en joue donc jusqu'à ce que l'un tombe.
    for (let extra = 0; extra < 5; extra += 1) {
      if (db.table("player_quest_progress").some((row) => row.user_id === USER && row.completed_at)) break;
      const next = await startBotMatch(DECK.id, OTHER_DECK.id, "facile");
      expect(next.ok).toBe(true);
      await playToTheEnd(next.matchId!, USER);
    }
    const completed = db.table("player_quest_progress").find((row) => row.user_id === USER && row.completed_at);
    expect(completed, "aucune quête terminée en six parties").toBeTruthy();
    const balanceBefore = db.one("player_currency", { user_id: USER })?.balance ?? 0;
    const claim = await claimQuestReward(completed!.quest_id, completed!.period_key);
    expect(claim.ok).toBe(true);
    expect(db.one("player_currency", { user_id: USER })!.balance).toBe(balanceBefore + (claim.tidesGained ?? 0));
    // Deuxième réclamation refusée : la base, pas l'écran, garde la mémoire.
    expect((await claimQuestReward(completed!.quest_id, completed!.period_key)).ok).toBe(false);

    // --- paliers de niveau ------------------------------------------------
    const levels = await claimAllLevelRewards();
    expect(levels.ok).toBe(true);
    expect(levels.claimed.length).toBeGreaterThan(0);
    expect(db.table("player_level_rewards").filter((row) => row.user_id === USER).length).toBe(levels.claimed.length);

    // --- collection --------------------------------------------------------
    // De quoi s'offrir un booster, quelle qu'ait été l'issue de la partie.
    db.one("player_currency", { user_id: USER })!.balance += 1000;
    const purchase = await purchaseBooster("standard", 1);
    expect(purchase.error).toBeUndefined();
    expect(purchase.ok).toBe(true);

    const opened = await openBooster("standard");
    expect(opened.error).toBeUndefined();
    expect(opened.ok).toBe(true);
    expect(opened.data!.cards).toHaveLength(8);

    const collection = db.table("player_cards").filter((row) => row.user_id === USER);
    expect(collection.length).toBeGreaterThan(0);
    expect(collection.reduce((total, row) => total + row.quantity, 0)).toBe(8);
    expect(db.one("player_boosters", { user_id: USER, booster_definition_id: "standard" })!.quantity).toBe(0);
  });

  it("ne paie jamais deux fois la même partie", async () => {
    const started = await startBotMatch(DECK.id, OTHER_DECK.id, "facile");
    const matchId = started.matchId!;
    await playToTheEnd(matchId, USER);

    const xpAfterMatch = db.one("player_progression", { user_id: USER })!.xp_total;
    const finalState = db.one("match_states", { match_id: matchId })!.state;

    // Rejeu explicite de l'octroi, comme le ferait un second chemin qui
    // observerait la même fin de partie.
    const { awardMatchReward } = await import("@/features/progression/rewards");
    const again = await awardMatchReward({
      matchId,
      userId: USER,
      mode: "bot",
      outcome: finalState.winnerId === USER ? "win" : "loss",
      finalState,
      enginePlayerId: USER,
    });
    expect(again).toBeNull();
    expect(db.one("player_progression", { user_id: USER })!.xp_total).toBe(xpAfterMatch);
    expect(db.table("match_rewards").filter((row) => row.match_id === matchId && row.user_id === USER)).toHaveLength(1);
  });

  it("refuse un coup joué au nom d'un autre joueur", async () => {
    const started = await startBotMatch(DECK.id, OTHER_DECK.id, "facile");
    const matchId = started.matchId!;
    const state = db.one("match_states", { match_id: matchId })!.state;
    const action = chooseBotAction(state, USER, "facile");

    const result = await submitMatchAction(matchId, { ...action, playerId: OPPONENT } as typeof action);
    expect(result.ok).toBe(false);
    // L'état n'a pas bougé d'un pouce.
    expect(db.one("match_states", { match_id: matchId })!.version).toBe(1);
  });

  it("ne rend jamais la main ni le deck de l'adversaire dans la vue projetée", async () => {
    const started = await startBotMatch(DECK.id, OTHER_DECK.id, "facile");
    const matchId = started.matchId!;

    const view = await fetchMatchView(matchId);
    expect(view.ok).toBe(true);
    const frames = view.data!.frames!;
    const projected = JSON.stringify(frames);
    const full = db.one("match_states", { match_id: matchId })!.state;
    // Les identifiants d'instance de la main adverse ne doivent apparaître
    // nulle part dans ce qui part au navigateur.
    const opponentHandIds = full.players[1].hand.map((card: { instanceId: string }) => card.instanceId);
    for (const instanceId of opponentHandIds) expect(projected).not.toContain(instanceId);
  });
});

describe("boucle complète — partie en ligne entre deux joueurs", () => {
  it("création par code d'invitation, partie jouée, récompenses des DEUX joueurs", async () => {
    sessionUserId = USER;
    const created = await createOnlineMatch(DECK.id);
    expect(created.error).toBeUndefined();
    expect(created.ok).toBe(true);
    const { matchId, inviteCode } = created.data!;
    expect(db.one("matches", { id: matchId })!.status).toBe("waiting");

    sessionUserId = OPPONENT;
    const joined = await joinOnlineMatch(inviteCode, OTHER_DECK.id);
    expect(joined.error).toBeUndefined();
    expect(joined.ok).toBe(true);

    const match = db.one("matches", { id: matchId })!;
    expect(match.status).toBe("active");
    expect(match.player2_id).toBe(OPPONENT);

    // Chacun joue à son tour, depuis sa propre session : personne ne joue
    // pour l'autre, et le serveur refuserait qu'il essaie.
    for (let move = 0; move < 400; move += 1) {
      const row = db.one("match_states", { match_id: matchId });
      if (!row || db.one("matches", { id: matchId })!.status !== "active") break;
      const state = row.state;
      // Le joueur à qui le moteur donne la priorité (fenêtre de réaction ou
      // choix en cours compris).
      const toPlay: string = state.pendingReaction?.awaitingPlayerId ?? state.pendingChoice?.playerId ?? state.activePlayerId;
      sessionUserId = toPlay;
      const result = await submitMatchAction(matchId, chooseBotAction(state, toPlay, "facile"));
      expect(result.error).toBeUndefined();
    }

    expect(db.one("matches", { id: matchId })!.status).toBe("finished");
    // Les deux joueurs sont payés, une fois chacun.
    expect(db.one("match_rewards", { match_id: matchId, user_id: USER })).toBeTruthy();
    expect(db.one("match_rewards", { match_id: matchId, user_id: OPPONENT })).toBeTruthy();
    expect(db.one("player_progression", { user_id: USER })!.matches_played).toBe(1);
    expect(db.one("player_progression", { user_id: OPPONENT })!.matches_played).toBe(1);
  });

  it("refuse un second joueur sur une partie déjà rejointe", async () => {
    sessionUserId = USER;
    const created = await createOnlineMatch(DECK.id);
    const { inviteCode } = created.data!;

    sessionUserId = OPPONENT;
    expect((await joinOnlineMatch(inviteCode, OTHER_DECK.id)).ok).toBe(true);

    sessionUserId = "33333333-3333-3333-3333-333333333333";
    const third = await joinOnlineMatch(inviteCode, OTHER_DECK.id);
    expect(third.ok).toBe(false);
  });
});

describe("délai de tour — l'autorité reste au serveur", () => {
  /** Recule l'échéance du chrono dans le passé, comme si le joueur s'était absenté. */
  function expireDeadline(matchId: string): void {
    const row = db.one("match_states", { match_id: matchId })!;
    row.state = { ...row.state, turnTimer: { ...row.state.turnTimer, deadlineAt: Date.now() - 1_000 } };
  }

  it("une simple lecture fait avancer une partie que l'adversaire a quittée", async () => {
    sessionUserId = USER;
    const created = await createOnlineMatch(DECK.id);
    const { matchId, inviteCode } = created.data!;
    sessionUserId = OPPONENT;
    await joinOnlineMatch(inviteCode, OTHER_DECK.id);

    const state = db.one("match_states", { match_id: matchId })!.state;
    const absent: string = state.turnTimer.awaitingPlayerId;
    const present = absent === USER ? OPPONENT : USER;
    const versionAvant = db.one("match_states", { match_id: matchId })!.version;

    // Tant que l'échéance court, la lecture ne change rien : le serveur ne
    // punit pas un joueur qui réfléchit.
    sessionUserId = present;
    await fetchMatchView(matchId);
    expect(db.one("match_states", { match_id: matchId })!.version).toBe(versionAvant);

    // Une fois l'échéance passée, c'est la LECTURE du joueur présent qui la
    // constate — aucune tâche de fond, et rien de déclaré par le navigateur.
    expireDeadline(matchId);
    await fetchMatchView(matchId);
    const apres = db.one("match_states", { match_id: matchId })!;
    expect(apres.version).toBeGreaterThan(versionAvant);
    expect(apres.state.players.find((p: { id: string }) => p.id === absent).missedDeadlines).toBe(1);
    // Un tour perdu, pas la partie.
    expect(db.one("matches", { id: matchId })!.status).toBe("active");
  });

  it("le joueur qui joue, fût-ce en retard, n'est jamais expiré par son propre coup", async () => {
    sessionUserId = USER;
    const created = await createOnlineMatch(DECK.id);
    const { matchId, inviteCode } = created.data!;
    sessionUserId = OPPONENT;
    await joinOnlineMatch(inviteCode, OTHER_DECK.id);

    expireDeadline(matchId);
    const state = db.one("match_states", { match_id: matchId })!.state;
    const late: string = state.turnTimer.awaitingPlayerId;
    sessionUserId = late;
    const result = await submitMatchAction(matchId, chooseBotAction(state, late, "moyen"));
    expect(result.ok).toBe(true);
    expect(db.one("match_states", { match_id: matchId })!.state.players.find((p: { id: string }) => p.id === late).missedDeadlines ?? 0).toBe(0);
  });

  it("après MAX_MISSED_DEADLINES absences, la partie est perdue et les récompenses sont payées", async () => {
    sessionUserId = USER;
    const created = await createOnlineMatch(DECK.id);
    const { matchId, inviteCode } = created.data!;
    sessionUserId = OPPONENT;
    await joinOnlineMatch(inviteCode, OTHER_DECK.id);

    const first = db.one("match_states", { match_id: matchId })!.state;
    const absent: string = first.turnTimer.awaitingPlayerId;
    const present = absent === USER ? OPPONENT : USER;

    // Le joueur présent laisse filer : il rend la main dès qu'il l'a, et
    // l'absent laisse passer chacune de ses échéances.
    for (let round = 0; round < RULES.MAX_MISSED_DEADLINES; round += 1) {
      expireDeadline(matchId);
      sessionUserId = present;
      await fetchMatchView(matchId);
      if (db.one("matches", { id: matchId })!.status !== "active") break;
      const state = db.one("match_states", { match_id: matchId })!.state;
      if (state.turnTimer.awaitingPlayerId === present) {
        await submitMatchAction(matchId, { type: "endTurn", playerId: present });
      }
    }

    const match = db.one("matches", { id: matchId })!;
    expect(match.status).toBe("finished");
    expect(match.winner_id).toBe(present);
    // La fin par délai emprunte le même chemin que n'importe quelle autre :
    // les deux joueurs sont payés, une fois chacun.
    expect(db.one("match_rewards", { match_id: matchId, user_id: USER })).toBeTruthy();
    expect(db.one("match_rewards", { match_id: matchId, user_id: OPPONENT })).toBeTruthy();
  });
});
