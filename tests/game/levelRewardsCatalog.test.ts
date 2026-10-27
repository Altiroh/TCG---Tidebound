import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LEVEL_REWARDS } from "@/game/progression/levelRewards";
import { CARD_BACKS } from "@/game/cosmetics/cardBacks";
import { SHIP_FRAMES } from "@/game/cosmetics/shipFrames";
import { PROFILE_FRAMES, profileFrameSrc } from "@/game/cosmetics/profileFrames";
import { TITLE_CATALOG, titleUnlockLevel } from "@/game/titles/catalog";

/**
 * La route des paliers ne promet que ce qui EXISTE (audit du 27/10/2026 :
 * trois cadres de profil, deux titres et un avatar promis n'existaient
 * pas). Chaque cosmétique d'un palier pointe sur un objet de son
 * catalogue, débloqué au plus tard à ce niveau.
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
            : reward.cosmetic === "frame"
              ? PROFILE_FRAMES.find((entry) => entry.id === reward.id)
              : reward.cosmetic === "title"
                ? TITLE_CATALOG.find((entry) => entry.id === reward.id)
                : undefined;
      expect(found, `niveau ${reward.level} : ${reward.cosmetic} « ${reward.id} » n'existe pas`).toBeDefined();
    }
  });

  it("un cadre ou un titre de palier se débloque au niveau qui le promet — rattrapé pour qui l'a déjà", () => {
    for (const reward of cosmetics) {
      if (reward.cosmetic === "frame") {
        const frame = PROFILE_FRAMES.find((entry) => entry.id === reward.id)!;
        expect(frame.unlock, reward.id).toEqual({ kind: "level", level: reward.level });
      }
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

describe("cadres de profil", () => {
  it("un cadre dont le visuel n'est pas déposé reste « à venir » ; déposé, il doit s'équiper", () => {
    for (const frame of PROFILE_FRAMES) {
      const fileThere = existsSync(`public${frame.src}`);
      if (frame.artPending) expect(fileThere, `${frame.id} : visuel déposé — retirer « artPending »`).toBe(false);
      else expect(fileThere, `${frame.id} : visuel ${frame.src} manquant`).toBe(true);
    }
  });

  it("la photo montre le cadre porté, ou celui d'origine (inconnu, ou pas encore peint)", () => {
    expect(profileFrameSrc(null)).toBe("/assets/profile/photo-frame.webp");
    expect(profileFrameSrc("inconnu")).toBe("/assets/profile/photo-frame.webp");
    const pending = PROFILE_FRAMES.find((frame) => frame.artPending);
    if (pending) expect(profileFrameSrc(pending.id)).toBe("/assets/profile/photo-frame.webp");
  });
});
