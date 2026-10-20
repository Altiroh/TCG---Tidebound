import { describe, expect, it } from "vitest";
import { friendlyMatchLocked, MATCH_AMICAL_BLOQUE_HORS_DEV } from "@/features/online/friendlyMatchLock";

/** Match amical temporairement fermé hors mode Dev (20/10/2026). */
describe("match amical — fermé hors mode Dev", () => {
  it("fermé pour un joueur, ouvert en mode Dev", () => {
    expect(MATCH_AMICAL_BLOQUE_HORS_DEV).toBe(true);
    expect(friendlyMatchLocked(false)).toBe(true);
    expect(friendlyMatchLocked(true)).toBe(false);
  });
});
