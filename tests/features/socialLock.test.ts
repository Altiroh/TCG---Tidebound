import { describe, expect, it } from "vitest";
import { SOCIAL_BLOQUE_HORS_DEV, socialLocked } from "@/features/friends/socialLock";

/** Volet social (amis, vitrine, échanges, présentation) : réservé au mode Dev le 20/10/2026, ouvert à tous le 28/10/2026. */
describe("volet social — ouvert à tous", () => {
  it("ouvert pour un joueur comme en mode Dev", () => {
    expect(SOCIAL_BLOQUE_HORS_DEV).toBe(false);
    expect(socialLocked(false)).toBe(false);
    expect(socialLocked(true)).toBe(false);
  });
});
