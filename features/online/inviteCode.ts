import { randomInt } from "node:crypto";

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // sans caractères ambigus (0/O, 1/I/L)

/**
 * Code court à partager hors-bande pour rejoindre une partie en attente.
 *
 * Tiré au générateur CRYPTOGRAPHIQUE : `Math.random` est prévisible, et le
 * code est la seule chose qui garde l'accès à une partie privée.
 */
export function generateInviteCode(length = 6): string {
  let code = "";
  for (let i = 0; i < length; i++) {
    code += ALPHABET[randomInt(ALPHABET.length)];
  }
  return code;
}
