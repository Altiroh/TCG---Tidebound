import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeDatabase, createFakeClient } from "./fakeSupabase";

/**
 * Social (20/10/2026) — échanges de cartes entre amis, vitrine, fiche d'un
 * joueur et présentation d'une partie en ligne, par les VRAIES actions
 * serveur sur la base en mémoire (`accept_card_trade` y est transcrite).
 */

const ALICE = "11111111-1111-1111-1111-111111111111";
const BOB = "22222222-2222-2222-2222-222222222222";
const CAROL = "33333333-3333-3333-3333-333333333333";

const db = new FakeDatabase();
let sessionUserId: string | null = ALICE;

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceRoleClient: () => createFakeClient(db),
  createSupabaseServerClient: () => createFakeClient(db),
}));
vi.mock("@/lib/supabase/sessionUser", () => ({
  getSessionUser: async () => (sessionUserId ? { id: sessionUserId, email: "joueur@tidebound.test" } : null),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
// Volet social réservé au mode Dev (`socialLock.ts`) : testé ouvert, sauf le dernier bloc.
let devMode = true;
vi.mock("@/features/admin/roles", () => ({ devModeActive: async () => devMode, isAdmin: async () => false, vueJoueurActive: () => false, adminToolsVisible: async () => false }));
vi.mock("next/navigation", () => ({
  redirect: () => {
    throw new Error("redirection vers /connexion");
  },
}));

const friends = await import("@/features/friends/actions");
const trades = await import("@/features/friends/tradeActions");
const showcaseActions = await import("@/features/friends/showcaseActions");
const { fetchMatchVersus } = await import("@/features/online/actions");
const { CARD_DATABASE } = await import("@/game");
const rules = await import("@/features/friends/tradeRules");
const { parseShowcase } = await import("@/features/friends/showcaseRules");

const [X, Y, Z] = [...CARD_DATABASE.keys()];

function as(userId: string | null) {
  sessionUserId = userId;
}

function owns(userId: string, cardId: string, quantity: number) {
  db.table("player_cards").push({ user_id: userId, card_id: cardId, quantity });
}

function count(userId: string, cardId: string): number {
  return db.one("player_cards", { user_id: userId, card_id: cardId })?.quantity ?? 0;
}

function befriend(a: string, b: string) {
  const [user_a, user_b] = [a, b].sort();
  db.table("friendships").push({ user_a, user_b, requested_by: a, status: "accepted", created_at: new Date().toISOString() });
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
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("règles d'échange", () => {
  it("additionne les doublons et refuse une carte inconnue ou une quantité non entière", () => {
    expect(rules.normalizeTradeLines([{ cardId: X, quantity: 1 }, { cardId: X, quantity: 2 }])).toEqual([{ cardId: X, quantity: 3 }]);
    expect(rules.normalizeTradeLines([{ cardId: "carte-inventee", quantity: 1 }])).toBeNull();
    expect(rules.normalizeTradeLines([{ cardId: X, quantity: 1.5 }])).toBeNull();
    expect(rules.normalizeTradeLines("n'importe quoi")).toBeNull();
  });

  it("exige quelque chose de chaque côté, sans la même carte des deux côtés, dans les plafonds", () => {
    expect(rules.tradeProposalError([], [{ cardId: Y!, quantity: 1 }])).not.toBeNull();
    expect(rules.tradeProposalError([{ cardId: X!, quantity: 1 }], [])).not.toBeNull();
    expect(rules.tradeProposalError([{ cardId: X!, quantity: 1 }], [{ cardId: X!, quantity: 1 }])).not.toBeNull();
    expect(rules.tradeProposalError([{ cardId: X!, quantity: rules.TRADE_MAX_COPIES + 1 }], [{ cardId: Y!, quantity: 1 }])).not.toBeNull();
    expect(rules.tradeProposalError([{ cardId: X!, quantity: 1 }], [{ cardId: Y!, quantity: 1 }])).toBeNull();
  });
});

describe("échanges entre amis", () => {
  beforeEach(() => {
    befriend(ALICE, BOB);
    owns(ALICE, X!, 3);
    owns(BOB, Y!, 2);
  });

  it("une offre acceptée déplace les exemplaires des deux côtés, une seule fois", async () => {
    expect(await trades.proposeTrade(BOB, [{ cardId: X, quantity: 2 }], [{ cardId: Y, quantity: 1 }])).toMatchObject({ ok: true });
    expect((await trades.fetchTrades())!.outgoing).toHaveLength(1);

    as(BOB);
    const incoming = (await trades.fetchTrades())!.incoming;
    expect(incoming).toHaveLength(1);
    expect(incoming[0]).toMatchObject({ otherName: "Alice", offered: [{ cardId: X, quantity: 2 }], requested: [{ cardId: Y, quantity: 1 }] });

    expect(await trades.acceptTrade(incoming[0]!.id)).toMatchObject({ ok: true });
    expect([count(ALICE, X!), count(ALICE, Y!), count(BOB, X!), count(BOB, Y!)]).toEqual([1, 1, 2, 1]);
    expect(await trades.acceptTrade(incoming[0]!.id)).toMatchObject({ ok: false });
    expect([count(ALICE, X!), count(BOB, X!)]).toEqual([1, 2]);
    expect((await trades.fetchTrades())!.incoming).toEqual([]);
  });

  it("seul le destinataire accepte ; l'auteur peut annuler, et une offre refusée ne s'accepte plus", async () => {
    await trades.proposeTrade(BOB, [{ cardId: X, quantity: 1 }], [{ cardId: Y, quantity: 1 }]);
    const id = db.table("card_trades")[0]!.id;
    expect(await trades.acceptTrade(id)).toMatchObject({ ok: false });
    expect(await trades.declineTrade(id)).toMatchObject({ ok: false });

    as(BOB);
    expect(await trades.declineTrade(id)).toMatchObject({ ok: true });
    expect(await trades.acceptTrade(id)).toMatchObject({ ok: false });
    expect(count(BOB, X!)).toBe(0);

    as(ALICE);
    await trades.proposeTrade(BOB, [{ cardId: X, quantity: 1 }], [{ cardId: Y, quantity: 1 }]);
    const second = db.table("card_trades")[1]!.id;
    expect(await trades.cancelTrade(second)).toMatchObject({ ok: true });
    as(BOB);
    expect(await trades.acceptTrade(second)).toMatchObject({ ok: false });
  });

  it("on n'échange qu'avec un ami, et que ce que chacun possède", async () => {
    owns(CAROL, Z!, 1);
    expect(await trades.proposeTrade(CAROL, [{ cardId: X, quantity: 1 }], [{ cardId: Z, quantity: 1 }])).toMatchObject({ ok: false });
    expect(await trades.fetchTradeTable(CAROL)).toBeNull();
    expect(await trades.proposeTrade(BOB, [{ cardId: X, quantity: 1 }], [{ cardId: Y, quantity: 3 }])).toMatchObject({ ok: false });
    expect(await trades.proposeTrade(BOB, [{ cardId: Z, quantity: 1 }], [{ cardId: Y, quantity: 1 }])).toMatchObject({ ok: false });
    expect(db.table("card_trades")).toHaveLength(0);
  });

  it("une édition rare ne part jamais dans un échange", async () => {
    db.table("player_card_editions").push(
      { user_id: ALICE, card_id: X, artwork: "classique", finish: "foil", quantity: 2 },
      { user_id: ALICE, card_id: X, artwork: "styled", finish: "classique", quantity: 1 }
    );
    expect((await trades.fetchTradeTable(BOB))!.mine).toEqual([]);
    expect(await trades.proposeTrade(BOB, [{ cardId: X, quantity: 1 }], [{ cardId: Y, quantity: 1 }])).toMatchObject({ ok: false });
  });

  it("l'acceptation revérifie tout : cartes revendues entre-temps, amitié rompue — rien ne bouge", async () => {
    await trades.proposeTrade(BOB, [{ cardId: X, quantity: 2 }], [{ cardId: Y, quantity: 1 }]);
    const id = db.table("card_trades")[0]!.id;
    db.one("player_cards", { user_id: ALICE, card_id: X })!.quantity = 1;

    as(BOB);
    expect(await trades.acceptTrade(id)).toMatchObject({ ok: false, error: "Ton ami ne possède plus les cartes proposées." });
    expect([count(ALICE, X!), count(BOB, Y!), count(BOB, X!)]).toEqual([1, 2, 0]);

    db.one("player_cards", { user_id: ALICE, card_id: X })!.quantity = 3;
    db.tables.friendships = [];
    expect(await trades.acceptTrade(id)).toMatchObject({ ok: false });
    expect(count(BOB, X!)).toBe(0);
  });

  it("plafond de 5 échanges conclus par jour", async () => {
    owns(ALICE, Z!, 10);
    db.one("player_cards", { user_id: BOB, card_id: Y })!.quantity = 10;
    for (let round = 0; round < 6; round += 1) {
      as(ALICE);
      expect(await trades.proposeTrade(BOB, [{ cardId: Z, quantity: 1 }], [{ cardId: Y, quantity: 1 }])).toMatchObject({ ok: true });
      const id = db.table("card_trades").at(-1)!.id;
      as(BOB);
      const result = await trades.acceptTrade(id);
      expect(result.ok).toBe(round < rules.TRADE_DAILY_CAP);
    }
    expect(count(BOB, Z!)).toBe(rules.TRADE_DAILY_CAP);
  });
});

describe("vitrine", () => {
  it("n'expose que des cartes possédées, dans une édition possédée", async () => {
    owns(ALICE, X!, 1);
    owns(ALICE, Y!, 1);
    db.table("player_card_editions").push({ user_id: ALICE, card_id: Y, artwork: "classique", finish: "foil", quantity: 1 });

    const wanted = [{ cardId: X, artwork: "classique", finish: "classique" }, null, { cardId: Y, artwork: "classique", finish: "foil" }];
    expect(await showcaseActions.updateShowcase(wanted)).toMatchObject({ ok: true });
    expect(await showcaseActions.fetchMyShowcase()).toEqual([wanted[0], null, wanted[2], null, null, null]);

    expect(await showcaseActions.updateShowcase([{ cardId: Z, artwork: "classique", finish: "classique" }])).toMatchObject({ ok: false });
    expect(await showcaseActions.updateShowcase([{ cardId: X, artwork: "styled-fa", finish: "star-foil" }])).toMatchObject({ ok: false });
  });

  it("une carte cédée depuis disparaît de la vitrine", async () => {
    owns(ALICE, X!, 1);
    await showcaseActions.updateShowcase([{ cardId: X, artwork: "classique", finish: "classique" }]);
    db.one("player_cards", { user_id: ALICE, card_id: X })!.quantity = 0;
    expect((await showcaseActions.fetchMyShowcase())![0]).toBeNull();
  });

  it("refuse une forme illisible ou une même édition exposée deux fois", () => {
    const card = { cardId: X, artwork: "classique", finish: "classique" };
    expect(parseShowcase([card, card])).toBeNull();
    expect(parseShowcase(new Array(7).fill(null))).toBeNull();
    expect(parseShowcase([{ cardId: X, artwork: "doree", finish: "classique" }])).toBeNull();
  });
});

describe("fiche d'un joueur et adversaires croisés", () => {
  function facedInMatchmaking(a: string, b: string) {
    db.table("matches").push({ id: "aaaaaaaa-0000-4000-8000-000000000001", player1_id: a, player2_id: b, mode: "matchmaking", status: "active", created_at: new Date().toISOString() });
  }

  it("un inconnu n'a pas de fiche, et ne s'ajoute pas sans code", async () => {
    expect(await friends.fetchPlayerCard(CAROL)).toBeNull();
    expect(await friends.addFriendFromMatch(CAROL)).toMatchObject({ ok: false });
    expect(await friends.fetchRecentOpponents()).toEqual([]);
  });

  it("un adversaire croisé en ligne a une fiche, apparaît parmi les récents et s'ajoute sans code", async () => {
    facedInMatchmaking(CAROL, ALICE);
    db.table("player_progression").push({ user_id: CAROL, level: 7 });
    expect(await friends.fetchPlayerCard(CAROL)).toMatchObject({ name: "Carol", level: 7, relation: "opponent" });
    expect(await friends.fetchRecentOpponents()).toEqual([{ userId: CAROL, name: "Carol" }]);

    expect(await friends.addFriendFromMatch(CAROL)).toMatchObject({ ok: true });
    expect(await friends.fetchRecentOpponents()).toEqual([]);
    as(CAROL);
    expect((await friends.fetchSocial())!.incoming).toEqual([{ userId: ALICE, name: "Alice" }]);
    expect((await friends.fetchPlayerCard(ALICE))!.relation).toBe("request_received");
  });

  it("la présentation d'une partie en ligne montre les deux fiches, vitrines comprises", async () => {
    facedInMatchmaking(ALICE, BOB);
    owns(BOB, Y!, 1);
    as(BOB);
    await showcaseActions.updateShowcase([{ cardId: Y, artwork: "classique", finish: "classique" }]);

    as(ALICE);
    const versus = await fetchMatchVersus("aaaaaaaa-0000-4000-8000-000000000001");
    expect(versus.ok).toBe(true);
    expect(versus.data!.me).toMatchObject({ name: "Alice", relation: "self" });
    expect(versus.data!.opponent).toMatchObject({ name: "Bob", relation: "opponent" });
    expect(versus.data!.opponent.showcase[0]).toMatchObject({ cardId: Y });

    as(CAROL);
    expect((await fetchMatchVersus("aaaaaaaa-0000-4000-8000-000000000001")).ok).toBe(false);
  });
});

describe("icône Amis du bandeau", () => {
  it("la pastille compte demandes d'ami et offres d'échange reçues ; le panneau lit tout le tableau", async () => {
    befriend(ALICE, BOB);
    owns(ALICE, X!, 1);
    owns(BOB, Y!, 1);
    expect(await friends.fetchFriendsBadge()).toEqual({ waiting: 0 });

    await trades.proposeTrade(BOB, [{ cardId: X, quantity: 1 }], [{ cardId: Y, quantity: 1 }]);
    as(CAROL);
    await friends.addFriendByCode("BOBBY234");
    as(BOB);
    expect(await friends.fetchFriendsBadge()).toEqual({ waiting: 2 });
    const board = await friends.fetchFriendsBoard();
    expect(board!.social.friends.map((friend) => friend.name)).toEqual(["Alice"]);
    expect(board!.social.incoming).toEqual([{ userId: CAROL, name: "Carol" }]);
    expect(board!.trades.incoming).toHaveLength(1);

    devMode = false;
    expect(await friends.fetchFriendsBadge()).toBeNull();
    expect(await friends.fetchFriendsBoard()).toBeNull();
  });
});

describe("hors mode Dev", () => {
  it("le volet social est fermé : rien ne se lit ni ne s'écrit", async () => {
    befriend(ALICE, BOB);
    owns(ALICE, X!, 1);
    owns(BOB, Y!, 1);
    devMode = false;
    expect(await trades.proposeTrade(BOB, [{ cardId: X, quantity: 1 }], [{ cardId: Y, quantity: 1 }])).toMatchObject({ ok: false });
    expect(await trades.fetchTrades()).toBeNull();
    expect(await showcaseActions.updateShowcase([{ cardId: X, artwork: "classique", finish: "classique" }])).toMatchObject({ ok: false });
    expect(await friends.fetchPlayerCard(BOB)).toBeNull();
    expect(await friends.addFriendByCode("CAROL234")).toMatchObject({ ok: false });
    expect(db.table("card_trades")).toHaveLength(0);
    expect(db.table("player_showcase")).toHaveLength(0);
  });
});
