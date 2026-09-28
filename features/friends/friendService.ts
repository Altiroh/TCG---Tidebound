import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { createWaitingMatch } from "@/features/online/waitingMatch";
import { normalizeFriendCode, presenceOf, type FriendPresence } from "@/features/friends/presence";

/**
 * Amis — module SERVEUR, volontairement sans directive `"use server"`.
 *
 * Chaque fonction prend l'identifiant du joueur en paramètre : exportées
 * depuis un fichier `"use server"`, elles deviendraient des points d'entrée
 * HTTP où n'importe qui choisirait l'identité. Seul `features/friends/actions.ts`
 * les appelle, avec l'identifiant tiré de la session.
 */

/** Plafonds anti-abus : une liste d'amis n'est pas un annuaire. */
export const MAX_FRIENDS = 200;
export const MAX_PENDING_OUTGOING = 50;
/** Un défi non relevé au bout de ce délai n'est plus proposé. */
export const CHALLENGE_TTL_MS = 30 * 60 * 1000;

export type FriendResult = { ok: true; message?: string } | { ok: false; error: string };

export interface FriendView {
  userId: string;
  name: string;
  presence: FriendPresence;
}

export interface IncomingChallenge {
  id: string;
  fromUserId: string;
  fromName: string;
  inviteCode: string;
  createdAt: string;
}

export interface SocialView {
  friendCode: string;
  friends: FriendView[];
  /** Demandes reçues, à accepter ou refuser. */
  incoming: { userId: string; name: string }[];
  /** Demandes envoyées, en attente de l'autre. */
  outgoing: { userId: string; name: string }[];
  challenges: IncomingChallenge[];
}

function service() {
  return createSupabaseServiceRoleClient();
}

/** La paire dans l'ordre de la clé primaire (`user_a < user_b`). */
function pairOf(a: string, b: string): { user_a: string; user_b: string } {
  return a < b ? { user_a: a, user_b: b } : { user_a: b, user_b: a };
}

function otherOf(row: { user_a: string; user_b: string }, userId: string): string {
  return row.user_a === userId ? row.user_b : row.user_a;
}

