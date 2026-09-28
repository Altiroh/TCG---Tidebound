/**
 * Contrôle de FORME d'un coup reçu du navigateur, avant le moteur.
 *
 * Le moteur valide la légalité d'un coup, mais fait confiance aux types
 * TypeScript de ses champs — et une Server Action reçoit ce que le client
 * veut bien envoyer. Un `NaN` (que la sérialisation des Server Actions sait
 * transmettre) passait sous les comparaisons de budget d'un soin et laissait
 * des dégâts « NaN » sur une unité ; une chaîne de plusieurs mégaoctets ou
 * un tableau de cent mille entrées coûtait au serveur avant d'être refusé.
 *
 * Règle générique, indépendante des types de coups : ce qui passe ici a la
 * FORME d'un coup ; le moteur décide ensuite s'il est légal.
 */

const MAX_DEPTH = 6;
const MAX_STRING = 200;
const MAX_ARRAY = 100;
const MAX_KEYS = 40;

export function hasSaneActionShape(value: unknown, depth = 0): boolean {
  if (depth > MAX_DEPTH) return false;
  if (value === null || value === undefined || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "string") return value.length <= MAX_STRING;
  if (Array.isArray(value)) return value.length <= MAX_ARRAY && value.every((entry) => hasSaneActionShape(entry, depth + 1));
  if (typeof value === "object") {
    // Objet ordinaire seulement : ni Map, ni Date, ni prototype exotique.
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) return false;
    const entries = Object.entries(value);
    return entries.length <= MAX_KEYS && entries.every(([key, entry]) => key.length <= 64 && hasSaneActionShape(entry, depth + 1));
  }
  return false;
}
