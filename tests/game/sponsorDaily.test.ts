import { describe, expect, it } from "vitest";
import { sponsorGiftClaimKey, sponsorPointsToday } from "@/game/progression";

/** Mécènes au jour le jour (13/10/2026) : l'intérêt et les colis repartent de zéro chaque jour UTC. */
describe("mécènes : cycle quotidien", () => {
  it("l'intérêt d'aujourd'hui compte, celui d'un jour précédent vaut zéro", () => {
    expect(sponsorPointsToday(40, "2026-10-13T08:00:00.000Z", "2026-10-13")).toBe(40);
    expect(sponsorPointsToday(40, "2026-10-12T23:59:59.000Z", "2026-10-13")).toBe(0);
    expect(sponsorPointsToday(40, null, "2026-10-13")).toBe(0);
  });

  it("un colis se réclame une fois par palier ET par jour", () => {
    const hier = sponsorGiftClaimKey("beladone", "intrigue", "2026-10-12");
    const aujourdhui = sponsorGiftClaimKey("beladone", "intrigue", "2026-10-13");
    expect(hier).not.toBe(aujourdhui);
    expect(aujourdhui).toBe("beladone:intrigue:2026-10-13");
  });
});
