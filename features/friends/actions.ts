"use server";

import { revalidatePath } from "next/cache";
import {
  challengeFriend as challengeFriendFor,
  declineChallenge as declineChallengeFor,
  readIncomingChallenges,
  readSocial,
  removeFriend as removeFriendFor,
  respondToFriendRequest as respondFor,
  sendFriendRequest as sendFor,
  sendFriendRequestToOpponent,
  touchPresence,
  type FriendResult,
  type IncomingChallenge,
  type SocialView,
} from "@/features/friends/friendService";
import { readPlayerCard, readRecentOpponents, type PlayerCardView, type RecentOpponent } from "@/features/friends/playerCardService";
import { readIncomingTradeIds } from "@/features/friends/tradeService";
import { getSessionUser } from "@/lib/supabase/sessionUser";
import { devModeActive } from "@/features/admin/roles";
import { friendlyMatchLocked, MATCH_AMICAL_INDISPONIBLE } from "@/features/online/friendlyMatchLock";

/**
 * Amis — Server Actions exposées au navigateur. Le joueur est TOUJOURS tiré
 * de la session ; les identifiants reçus (ami, défi) ne désignent que
 * l'AUTRE partie, et le service vérifie le lien avant d'agir.
 */

const SIGNED_OUT: FriendResult = { ok: false, error: "Connecte-toi pour gérer tes amis." };

function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function done(result: FriendResult): FriendResult {
  if (result.ok) revalidatePath("/amis");
  return result;
}

export async function fetchSocial(): Promise<SocialView | null> {
  try {
    const user = await getSessionUser();
    if (!user) return null;
    return await readSocial(user.id);
  } catch (error) {
    console.error("[fetchSocial] Lecture impossible :", error);
    return null;
  }
}

export async function addFriendByCode(code: string): Promise<FriendResult> {
  const user = await getSessionUser();
  if (!user) return SIGNED_OUT;
  if (typeof code !== "string") return { ok: false, error: "Code invalide." };
  return done(await sendFor(user.id, code).catch(() => ({ ok: false as const, error: "Demande impossible pour l'instant." })));
}

/** Demande d'ami à un adversaire déjà affronté en ligne (sans son code). */
export async function addFriendFromMatch(otherId: string): Promise<FriendResult> {
  const user = await getSessionUser();
  if (!user) return SIGNED_OUT;
  if (!isUuid(otherId)) return { ok: false, error: "Joueur introuvable." };
  return done(await sendFriendRequestToOpponent(user.id, otherId).catch(() => ({ ok: false as const, error: "Demande impossible pour l'instant." })));
}

/** Fiche d'un joueur lié (ami, demande, ancien adversaire) — `null` sinon. */
export async function fetchPlayerCard(otherId: string): Promise<PlayerCardView | null> {
  try {
    const user = await getSessionUser();
    if (!user || !isUuid(otherId)) return null;
    return await readPlayerCard(user.id, otherId);
  } catch (error) {
    console.error("[fetchPlayerCard] Lecture impossible :", error);
    return null;
  }
}

export async function fetchRecentOpponents(): Promise<RecentOpponent[]> {
  try {
    const user = await getSessionUser();
    if (!user) return [];
    return await readRecentOpponents(user.id);
  } catch (error) {
    console.error("[fetchRecentOpponents] Lecture impossible :", error);
    return [];
  }
}

export async function answerFriendRequest(otherId: string, accept: boolean): Promise<FriendResult> {
  const user = await getSessionUser();
  if (!user) return SIGNED_OUT;
  if (!isUuid(otherId)) return { ok: false, error: "Demande introuvable." };
  return done(await respondFor(user.id, otherId, accept === true).catch(() => ({ ok: false as const, error: "Réponse impossible pour l'instant." })));
}

export async function removeFriend(otherId: string): Promise<FriendResult> {
  const user = await getSessionUser();
  if (!user) return SIGNED_OUT;
  if (!isUuid(otherId)) return { ok: false, error: "Ami introuvable." };
  return done(await removeFriendFor(user.id, otherId));
}

export async function challengeFriend(friendId: string, deckId: string): Promise<{ ok: boolean; error?: string; matchId?: string }> {
  const user = await getSessionUser();
  if (!user) return SIGNED_OUT;
  if (!isUuid(friendId) || typeof deckId !== "string") return { ok: false, error: "Défi impossible." };
  // Match amical fermé hors mode Dev (`friendlyMatchLock.ts`).
  if (friendlyMatchLocked(await devModeActive(user.id))) return { ok: false, error: MATCH_AMICAL_INDISPONIBLE };
  return challengeFriendFor(user.id, friendId, deckId);
}

export async function declineChallenge(challengeId: string): Promise<FriendResult> {
  const user = await getSessionUser();
  if (!user) return SIGNED_OUT;
  if (!isUuid(challengeId)) return { ok: false, error: "Défi introuvable." };
  return declineChallengeFor(user.id, challengeId);
}

/**
 * Signe de vie de l'appli ouverte (`SocialPulse`, toutes les 45 s) : note
 * la présence du joueur et rend ses défis et offres d'échange en attente,
 * pour l'alerter où qu'il soit. `null` hors connexion — ni erreur, ni redirection.
 */
export async function pollSocial(): Promise<{ challenges: IncomingChallenge[]; trades: { id: string; fromName: string }[] } | null> {
  try {
    // Dans le `try` : appelé sur TOUS les écrans, il ne doit jamais faire
    // tomber une requête — configuration Supabase absente comprise.
    const user = await getSessionUser();
    if (!user) return null;
    await touchPresence(user.id);
    const [challenges, trades] = await Promise.all([readIncomingChallenges(user.id), readIncomingTradeIds(user.id).catch(() => [])]);
    return { challenges, trades };
  } catch (error) {
    console.error("[pollSocial] Échec :", error);
    return null;
  }
}