async function readFriendship(userId: string, otherId: string) {
  const { data, error } = await service().from("friendships").select("*").match(pairOf(userId, otherId)).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

async function namesOf(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const { data } = await service().from("profiles").select("id, display_name").in("id", ids);
  return new Map((data ?? []).map((row) => [row.id, row.display_name]));
}

export async function sendFriendRequest(userId: string, rawCode: string): Promise<FriendResult> {
  const code = normalizeFriendCode(rawCode);
  if (code.length !== 8) return { ok: false, error: "Un code ami compte 8 caractères." };

  const { data: target, error } = await service().from("profiles").select("id, display_name").eq("friend_code", code).maybeSingle();
  if (error) return { ok: false, error: "Recherche impossible pour l'instant." };
  if (!target) return { ok: false, error: "Aucun capitaine ne porte ce code." };
  if (target.id === userId) return { ok: false, error: "C'est ton propre code." };

  const existing = await readFriendship(userId, target.id);
  if (existing?.status === "accepted") return { ok: false, error: `${target.display_name} est déjà dans tes amis.` };
  if (existing?.requested_by === userId) return { ok: false, error: `Demande déjà envoyée à ${target.display_name}.` };
  if (existing) {
    // Il nous avait déjà demandé : ajouter son code vaut acceptation.
    return respondToFriendRequest(userId, target.id, true);
  }

  const { data: rows } = await service()
    .from("friendships")
    .select("status, requested_by")
    .or(`user_a.eq.${userId},user_b.eq.${userId}`);
  const accepted = (rows ?? []).filter((row) => row.status === "accepted").length;
  const pendingOut = (rows ?? []).filter((row) => row.status === "pending" && row.requested_by === userId).length;
  if (accepted >= MAX_FRIENDS) return { ok: false, error: `Ta liste est pleine (${MAX_FRIENDS} amis).` };
  if (pendingOut >= MAX_PENDING_OUTGOING) return { ok: false, error: "Trop de demandes en attente : laisse-leur le temps de répondre." };

  const { error: insertError } = await service()
    .from("friendships")
    .insert({ ...pairOf(userId, target.id), requested_by: userId, status: "pending" });
  if (insertError) return { ok: false, error: "Demande impossible pour l'instant." };
  return { ok: true, message: `Demande envoyée à ${target.display_name}.` };
}

export async function respondToFriendRequest(userId: string, otherId: string, accept: boolean): Promise<FriendResult> {
  const existing = await readFriendship(userId, otherId);
  // Seul le DESTINATAIRE répond à une demande.
  if (!existing || existing.status !== "pending" || existing.requested_by === userId) {
    return { ok: false, error: "Cette demande n'existe plus." };
  }
  const pair = pairOf(userId, otherId);
  const { error } = accept
    ? await service().from("friendships").update({ status: "accepted", accepted_at: new Date().toISOString() }).match(pair)
    : await service().from("friendships").delete().match(pair);
  if (error) return { ok: false, error: "Réponse impossible pour l'instant." };
  return { ok: true, message: accept ? "Vous êtes maintenant amis." : "Demande refusée." };
}

/** Retire un ami, ou annule une demande envoyée. */
export async function removeFriend(userId: string, otherId: string): Promise<FriendResult> {
  const { error } = await service().from("friendships").delete().match(pairOf(userId, otherId));
  if (error) return { ok: false, error: "Impossible pour l'instant." };
  return { ok: true };
}

export async function touchPresence(userId: string): Promise<void> {
  const { error } = await service().from("player_presence").upsert({ user_id: userId, last_seen_at: new Date().toISOString() });
  if (error) console.error("[touchPresence] Présence non notée :", error.message);
}

/** Défis reçus encore relevables : en attente, partie toujours ouverte, pas trop anciens. */
export async function readIncomingChallenges(userId: string): Promise<IncomingChallenge[]> {
  const since = new Date(Date.now() - CHALLENGE_TTL_MS).toISOString();
  const { data: challenges, error } = await service()
    .from("friend_challenges")
    .select("id, from_user, match_id, created_at")
    .eq("to_user", userId)
    .eq("status", "pending")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(10);
  if (error || !challenges || challenges.length === 0) return [];

  const { data: matches } = await service()
    .from("matches")
    .select("id, invite_code, status")
    .in("id", challenges.map((row) => row.match_id));
  const open = new Map((matches ?? []).filter((row) => row.status === "waiting").map((row) => [row.id, row.invite_code]));
  const names = await namesOf(challenges.map((row) => row.from_user));

  return challenges
    .filter((row) => open.has(row.match_id))
    .map((row) => ({
      id: row.id,
      fromUserId: row.from_user,
      fromName: names.get(row.from_user) ?? "Un ami",
      inviteCode: open.get(row.match_id)!,
      createdAt: row.created_at,
    }));
}

export async function readSocial(userId: string): Promise<SocialView> {
  const db = service();
  const [{ data: me }, { data: rows }] = await Promise.all([
    db.from("profiles").select("friend_code").eq("id", userId).maybeSingle(),
    db.from("friendships").select("*").or(`user_a.eq.${userId},user_b.eq.${userId}`),
  ]);
  const links = rows ?? [];
  const otherIds = links.map((row) => otherOf(row, userId));
  const acceptedIds = links.filter((row) => row.status === "accepted").map((row) => otherOf(row, userId));

  const [names, presence, playing, challenges] = await Promise.all([
    namesOf(otherIds),
    acceptedIds.length > 0
      ? db.from("player_presence").select("user_id, last_seen_at").in("user_id", acceptedIds)
      : Promise.resolve({ data: [] as { user_id: string; last_seen_at: string }[] }),
    acceptedIds.length > 0
      ? db
          .from("matches")
          .select("player1_id, player2_id")
          .eq("status", "active")
          .or(`player1_id.in.(${acceptedIds.join(",")}),player2_id.in.(${acceptedIds.join(",")})`)
      : Promise.resolve({ data: [] as { player1_id: string | null; player2_id: string | null }[] }),
    readIncomingChallenges(userId),
  ]);

  const lastSeen = new Map((presence.data ?? []).map((row) => [row.user_id, row.last_seen_at]));
  const inMatch = new Set((playing.data ?? []).flatMap((row) => [row.player1_id, row.player2_id]).filter(Boolean) as string[]);
  const nameOf = (id: string) => names.get(id) ?? "Capitaine";
  const order: Record<FriendPresence, number> = { online: 0, in_match: 1, offline: 2 };

  return {
    friendCode: me?.friend_code ?? "",
    friends: acceptedIds
      .map((id) => ({ userId: id, name: nameOf(id), presence: presenceOf(lastSeen.get(id), inMatch.has(id)) }))
      .sort((a, b) => order[a.presence] - order[b.presence] || a.name.localeCompare(b.name, "fr")),
    incoming: links
      .filter((row) => row.status === "pending" && row.requested_by !== userId)
      .map((row) => ({ userId: otherOf(row, userId), name: nameOf(otherOf(row, userId)) })),
    outgoing: links
      .filter((row) => row.status === "pending" && row.requested_by === userId)
      .map((row) => ({ userId: otherOf(row, userId), name: nameOf(otherOf(row, userId)) })),
    challenges,
  };
}

/**
 * Défie un ami : crée un match amical en attente et remet son code à l'ami.
 * Réservé aux amitiés ACCEPTÉES — on ne défie pas un inconnu.
 */
export async function challengeFriend(
  userId: string,
  friendId: string,
  deckId: string
): Promise<{ ok: true; matchId: string } | { ok: false; error: string }> {
  const link = await readFriendship(userId, friendId);
  if (link?.status !== "accepted") return { ok: false, error: "Tu ne peux défier que tes amis." };

  const created = await createWaitingMatch(userId, deckId);
  if (!created.ok) return created;

  const { error } = await service().from("friend_challenges").insert({ from_user: userId, to_user: friendId, match_id: created.matchId, status: "pending" });
  if (error) {
    console.error("[challengeFriend] Défi non enregistré :", error.message);
    return { ok: false, error: "Défi impossible pour l'instant." };
  }
  return { ok: true, matchId: created.matchId };
}

/** Décline un défi reçu : la partie de l'hôte est fermée, sa salle d'attente le lui dit. */
export async function declineChallenge(userId: string, challengeId: string): Promise<FriendResult> {
  const { data: challenge } = await service()
    .from("friend_challenges")
    .select("match_id")
    .eq("id", challengeId)
    .eq("to_user", userId)
    .eq("status", "pending")
    .maybeSingle();
  if (!challenge) return { ok: false, error: "Ce défi n'existe plus." };

  await service().from("friend_challenges").update({ status: "declined" }).eq("id", challengeId);
  await service()
    .from("matches")
    .update({ status: "abandoned", updated_at: new Date().toISOString() })
    .eq("id", challenge.match_id)
    .eq("status", "waiting");
  return { ok: true };
}
