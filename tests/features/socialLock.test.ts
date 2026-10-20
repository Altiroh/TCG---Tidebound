import { describe, expect, it } from "vitest";
import { SOCIAL_BLOQUE_HORS_DEV, socialLocked } from "@/features/friends/socialLock";

/** Volet social (amis, vitrine, échanges, présentation) réservé au mode Dev (20/10/2026). */
describe("volet social — fermé hors mode Dev", () => {
  it("fermé pour un joueur, ouvert en mode Dev", () => {
    expect(SOCIAL_BLOQUE_HORS_DEV).toBe(true);
    expect(socialLocked(false)).toBe(true);
    expect(socialLocked(true)).toBe(false);
  });
});
