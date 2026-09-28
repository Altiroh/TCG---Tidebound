/**
 * Présence d'un ami — règle PURE, partagée par le serveur (qui la calcule)
 * et l'écran (qui l'affiche).
 */

/** L'appli signale sa présence toutes les 45 s (`SocialPulse`) : au-delà de deux minutes de silence, l'ami est parti. */
export const ONLINE_WINDOW_MS = 2 * 60 * 1000;

export type FriendPresence = "in_match" | "online" | "offline";

export function presenceOf(lastSeenAt: string | null | undefined, inMatch: boolean, now = Date.now()): FriendPresence {
  if (inMatch) return "in_match";
  if (!lastSeenAt) return "offline";
  return now - Date.parse(lastSeenAt) <= ONLINE_WINDOW_MS ? "online" : "offline";
}

export const PRESENCE_LABEL: Record<FriendPresence, string> = {
  in_match: "En partie",
  online: "En ligne",
  offline: "Hors ligne",
};

/** Code ami tel qu'on le saisit : majuscules, alphabet des codes, 8 caractères. */
export function normalizeFriendCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
}
