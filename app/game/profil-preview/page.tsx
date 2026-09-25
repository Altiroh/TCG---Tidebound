import type { Metadata } from "next";
import { totalXpForLevel, levelRewardsLabel, LOGIN_CYCLE_LENGTH, LOGIN_STREAK_MILESTONE, loginRewardForStep, loginWeekIndex, loginWeekProgramme, nextMilestones, progressionView, utcDayKey } from "@/game/progression";
import { DEFAULT_CARD_BACK_ID } from "@/game";
import type { ProfileSummary } from "@/features/progression/profileActions";
import { ProfileScreen } from "@/features/progression/ProfileScreen";
import { hubViewFrom } from "@/features/progression/hubService";
import { StreakPopupPreview } from "@/features/progression/StreakPopupPreview";
import { parseProfileTab } from "@/features/progression/profileTabs";
import { ACHIEVEMENT_CATALOG } from "@/game/achievements";

export const metadata: Metadata = {
  title: "Profil Preview · Tidebound",
  description: "Écran temporaire de réglage de la scène du profil (développement).",
  // Écran de développement : jamais indexé.
  robots: { index: false, follow: false },
};

/**
 * Route de laboratoire : `/game/profil-preview`. La page `/profil` sur un
 * profil FACTICE — de quoi régler la scène de la cabine sans compte.
 * Aucune lecture de base ; les réclamations y échouent proprement
 * (« connecte-toi »), rien n'est écrit. `?serie=1` ouvre en plus le popup
 * de série de la première venue du jour.
 */
export default function ProfilPreviewRoute({ searchParams }: { searchParams: { serie?: string; onglet?: string } }) {
  const view = progressionView(totalXpForLevel(17) + 535);
  const week = loginWeekIndex(utcDayKey());
  const profile: ProfileSummary = {
    isSignedIn: true,
    displayName: "Alti",
    avatarCardId: null,
    ownedCardIds: [],
    view,
    balance: 66_241,
    preconTokens: 1,
    matchesPlayed: 36,
    wins: 21,
    playStreak: { current: 4, best: 9 },
    nextLevelReward: levelRewardsLabel(view.level + 1),
    upcomingMilestones: nextMilestones(view.level, 3).map((level) => ({ level, label: levelRewardsLabel(level), claimed: false })),
    claimedLevels: [],
    claimedLevelNumbers: Array.from({ length: 16 }, (_, index) => index + 1),
    claimableLevels: [17],
    pendingCardChoices: [],
    quests: [
      ["Jouer 3 parties", "parties", 1, 3, 15, 0],
      ["Gagner 2 parties", "parties", 0, 2, 0, 40],
      ["Jouer 20 cartes", "cartes", 12, 20, 20, 0],
    ].map(([label, category, progress, target, tides, xp], index) => ({
      questId: `q${index}`,
      code: `q${index}`,
      periodKey: "2026-09-25",
      questType: "daily" as const,
      category: category as "parties" | "cartes",
      name: String(label),
      label: String(label),
      progress: Number(progress),
      target: Number(target),
      rewardTides: Number(tides),
      rewardXp: Number(xp),
      rewardBoosterId: null,
      botProgressAllowed: true,
      completed: false,
      claimed: false,
      fromPreviousPeriod: false,
    })),
    login: {
      step: 5,
      items: loginRewardForStep(5, week),
      cycle: Array.from({ length: LOGIN_CYCLE_LENGTH }, (_, index) => [...loginRewardForStep(index + 1, week)]),
      weekBoosterId: loginWeekProgramme(week).boosterId,
      claimable: true,
      totalClaims: 11,
      streak: 11,
      bestStreak: 14,
      daysToStreakBonus: LOGIN_STREAK_MILESTONE - 11,
    },
    achievements: ACHIEVEMENT_CATALOG.slice(0, 6).map((achievement, index) => ({
      code: achievement.code,
      name: achievement.name,
      description: achievement.description,
      rewardTides: achievement.rewardTides,
      unlocked: index === 0,
      claimable: false,
      progress: { current: 3 + index * 7, target: 50 },
      titleName: null,
    })),
    cardBacks: { options: [], equipped: DEFAULT_CARD_BACK_ID },
    titles: { options: [], equipped: null, available: false },
    maxRewardedLevelReached: false,
    // Hub : un coffre à moitié plein, trois Navires joués, trois Commanditaires éveillés.
    hub: hubViewFrom({
      weekIndex: week,
      accountLevel: view.level,
      playedThisWeek: 4,
      xpByShip: new Map([
        ["le-goliath", 3220],
        ["lerrant", 1220],
        ["le-courlis", 390],
      ]),
      matchesByShip: new Map([
        ["le-goliath", 31],
        ["lerrant", 12],
        ["le-courlis", 5],
      ]),
      pointsBySponsor: new Map([
        ["compagnie-du-phare", 75],
        ["amiral-sans-pavillon", 46],
        ["veuve-des-profondeurs", 14],
      ]),
      claims: new Set(["sponsor_gift|compagnie-du-phare:intrigue", "mastery|le-goliath:2", "mastery|le-goliath:3"]),
    }),
  };
  return (
    <>
      <ProfileScreen profile={profile} initialTab={parseProfileTab(searchParams.onglet)} />
      {/* `?serie=1` : le popup de première venue du jour, sur ce même profil factice. */}
      {searchParams.serie && <StreakPopupPreview login={profile.login} />}
    </>
  );
}
