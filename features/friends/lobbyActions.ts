"use server";

import {
  answerBattleInvitation as answerFor,
  chooseLobbyDeck as chooseFor,
  inviteToBattle as inviteFor,
  leaveLobby as leaveFor,
  readBattleInvitations,
  readLobby,
  setLobbyReady as readyFor,
  type BattleInvitation,
  type LobbyResult,
  type LobbyView,
} from "@/features/friends/lobbyService";
import { socialClosedFor } from "@/features/friends/socialGate";
import { SOCIAL_INDISPONIBLE } from "@/features/friends/socialLock";
import { getSessionUser } from "@/lib/supabase/sessionUser";

/**
 * Salon de combat entre amis — Server Actions. Le joueur est TOUJOURS tiré
 * de la session ; l'ami et le salon reçus ne désignent que l'autre partie,
 * et le service vérifie la place de l'appelant avant d'agir.
 */

const SIGNED_OUT = { ok: false as const, error: "Connecte-toi pour combattre tes amis." };
/** Volet social réservé au mode Dev (`socialLock.ts`). */
const CLOSED = { ok: false as const, error: SOCIAL_INDISPONIBLE };

function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

async function player(): Promise<{ id: string } | { error: { ok: false; error: string } }> {
  const user = await getSessionUser();
  if (!user) return { error: SIGNED_OUT };
  if (await socialClosedFor(user.id)) return { error: CLOSED };
  return { id: user.id };
}

export async function inviteToBattle(friendId: string): Promise<{ ok: true; lobbyId: string } | { ok: false; error: string }> {
  const me = await player();
  if ("error" in me) return me.error;
  if (!isUuid(friendId)) return { ok: false, error: "Ami introuvable." };
  return inviteFor(me.id, friendId).catch(() => ({ ok: false as const, error: "Invitation impossible pour l'instant." }));
}

/** Invitations au combat reçues — le Courrier les montre en tête. */
export async function fetchBattleInvitations(): Promise<BattleInvitation[]> {
  try {
    const me = await player();
    if ("error" in me) return [];
    return await readBattleInvitations(me.id);
  } catch (error) {
    console.error("[fetchBattleInvitations] Lecture impossible :", error);
    return [];
  }
}

export async function answerBattleInvitation(lobbyId: string, accept: boolean): Promise<LobbyResult> {
  const me = await player();
  if ("error" in me) return me.error;
  if (!isUuid(lobbyId)) return { ok: false, error: "Invitation introuvable." };
  return answerFor(me.id, lobbyId, accept === true).catch(() => ({ ok: false as const, error: "Réponse impossible pour l'instant." }));
}

/** Le salon vu par l'appelant — appelé en boucle par l'écran : c'est aussi son signe de vie. */
export async function fetchLobby(lobbyId: string): Promise<LobbyView | null> {
  try {
    const me = await player();
    if ("error" in me || !isUuid(lobbyId)) return null;
    return await readLobby(me.id, lobbyId);
  } catch (error) {
    console.error("[fetchLobby] Lecture impossible :", error);
    return null;
  }
}

export async function chooseLobbyDeck(lobbyId: string, deckId: string): Promise<LobbyResult> {
  const me = await player();
  if ("error" in me) return me.error;
  if (!isUuid(lobbyId) || typeof deckId !== "string" || deckId.length > 100) return { ok: false, error: "Deck introuvable." };
  return chooseFor(me.id, lobbyId, deckId).catch(() => ({ ok: false as const, error: "Choix impossible pour l'instant." }));
}

export async function setLobbyReady(lobbyId: string, ready: boolean): Promise<LobbyResult> {
  const me = await player();
  if ("error" in me) return me.error;
  if (!isUuid(lobbyId)) return { ok: false, error: "Salon introuvable." };
  return readyFor(me.id, lobbyId, ready === true).catch(() => ({ ok: false as const, error: "Impossible pour l'instant." }));
}

export async function leaveLobby(lobbyId: string): Promise<LobbyResult> {
  const me = await player();
  if ("error" in me) return me.error;
  if (!isUuid(lobbyId)) return { ok: false, error: "Salon introuvable." };
  return leaveFor(me.id, lobbyId).catch(() => ({ ok: false as const, error: "Impossible pour l'instant." }));
}
