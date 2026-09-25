import type { Metadata } from "next";
import { levelRewardsLabel, LOGIN_CYCLE_LENGTH, LOGIN_STREAK_MILESTONE, loginRewardForStep, loginWeekIndex, loginWeekProgramme, nextMilestones, progressionView, utcDayKey } from "@/game/progression";
import { DEFAULT_CARD_BACK_ID } from "@/game";
import type { ProfileSummary } from "@/features/progression/profileActions";
import { ProfileScreen } from "@/features/progression/ProfileScreen";
import { StreakPopupPreview } from "@/features/progression/StreakPopupPreview";

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
export default function ProfilPreviewRoute({ searchParams }: { searchParams: { serie?: string } }) {
  const view = progressionView(4_850);
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
    claimedLevelNumbers: [],
    claimableLevels: [],
    pendingCardChoices: [],
    quests: [],
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
    achievements: [],
    cardBacks: { options: [], equipped: DEFAULT_CARD_BACK_ID },
    titles: { options: [], equipped: null, available: false },
    maxRewardedLevelReached: false,
  };
  return (
    <>
      <ProfileScreen profile={profile} />
      {/* `?serie=1` : le popup de première venue du jour, sur ce même profil factice. */}
      {searchParams.serie && <StreakPopupPreview login={profile.login} />}
    </>
  );
}
