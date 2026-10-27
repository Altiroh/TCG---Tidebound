import { describe, expect, it } from "vitest";
import { LEVEL_REWARDS } from "@/game/progression/levelRewards";
import { CARD_BACKS } from "@/game/cosmetics/cardBacks";
import { SHIP_FRAMES } from "@/game/cosmetics/shipFrames";
import { TITLE_CATALOG, titleUnlockLevel } from "@/game/titles/catalog";

/**
 * La route des paliers ne promet que ce qui EXISTE (audit du 27/10/2026 :
 * trois cadres de profil, deux titres et un avatar promis n'existaient
 * pas ; les cadres de profil ont ensuite été abandonnés pour des cadres de
 * Navire). Chaque cosmétique d'un palier pointe sur un objet de son
 * catalogue, débloqué au plus tard à ce niveau — un cadre de profil
 * (`frame`) n'en a plus, il serait refusé.
 */
describe("récompenses de palier", () => {
  const cosmetics = Object.entries(LEVEL_REWARDS).flatMap(([level, items]) =>
    items.flatMap((item) => (item.kind === "cosmetic" ? [{ level: Number(level), ...item }] : []))
  );

  it("chaque cosmétique promis existe dans son catalogue", () => {
    for (const reward of cosmetics) {
      const found =
        reward.cosmetic === "cardBack"
          ? CARD_BACKS.find((entry) => entry.id === reward.id)
          : reward.cosmetic === "shipSkin"
            ? SHIP_FRAMES.find((entry) => entry.id === reward.id)
            : reward.cosmetic === "title"
              ? TITLE_CATALOG.find((entry) => entry.id === reward.id)
              : undefined;
      expect(found, `niveau ${reward.level} : ${reward.cosmetic} « ${reward.id} » n'existe pas`).toBeDefined();
    }
  });

  it("un cadre ou un titre de palier se débloque au niveau qui le promet — rattrapé pour qui l'a déjà", () => {
    for (const reward of cosmetics) {
      if (reward.cosmetic === "shipSkin") {
        const frame = SHIP_FRAMES.find((entry) => entry.id === reward.id)!;
        if (frame.unlock.kind === "level") expect(frame.unlock.level, reward.id).toBeLessThanOrEqual(reward.level);
      }
      if (reward.cosmetic === "title") {
        const level = titleUnlockLevel(TITLE_CATALOG.find((entry) => entry.id === reward.id)!);
        // Capitaine (exploit « Niveau 40 ») est déjà acquis avant son palier 45.
        if (level !== null) expect(level, reward.id).toBeLessThanOrEqual(reward.level);
      }
    }
  });
});
