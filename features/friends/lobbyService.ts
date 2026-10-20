import { createGameState } from "@/game";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";
import { resolveMatchDeck } from "@/features/decks/matchDeck";
import { deckRejection } from "@/features/online/waitingMatch";
import { generateInviteCode } from "@/features/online/inviteCode";
import { readPlayerCards, type PlayerCardView } from "@/features/friends/playerCardService";
import { countdownLeft, inviteExpired, isPresent, LOBBY_INVITE_TTL_MS, type LobbyStatus } from "@/features/friends/lobbyRules";

/**
 * SALON DE COMBAT entre amis — module SERVEUR, sans directive `"use server"`
 * (l'identifiant du joueur est un paramètre, tiré de la session par
 * `lobbyActions.ts`). Table `battle_lobbies`, migration `20261113120000`.
 *
 * L'hôte invite un ami ; l'invitation arrive dans le Courrier de l'ami. Une
 * fois dedans, chacun choisit son deck et se déclare prêt ; quand les deux
 * le sont, un compte à rebours part, puis le serveur crée la partie — un
 * match amical, sans récompense. Le serveur seul décide du départ : le
 * premier sondage qui constate le compte écoulé le réclame (mise à jour
 * conditionnelle), et lui seul crée la partie.
 */

export type LobbyResult = { ok: true; message?: string } | { ok: false; error: string };

export interface BattleInvitation {
  id: string;
  fromUserId: string;
  fromName: string;
  createdAt: string;
}

export interface LobbySide {
  player: PlayerCardView;
  /** Son deck : connu de lui seul ; l'adversaire ne sait que s'il en a choisi un. */
  deckId: string | null;
  hasDeck: boolean;
  ready: boolean;
  present: boolean;
}

export interface LobbyView {
  id: string;
  status: LobbyStatus;
  /** Ma place : l'hôte a invité, l'invité a accepté. */
  side: "host" | "guest";
  me: LobbySide;
  other: LobbySide;
  /** Millisecondes avant le départ, ou `null` sans compte à rebours. */
  countdownMs: number | null;
  /** La partie créée : les deux écrans y entrent. */
  matchId: string | null;
  error: string | null;
}

type LobbyRow = {
  id: string;
  host_id: string;
  guest_id: string;
  status: LobbyStatus;
  host_deck_id: string | null;
  guest_deck_id: string | null;
  host_ready: boolean;
  guest_ready: boolean;
  host_seen_at: string | null;
  guest_seen_at: string | null;
  countdown_at: string | null;
  match_id: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

/** Un lancement interrompu (serveur tombé entre la réclamation et la création) se rouvre au bout de ce délai. */
const STALE_START_MS = 20_000;

function service() {
  return createSupabaseServiceRoleClient();
}

function now(): string {
  return new Date().toISOString();
}

function pairOf(a: string, b: string): { user_a: string; user_b: string } {
  return a < b ? { user_a: a, user_b: b } : { user_a: b, user_b: a };
}

async function areFriends(a: string, b: string): Promise<boolean> {
  const { data } = await service().from("friendships").select("status").match(pairOf(a, b)).maybeSingle();
  return data?.status === "accepted";
}

async function readRow(lobbyId: string): Promise<LobbyRow | null> {
  const { data, error } = await service().from("battle_lobbies").select("*").eq("id", lobbyId).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as LobbyRow | null) ?? null;
}

type LobbyPatch = Database["public"]["Tables"]["battle_lobbies"]["Update"];

/** Les colonnes d'UN côté du salon, sans clé calculée (le typage les vérifie). */
function deckPatch(side: "host" | "guest", deckId: string): LobbyPatch {
  return side === "host" ? { host_deck_id: deckId, host_ready: false } : { guest_deck_id: deckId, guest_ready: false };
}

function readyPatch(side: "host" | "guest", ready: boolean): LobbyPatch {
  return side === "host" ? { host_ready: ready } : { guest_ready: ready };
}

function seenPatch(side: "host" | "guest", seenAt: string): LobbyPatch {
  return side === "host" ? { host_seen_at: seenAt } : { guest_seen_at: seenAt };
}

function sideOf(row: LobbyRow, userId: string): "host" | "guest" | null {
  if (row.host_id === userId) return "host";
  if (row.guest_id === userId) return "guest";
  return null;
}

/** Invite un AMI au combat : un nouveau salon, les précédents de l'hôte sont fermés. */
export async function inviteToBattle(hostId: string, guestId: string): Promise<{ ok: true; lobbyId: string } | { ok: false; error: string }> {
  if (hostId === guestId || !(await areFriends(hostId, guestId))) return { ok: false, error: "Tu ne peux proposer un combat qu'à tes amis." };
  const db = service();
  await db.from("battle_lobbies").update({ status: "cancelled", updated_at: now() }).eq("host_id", hostId).in("status", ["invited", "open"]);
  const { data, error } = await db
    .from("battle_lobbies")
    .insert({ host_id: hostId, guest_id: guestId, status: "invited", host_seen_at: now() })
    .select("id")
    .single();
  if (error || !data) {
    console.error("[inviteToBattle] Salon non créé :", error?.message);
    return { ok: false, error: "Invitation impossible pour l'instant." };
  }
  return { ok: true, lobbyId: data.id };
}

