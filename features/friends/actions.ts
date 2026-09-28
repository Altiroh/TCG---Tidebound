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
  touchPresence,
  type FriendResult,
  type IncomingChallenge,
  type SocialView,
} from "@/features/friends/friendService";
import { getSessionUser } from "@/lib/supabase/sessionUser";

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
 * la présence du joueur et rend ses défis en attente, pour l'alerter où
 * qu'il soit. `null` hors connexion — ni erreur, ni redirection.
 */
export async function pollSocial(): Promise<{ challenges: IncomingChallenge[] } | null> {
  try {
    // Dans le `try` : appelé sur TOUS les écrans, il ne doit jamais faire
    // tomber une requête — configuration Supabase absente comprise.
    const user = await getSessionUser();
    if (!user) return null;
    await touchPresence(user.id);
    return { challenges: await readIncomingChallenges(user.id) };
  } catch (error) {
    console.error("[pollSocial] Échec :", error);
    return null;
  }
}
