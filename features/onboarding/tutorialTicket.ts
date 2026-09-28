import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Ticket de tutoriel — module SERVEUR, sans directive `"use server"`.
 *
 * La partie guidée est jouée dans le navigateur : le serveur ne peut pas
 * PROUVER qu'elle l'a été. Avant ce ticket, `completeTutorial(true)` appelé
 * depuis la console suffisait à toucher le booster de récompense. Le ticket
 * relève le coût de la triche sans toucher au joueur honnête :
 *
 *   - il est délivré au LANCEMENT de la partie guidée, signé par le serveur
 *     et lié au compte ;
 *   - il n'est accepté à la fin qu'après une durée minimale, qu'aucun
 *     tutoriel réellement joué ne descend sous elle.
 *
 * Le booster reste de toute façon unique par compte (`finish_tutorial`).
 */

/** Durée minimale entre le lancement du tutoriel et sa complétion récompensée. */
export const TUTORIAL_MIN_MS = 60_000;
/** Au-delà, le ticket est périmé : il faut relancer la partie guidée. */
export const TUTORIAL_MAX_MS = 24 * 60 * 60 * 1000;

function secret(): string | null {
  return process.env.TUTORIAL_TICKET_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || null;
}

function sign(userId: string, issuedAt: number, key: string): string {
  return createHmac("sha256", key).update(`tutoriel:${userId}:${issuedAt}`).digest("base64url");
}

/** Ticket pour `userId`, daté de `now`. `null` si le serveur n'a pas de clé pour signer. */
export function issueTutorialTicket(userId: string, now = Date.now()): string | null {
  const key = secret();
  if (!key) return null;
  return `${now}.${sign(userId, now, key)}`;
}

export type TutorialTicketVerdict = "ok" | "invalid" | "too-early" | "expired";

/** Le ticket a-t-il été délivré à CE compte, et le tutoriel a-t-il duré assez longtemps ? */
export function verifyTutorialTicket(userId: string, ticket: unknown, now = Date.now()): TutorialTicketVerdict {
  const key = secret();
  if (!key || typeof ticket !== "string") return "invalid";
  const [rawIssuedAt, signature] = ticket.split(".");
  const issuedAt = Number(rawIssuedAt);
  if (!Number.isSafeInteger(issuedAt) || !signature) return "invalid";

  const expected = Buffer.from(sign(userId, issuedAt, key));
  const received = Buffer.from(signature);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return "invalid";

  const elapsed = now - issuedAt;
  if (elapsed < TUTORIAL_MIN_MS) return "too-early";
  if (elapsed > TUTORIAL_MAX_MS) return "expired";
  return "ok";
}