/** Invitations reçues encore valables (moins de 10 min, l'hôte toujours dans son salon). */
export async function readBattleInvitations(userId: string): Promise<BattleInvitation[]> {
  const since = new Date(Date.now() - LOBBY_INVITE_TTL_MS).toISOString();
  const { data, error } = await service()
    .from("battle_lobbies")
    .select("id, host_id, created_at")
    .eq("guest_id", userId)
    .eq("status", "invited")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(10);
  if (error) {
    // Base sans la migration `20261113120000` : pas d'invitation, sans bruit.
    console.warn("[readBattleInvitations] Salons illisibles :", error.message);
    return [];
  }
  const rows = data ?? [];
  if (rows.length === 0) return [];
  const { data: profiles } = await service().from("profiles").select("id, display_name").in("id", [...new Set(rows.map((row) => row.host_id))]);
  const names = new Map((profiles ?? []).map((row) => [row.id, row.display_name]));
  return rows.map((row) => ({ id: row.id, fromUserId: row.host_id, fromName: names.get(row.host_id) ?? "Un ami", createdAt: row.created_at }));
}

/** L'invité accepte (il entre dans le salon) ou refuse. */
export async function answerBattleInvitation(userId: string, lobbyId: string, accept: boolean): Promise<LobbyResult> {
  const row = await readRow(lobbyId);
  if (!row || row.guest_id !== userId || row.status !== "invited" || inviteExpired(row.created_at)) {
    return { ok: false, error: "Cette invitation n'est plus valable." };
  }
  const { data } = await service()
    .from("battle_lobbies")
    .update(accept ? { status: "open", guest_seen_at: now(), updated_at: now() } : { status: "declined", updated_at: now() })
    .eq("id", lobbyId)
    .eq("status", "invited")
    .select("id");
  if ((data ?? []).length === 0) return { ok: false, error: "Cette invitation n'est plus valable." };
  return { ok: true };
}

/** Quitter le salon (ou retirer son invitation) : il se ferme pour les deux. */
export async function leaveLobby(userId: string, lobbyId: string): Promise<LobbyResult> {
  const row = await readRow(lobbyId);
  if (!row || !sideOf(row, userId)) return { ok: false, error: "Salon introuvable." };
  await service().from("battle_lobbies").update({ status: "cancelled", updated_at: now() }).eq("id", lobbyId).in("status", ["invited", "open"]);
  return { ok: true };
}

/** Choisir son deck : il doit être jouable ; changer de deck retire le « prêt ». */
export async function chooseLobbyDeck(userId: string, lobbyId: string, deckId: string): Promise<LobbyResult> {
  const row = await readRow(lobbyId);
  const side = row ? sideOf(row, userId) : null;
  if (!row || !side) return { ok: false, error: "Salon introuvable." };
  if (row.status !== "open" && row.status !== "invited") return { ok: false, error: "Le salon n'accepte plus de changement." };
  const deck = await resolveMatchDeck(userId, deckId);
  if (!deck.ok) return { ok: false, error: deckRejection(deck) };
  await service()
    .from("battle_lobbies")
    .update({ ...deckPatch(side, deckId), countdown_at: null, last_error: null, updated_at: now() })
    .eq("id", lobbyId);
  return { ok: true };
}

/**
 * Se déclarer prêt (ou se dédire). Prêt demande un deck. Quand les deux le
 * sont, le compte à rebours part — posé par une mise à jour CONDITIONNELLE
 * (les deux prêts, pas encore de compte) : deux « prêt » simultanés n'en
 * lancent qu'un. Se dédire l'arrête.
 */
export async function setLobbyReady(userId: string, lobbyId: string, ready: boolean): Promise<LobbyResult> {
  const row = await readRow(lobbyId);
  const side = row ? sideOf(row, userId) : null;
  if (!row || !side) return { ok: false, error: "Salon introuvable." };
  if (row.status !== "open") return { ok: false, error: row.status === "invited" ? "Ton ami n'a pas encore rejoint le salon." : "Le salon est fermé." };
  if (ready && !row[`${side}_deck_id`]) return { ok: false, error: "Choisis d'abord ton deck." };

  const db = service();
  await db
    .from("battle_lobbies")
    .update(ready ? { ...readyPatch(side, true), updated_at: now() } : { ...readyPatch(side, false), countdown_at: null, updated_at: now() })
    .eq("id", lobbyId)
    .eq("status", "open");
  if (ready) {
    await db
      .from("battle_lobbies")
      .update({ countdown_at: now(), last_error: null })
      .eq("id", lobbyId)
      .eq("status", "open")
      .eq("host_ready", true)
      .eq("guest_ready", true)
      .is("countdown_at", null);
  }
  return { ok: true };
}

