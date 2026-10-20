import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeDatabase, createFakeClient } from "./fakeSupabase";

/**
 * SALON DE COMBAT entre amis (20/10/2026) — de l'invitation à la partie,
 * par les VRAIES actions serveur (`features/friends/lobbyActions.ts`) sur la
 * base en mémoire : invitation au Courrier, deck, « Prêt », compte à
 * rebours, départ.
 */

const ALICE = "11111111-1111-1111-1111-111111111111";
const BOB = "22222222-2222-2222-2222-222222222222";
const CAROL = "33333333-3333-3333-3333-333333333333";

const db = new FakeDatabase();
let sessionUserId: string | null = ALICE;
let devMode = true;

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceRoleClient: () => createFakeClient(db),
  createSupabaseServerClient: () => createFakeClient(db),
}));
vi.mock("@/lib/supabase/sessionUser", () => ({
  getSessionUser: async () => (sessionUserId ? { id: sessionUserId, email: "joueur@tidebound.test" } : null),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/features/admin/roles", () => ({ devModeActive: async () => devMode, isAdmin: async () => false, vueJoueurActive: () => false, adminToolsVisible: async () => false }));
vi.mock("next/navigation", () => ({
  redirect: () => {
    throw new Error("redirection vers /connexion");
  },
}));

const lobby = await import("@/features/friends/lobbyActions");
const friends = await import("@/features/friends/actions");
const { PLAYABLE_DECKS } = await import("@/game");
const { LOBBY_COUNTDOWN_MS } = await import("@/features/friends/lobbyRules");

const DECK = PLAYABLE_DECKS[0]!;

function as(userId: string | null) {
  sessionUserId = userId;
}

function befriend(a: string, b: string) {
  const [user_a, user_b] = [a, b].sort();
  db.table("friendships").push({ user_a, user_b, requested_by: a, status: "accepted", created_at: new Date().toISOString() });
}

/** Fait comme si le compte à rebours était déjà écoulé. */
function elapseCountdown(lobbyId: string) {
  const row = db.one("battle_lobbies", { id: lobbyId })!;
  row.countdown_at = new Date(Date.now() - LOBBY_COUNTDOWN_MS - 100).toISOString();
}

beforeEach(() => {
  for (const key of Object.keys(db.tables)) delete db.tables[key];
  as(ALICE);
  devMode = true;
  db.table("profiles").push(
    { id: ALICE, display_name: "Alice", friend_code: "ALICE234", avatar_card_id: null },
    { id: BOB, display_name: "Bob", friend_code: "BOBBY234", avatar_card_id: null },
    { id: CAROL, display_name: "Carol", friend_code: "CAROL234", avatar_card_id: null }
  );
  for (const user_id of [ALICE, BOB, CAROL]) {
    for (const deck of PLAYABLE_DECKS.slice(0, 2)) db.table("player_deck_unlocks").push({ user_id, deck_id: deck.id, source: "precon_token" });
  }
  befriend(ALICE, BOB);
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

async function openLobby(): Promise<string> {
  as(ALICE);
  const invited = await lobby.inviteToBattle(BOB);
  if (!invited.ok) throw new Error(invited.error);
  as(BOB);
  expect(await lobby.answerBattleInvitation(invited.lobbyId, true)).toMatchObject({ ok: true });
  return invited.lobbyId;
}

describe("invitation au combat", () => {
  it("on n'invite qu'un ami ; l'invitation arrive dans son Courrier, avec la pastille", async () => {
    expect(await lobby.inviteToBattle(CAROL)).toMatchObject({ ok: false });
    const invited = await lobby.inviteToBattle(BOB);
    expect(invited.ok).toBe(true);

    as(BOB);
    const mail = await friends.fetchSocialMail();
    expect(mail!.invitations).toMatchObject([{ fromUserId: ALICE, fromName: "Alice" }]);
    expect(await friends.fetchFriendsBadge()).toMatchObject({ invitations: 1 });
    expect((await friends.pollSocial())!.invitations).toHaveLength(1);
  });

  it("une invitation refusée ferme le salon ; une nouvelle remplace la précédente de l'hôte", async () => {
    const first = await lobby.inviteToBattle(BOB);
    const second = await lobby.inviteToBattle(BOB);
    if (!first.ok || !second.ok) throw new Error("invitation refusée");
    expect(db.one("battle_lobbies", { id: first.lobbyId })!.status).toBe("cancelled");

    as(BOB);
    expect(await lobby.answerBattleInvitation(first.lobbyId, true)).toMatchObject({ ok: false });
    expect(await lobby.answerBattleInvitation(second.lobbyId, false)).toMatchObject({ ok: true });
    as(ALICE);
    expect((await lobby.fetchLobby(second.lobbyId))!.status).toBe("declined");
  });

  it("un inconnu ne voit pas le salon", async () => {
    const id = await openLobby();
    as(CAROL);
    expect(await lobby.fetchLobby(id)).toBeNull();
    expect(await lobby.setLobbyReady(id, true)).toMatchObject({ ok: false });
  });
});

describe("salon : deck, prêt, compte à rebours, départ", () => {
  it("« Prêt » demande un deck ; un deck injouable est refusé", async () => {
    const id = await openLobby();
    expect(await lobby.setLobbyReady(id, true)).toMatchObject({ ok: false, error: "Choisis d'abord ton deck." });
    expect(await lobby.chooseLobbyDeck(id, "deck-qui-n-existe-pas")).toMatchObject({ ok: false });
    expect(await lobby.chooseLobbyDeck(id, DECK.id)).toMatchObject({ ok: true });
    expect(await lobby.setLobbyReady(id, true)).toMatchObject({ ok: true });
  });

  it("les deux prêts : le compte à rebours part, et se retire si l'un se dédit", async () => {
    const id = await openLobby();
    await lobby.chooseLobbyDeck(id, DECK.id);
    await lobby.setLobbyReady(id, true);
    as(ALICE);
    await lobby.chooseLobbyDeck(id, DECK.id);
    await lobby.setLobbyReady(id, true);

    const view = (await lobby.fetchLobby(id))!;
    expect(view.me.ready && view.other.ready).toBe(true);
    expect(view.countdownMs).not.toBeNull();
    expect(view.countdownMs!).toBeGreaterThan(0);
    // Le deck de l'autre reste secret : on sait seulement qu'il en a un.
    expect(view.other).toMatchObject({ hasDeck: true, deckId: null });

    await lobby.setLobbyReady(id, false);
    expect((await lobby.fetchLobby(id))!.countdownMs).toBeNull();
    expect(db.one("battle_lobbies", { id })!.countdown_at).toBeNull();
  });

  it("au bout du compte, UNE partie amicale est créée et les deux y entrent", async () => {
    const id = await openLobby();
    await lobby.chooseLobbyDeck(id, DECK.id);
    await lobby.setLobbyReady(id, true);
    as(ALICE);
    await lobby.chooseLobbyDeck(id, DECK.id);
    await lobby.setLobbyReady(id, true);
    elapseCountdown(id);

    const hostView = (await lobby.fetchLobby(id))!;
    expect(hostView.status).toBe("started");
    expect(hostView.matchId).not.toBeNull();
    as(BOB);
    expect((await lobby.fetchLobby(id))!.matchId).toBe(hostView.matchId);

    expect(db.table("matches")).toHaveLength(1);
    expect(db.table("matches")[0]).toMatchObject({ mode: "private_invite", player1_id: ALICE, player2_id: BOB, status: "active" });
  });

  it("changer de deck retire le « prêt » et le compte à rebours", async () => {
    const id = await openLobby();
    await lobby.chooseLobbyDeck(id, DECK.id);
    await lobby.setLobbyReady(id, true);
    as(ALICE);
    await lobby.chooseLobbyDeck(id, DECK.id);
    await lobby.setLobbyReady(id, true);
    await lobby.chooseLobbyDeck(id, PLAYABLE_DECKS[1]!.id);
    const view = (await lobby.fetchLobby(id))!;
    expect(view.me.ready).toBe(false);
    expect(view.countdownMs).toBeNull();
  });

  it("quitter le salon le ferme pour les deux", async () => {
    const id = await openLobby();
    expect(await lobby.leaveLobby(id)).toMatchObject({ ok: true });
    as(ALICE);
    expect((await lobby.fetchLobby(id))!.status).toBe("cancelled");
    expect(await lobby.setLobbyReady(id, true)).toMatchObject({ ok: false });
  });

  it("hors mode Dev, le salon est fermé", async () => {
    devMode = false;
    expect(await lobby.inviteToBattle(BOB)).toMatchObject({ ok: false });
    expect(await friends.fetchSocialMail()).toBeNull();
  });
});
