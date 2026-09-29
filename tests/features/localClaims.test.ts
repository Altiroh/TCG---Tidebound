import { describe, expect, it } from "vitest";
import type { ProgressionSummary } from "@/features/progression/actions";
import type { ProfileSummary } from "@/features/progression/profileActions";
import { claimKey, masteriesSheetHasClaims, sponsorsSheetHasClaims, withLocalClaims } from "@/features/progression/localClaims";
import { withoutClaimed } from "@/features/progression/progressionSync";

/**
 * UNE RÉCLAMATION SE VOIT TOUT DE SUITE.
 *
 * Avant, le raccourci du bandeau, la pastille d'onglet et le bouton
 * « Réclamer » restaient affichés jusqu'à la relecture serveur (une à deux
 * secondes), et la fenêtre Mécènes / Maîtrises restait ouverte, vide.
 */

function summary(breakdown: Partial<ProgressionSummary["claimableBreakdown"]>, extra: Partial<ProgressionSummary> = {}): ProgressionSummary {
  const full = { levels: 0, cardChoices: 0, login: 0, quests: 0, achievements: 0, sponsorGifts: 0, masteries: 0, ...breakdown };
  const total = Object.values(full).reduce((sum, value) => sum + value, 0);
  return {
    isSignedIn: true,
    claimableBreakdown: full,
    claimableRewards: total,
    claimableQuests: full.quests,
    weeklyChestReady: false,
    loginClaimable: full.login > 0,
    ...extra,
  } as unknown as ProgressionSummary;
}

describe("bandeau : withoutClaimed", () => {
  it("retire le raccourci réclamé et baisse la pastille d'autant", () => {
    const next = withoutClaimed(summary({ masteries: 1, quests: 2 }), { masteries: 1 });
    expect(next.claimableBreakdown.masteries).toBe(0);
    expect(next.claimableBreakdown.quests).toBe(2);
    expect(next.claimableRewards).toBe(2);
  });

  it("ne descend jamais sous zéro", () => {
    const next = withoutClaimed(summary({ levels: 1 }), { levels: 3, achievements: 2 });
    expect(next.claimableBreakdown.levels).toBe(0);
    expect(next.claimableBreakdown.achievements).toBe(0);
    expect(next.claimableRewards).toBe(0);
  });

  it("ferme le coffre et l'escale du jour", () => {
    const next = withoutClaimed(summary({ login: 1 }, { weeklyChestReady: true }), { chest: 1, login: 1 });
    expect(next.weeklyChestReady).toBe(false);
    expect(next.loginClaimable).toBe(false);
  });

  it("les quêtes suivent le détail", () => {
    expect(withoutClaimed(summary({ quests: 2 }), { quests: 1 }).claimableQuests).toBe(1);
  });
});

function profile(): ProfileSummary {
  return {
    claimableLevels: [4, 5],
    claimedLevelNumbers: [1, 2, 3],
    login: { claimable: true },
    quests: [{ questId: "q1", periodKey: "2026-09-29", completed: true, claimed: false }],
    achievements: [{ code: "a1", claimable: true }],
    hub: {
      weeklyChest: { claimable: true, claimed: false },
      masteries: [{ shipId: "s1", claimableLevels: [2] }],
      sponsors: [{ id: "sp1", giftStages: ["interesse"], openedStages: [] }],
      audienceMilestones: [{ threshold: 100, claimable: false, claimed: false }],
    },
  } as unknown as ProfileSummary;
}

describe("écran : withLocalClaims", () => {
  it("sans clé, rend le profil tel quel", () => {
    const base = profile();
    expect(withLocalClaims(base, new Set())).toBe(base);
  });

  it("montre faits palier, escale, quête, exploit, coffre", () => {
    const next = withLocalClaims(
      profile(),
      new Set([claimKey.level(4), claimKey.login(), claimKey.quest("q1", "2026-09-29"), claimKey.achievement("a1"), claimKey.chest()])
    );
    expect(next.claimableLevels).toEqual([5]);
    expect(next.claimedLevelNumbers).toContain(4);
    expect(next.login.claimable).toBe(false);
    expect(next.quests[0]?.claimed).toBe(true);
    expect(next.achievements[0]?.claimable).toBe(false);
    expect(next.hub?.weeklyChest).toMatchObject({ claimable: false, claimed: true });
  });

  it("vide les fenêtres du hub : elles n'ont plus rien à réclamer", () => {
    const base = profile();
    expect(masteriesSheetHasClaims(base)).toBe(true);
    expect(sponsorsSheetHasClaims(base)).toBe(true);
    const next = withLocalClaims(base, new Set([claimKey.mastery("s1", 2), claimKey.gift("sp1", "interesse" as never)]));
    expect(masteriesSheetHasClaims(next)).toBe(false);
    expect(sponsorsSheetHasClaims(next)).toBe(false);
    expect(next.hub?.sponsors[0]?.openedStages).toEqual(["interesse"]);
  });
});
