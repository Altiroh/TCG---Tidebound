/**
 * Petits décodeurs pour relire un état mémorisé (`lib/persistedState.ts`).
 * Purs et sans React — utilisables côté serveur comme dans les tests.
 */

/** La valeur si elle fait partie de `allowed`, sinon `undefined`. */
export function oneOf<T extends string | null>(allowed: readonly T[], raw: unknown): T | undefined {
  return (allowed as readonly unknown[]).includes(raw) ? (raw as T) : undefined;
}

/** Les éléments de `raw` qui font partie de `allowed` (doublons écartés) ; `undefined` si ce n'est pas un tableau. */
export function subsetOf<T>(allowed: readonly T[], raw: unknown): T[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  return [...new Set(raw.filter((item) => (allowed as readonly unknown[]).includes(item)) as T[])];
}

/** `raw` vu comme un objet dont on lit des champs, ou `undefined`. */
export function asRecord(raw: unknown): Record<string, unknown> | undefined {
  return raw !== null && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : undefined;
}
