/**
 * Salon de combat entre amis — règles PURES (délais, compte à rebours),
 * partagées par le serveur et l'écran du salon.
 */

/** Une invitation sans réponse au bout de ce délai n'est plus proposée. */
export const LOBBY_INVITE_TTL_MS = 10 * 60 * 1000;
/** Les deux sont prêts : la partie part après ce compte à rebours. */
export const LOBBY_COUNTDOWN_MS = 5000;
/** Sans signe de vie depuis ce délai, un capitaine est « absent » du salon. */
export const LOBBY_PRESENCE_MS = 10_000;
/** Cadence du sondage de l'écran du salon : c'est aussi son signe de vie. */
export const LOBBY_POLL_MS = 1500;

export type LobbyStatus = "invited" | "open" | "starting" | "started" | "declined" | "cancelled";

/** Millisecondes avant le départ, ou `null` sans compte à rebours en cours. */
export function countdownLeft(countdownAt: string | null, now = Date.now()): number | null {
  if (!countdownAt) return null;
  return Math.max(0, LOBBY_COUNTDOWN_MS - (now - Date.parse(countdownAt)));
}

export function isPresent(seenAt: string | null, now = Date.now()): boolean {
  return Boolean(seenAt) && now - Date.parse(seenAt!) <= LOBBY_PRESENCE_MS;
}

export function inviteExpired(createdAt: string, now = Date.now()): boolean {
  return now - Date.parse(createdAt) > LOBBY_INVITE_TTL_MS;
}
