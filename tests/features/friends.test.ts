import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeDatabase, createFakeClient } from "./fakeSupabase";

/**
 * Amis — de la demande au défi, par les VRAIES actions serveur
 * (`features/friends/actions.ts`) sur la base en mémoire.
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
vi.mock("next/navigation", () => ({
  redirect: () => {
    throw new Error("redirection vers /connexion");
  },
}));

const friends = await import("@/features/friends/actions");
const { joinOnlineMatch } = await import("@/features/online/actions");
const { PLAYABLE_DECKS } = await import("@/game");
const { presenceOf, ONLINE_WINDOW_MS } = await import("@/features/friends/presence");

const DECK = PLAYABLE_DECKS[0]!;

function as(userId: string | null) {
  sessionUserId = userId;
}

beforeEach(() => {
  for (const key of Object.keys(db.tables)) delete db.tables[key];
  as(ALICE);
  db.table("profiles").push(
    { id: ALICE, display_name: "Alice", friend_code: "ALICE234" },
    { id: BOB, display_name: "Bob", friend_code: "BOBBY234" },
    { id: CAROL, display_name: "Carol", friend_code: "CAROL234" }
  );
  vi.spyOn(console, "error").mockImplementation(() => {});
});

async function befriend(a: string, b: string, bCode: string) {
  as(a);
  expect((await friends.addFriendByCode(bCode)).ok).toBe(true);
  as(b);
  expect((await friends.answerFriendRequest(a, true)).ok).toBe(true);
}

describe("demandes d'ami", () => {
  it("s'ajoute par code ami, et ne devient ami qu'une fois la demande acceptée", async () => {
    expect(await friends.addFriendByCode("bobby-234")).toMatchObject({ ok: true });
    expect((await friends.fetchSocial())!.outgoing).toEqual([{ userId: BOB, name: "Bob" }]);
    expect((await friends.fetchSocial())!.friends).toEqual([]);

    as(BOB);
    expect((await friends.fetchSocial())!.incoming).toEqual([{ userId: ALICE, name: "Alice" }]);
    expect((await friends.answerFriendRequest(ALICE, true)).ok).toBe(true);
    expect((await friends.fetchSocial())!.friends.map((friend) => friend.name)).toEqual(["Alice"]);
  });

  it("seul le destinataire accepte : l'expéditeur ne peut pas s'accepter lui-même", async () => {
    await friends.addFriendByCode("BOBBY234");
    expect((await friends.answerFriendRequest(BOB, true)).ok).toBe(false);
    expect(db.one("friendships", { user_a: ALICE, user_b: BOB })!.status).toBe("pending");
  });

  it("refuse son propre code, un code inconnu, une demande en double", async () => {
    expect(await friends.addFriendByCode("ALICE234")).toMatchObject({ ok: false });
    expect(await friends.addFriendByCode("ZZZZZZZZ")).toMatchObject({ ok: false });
    await friends.addFriendByCode("BOBBY234");
    expect(await friends.addFriendByCode("BOBBY234")).toMatchObject({ ok: false });
    expect(db.table("friendships")).toHaveLength(1);
  });

  it("deux demandes croisées valent acceptation", async () => {
    await friends.addFriendByCode("BOBBY234");
    as(BOB);
    expect(await friends.addFriendByCode("ALICE234")).toMatchObject({ ok: true });
    expect(db.one("friendships", { user_a: ALICE, user_b: BOB })!.status).toBe("accepted");
  });

  it("retirer un ami efface le lien des deux côtés", async () => {
    await befriend(ALICE, BOB, "BOBBY234");
    as(ALICE);
    await friends.removeFriend(BOB);
    as(BOB);
    expect((await friends.fetchSocial())!.friends).toEqual([]);
  });

  it("hors connexion, rien ne se lit ni ne s'écrit", async () => {
    as(null);
    expect(await friends.fetchSocial()).toBeNull();
    expect(await friends.pollSocial()).toBeNull();
    expect((await friends.addFriendByCode("BOBBY234")).ok).toBe(false);
  });
});

describe("présence", () => {
  it("un ami qui a donné signe de vie il y a moins de deux minutes est en ligne", async () => {
    await befriend(ALICE, BOB, "BOBBY234");
    as(BOB);
    await friends.pollSocial();
    as(ALICE);
    expect((await friends.fetchSocial())!.friends[0]!.presence).toBe("online");

    expect(presenceOf(new Date(Date.now() - ONLINE_WINDOW_MS - 1000).toISOString(), false)).toBe("offline");
    expect(presenceOf(null, true)).toBe("in_match");
  });
});

describe("défis", () => {
  it("on ne défie que ses amis", async () => {
    expect(await friends.challengeFriend(CAROL, DECK.id)).toMatchObject({ ok: false });
    expect(db.table("matches")).toHaveLength(0);
  });

  it("le défi crée un match amical ; l'ami le voit, le relève par son code, et la partie commence", async () => {
    await befriend(ALICE, BOB, "BOBBY234");
    as(ALICE);
    const sent = await friends.challengeFriend(BOB, DECK.id);
    expect(sent.ok).toBe(true);
    const match = db.one("matches", { id: sent.matchId })!;
    expect(match).toMatchObject({ mode: "private_invite", status: "waiting", player1_id: ALICE });

    as(BOB);
    const polled = await friends.pollSocial();
    expect(polled!.challenges).toEqual([
      expect.objectContaining({ fromUserId: ALICE, fromName: "Alice", inviteCode: match.invite_code }),
    ]);

    expect((await joinOnlineMatch(match.invite_code, PLAYABLE_DECKS[1]!.id)).ok).toBe(true);
    // Relevé : il n'est plus proposé.
    expect((await friends.pollSocial())!.challenges).toEqual([]);
  });

  it("décliner ferme la partie de l'hôte ; seul le destinataire peut décliner", async () => {
    await befriend(ALICE, BOB, "BOBBY234");
    as(ALICE);
    const sent = await friends.challengeFriend(BOB, DECK.id);
    as(BOB);
    const [challenge] = (await friends.pollSocial())!.challenges;

    as(CAROL);
    expect((await friends.declineChallenge(challenge!.id)).ok).toBe(false);
    as(BOB);
    expect((await friends.declineChallenge(challenge!.id)).ok).toBe(true);
    expect(db.one("matches", { id: sent.matchId })!.status).toBe("abandoned");
    expect((await friends.pollSocial())!.challenges).toEqual([]);
  });
});