/**
 * Lance la partie si le compte à rebours est écoulé. Le salon est d'abord
 * RÉCLAMÉ (`open` → `starting`, à condition que ce soit toujours le même
 * compte à rebours) : un seul appel crée la partie.
 */
async function startIfDue(row: LobbyRow): Promise<void> {
  if (row.status !== "open" || !row.host_ready || !row.guest_ready || countdownLeft(row.countdown_at) !== 0) return;
  const db = service();
  const { data: claimed } = await db
    .from("battle_lobbies")
    .update({ status: "starting", updated_at: now() })
    .eq("id", row.id)
    .eq("status", "open")
    .eq("countdown_at", row.countdown_at!)
    .select("id");
  if ((claimed ?? []).length === 0) return;

  const fail = async (message: string) => {
    await db
      .from("battle_lobbies")
      .update({ status: "open", host_ready: false, guest_ready: false, countdown_at: null, last_error: message, updated_at: now() })
      .eq("id", row.id);
  };

  const [hostDeck, guestDeck] = await Promise.all([resolveMatchDeck(row.host_id, row.host_deck_id ?? ""), resolveMatchDeck(row.guest_id, row.guest_deck_id ?? "")]);
  if (!hostDeck.ok || !guestDeck.ok) {
    await fail("Un des deux decks n'est plus jouable : choisissez-en un autre.");
    return;
  }

  const matchId = crypto.randomUUID();
  const state = createGameState({
    gameId: matchId,
    player1: { id: row.host_id, deck: hostDeck.deck },
    player2: { id: row.guest_id, deck: guestDeck.deck },
    firstPlayer: "coin",
  });
  const { data: created, error } = await db.rpc("create_active_match", {
    p_match_id: matchId,
    p_invite_code: generateInviteCode(),
    // Un match AMICAL : il ne rapporte ni XP, ni Tides, ni quêtes.
    p_mode: "private_invite",
    p_player1_id: row.host_id,
    p_player1_deck_id: row.host_deck_id!,
    p_player2_id: row.guest_id,
    p_player2_deck_id: row.guest_deck_id!,
    p_bot_difficulty: null,
    p_state: state,
  });
  if (error || !created?.ok) {
    console.error("[lobby] Création de la partie refusée :", error?.message ?? created?.error);
    await fail("La partie n'a pas pu démarrer : réessayez.");
    return;
  }
  await db.from("battle_lobbies").update({ status: "started", match_id: matchId, updated_at: now() }).eq("id", row.id);
}

/**
 * Le salon vu par l'un des deux : signe de vie noté, départ déclenché si le
 * compte est écoulé. `null` pour qui n'y a pas sa place.
 */
export async function readLobby(userId: string, lobbyId: string): Promise<LobbyView | null> {
  let row = await readRow(lobbyId);
  const side = row ? sideOf(row, userId) : null;
  if (!row || !side) return null;

  if (row.status === "starting" && Date.now() - Date.parse(row.updated_at) > STALE_START_MS) {
    await service()
      .from("battle_lobbies")
      .update({ status: "open", host_ready: false, guest_ready: false, countdown_at: null, last_error: "Le lancement a échoué : déclarez-vous prêts à nouveau.", updated_at: now() })
      .eq("id", lobbyId)
      .eq("status", "starting");
    row = (await readRow(lobbyId)) ?? row;
  }

  if (row.status === "invited" || row.status === "open") {
    const seen = now();
    await service().from("battle_lobbies").update(seenPatch(side, seen)).eq("id", lobbyId);
    row = { ...row, [`${side}_seen_at`]: seen };
    await startIfDue(row);
    row = (await readRow(lobbyId)) ?? row;
  }

  const other = side === "host" ? "guest" : "host";
  const meId = side === "host" ? row.host_id : row.guest_id;
  const otherId = side === "host" ? row.guest_id : row.host_id;
  const cards = await readPlayerCards([meId, otherId], { [meId]: "self", [otherId]: "friend" });
  if (!cards[meId] || !cards[otherId]) return null;

  return {
    id: row.id,
    status: row.status,
    side,
    me: {
      player: cards[meId]!,
      deckId: row[`${side}_deck_id`],
      hasDeck: Boolean(row[`${side}_deck_id`]),
      ready: row[`${side}_ready`],
      present: true,
    },
    other: {
      player: cards[otherId]!,
      deckId: null,
      hasDeck: Boolean(row[`${other}_deck_id`]),
      ready: row[`${other}_ready`],
      present: row.status !== "invited" && isPresent(row[`${other}_seen_at`]),
    },
    countdownMs: row.status === "open" && row.host_ready && row.guest_ready ? countdownLeft(row.countdown_at) : null,
    matchId: row.match_id,
    error: row.last_error,
  };
}
