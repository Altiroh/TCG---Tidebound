/**
 * RÉCLAMATIONS LOCALES — ce que le joueur vient de réclamer, montré comme
 * réclamé SUR-LE-CHAMP, sans attendre que la page relise le profil
 * (`router.refresh()` repasse par le serveur : une à deux secondes pendant
 * lesquelles le bouton « Réclamer », la pastille d'onglet et la fenêtre du
 * hub restaient comme si de rien n'était).
 *
 * Ce n'est qu'un masque d'AFFICHAGE : la réclamation elle-même est une
 * Server Action autoritaire, et le profil relu fait foi — l'écran oublie ces
 * clés dès qu'il le reçoit (`ProfileScreen`).
 */
import type { ProfileSummary } from "@/features/progression/profileActions";
import type { SponsorStage } from "@/game/progression";

/** Clé d'une réclamation : ce qu'elle retire de l'affichage. */
export const claimKey = {
  login: () => "login",
  chest: () => "chest",
  level: (level: number) => `level:${level}`,
  mastery: (shipId: string, level: number) => `mastery:${shipId}:${level}`,
  gift: (sponsorId: string, stage: SponsorStage) => `gift:${sponsorId}:${stage}`,
  milestone: (threshold: number) => `milestone:${threshold}`,
  achievement: (code: string) => `achievement:${code}`,
  quest: (questId: string, periodKey: string) => `quest:${questId}|${periodKey}`,
} as const;

/** Le profil tel qu'il sera une fois ces réclamations relues. Sans clé, le profil lui-même. */
export function withLocalClaims(profile: ProfileSummary, keys: ReadonlySet<string>): ProfileSummary {
  if (keys.size === 0) return profile;
  const has = (key: string) => keys.has(key);
  const levelsDone = profile.claimableLevels.filter((level) => has(claimKey.level(level)));
  const hub = profile.hub;
  return {
    ...profile,
    claimableLevels: profile.claimableLevels.filter((level) => !has(claimKey.level(level))),
    claimedLevelNumbers: [...profile.claimedLevelNumbers, ...levelsDone],
    login: has(claimKey.login()) ? { ...profile.login, claimable: false } : profile.login,
    quests: profile.quests.map((quest) =>
      has(claimKey.quest(quest.questId, quest.periodKey)) ? { ...quest, claimed: true } : quest
    ),
    achievements: profile.achievements.map((achievement) =>
      has(claimKey.achievement(achievement.code)) ? { ...achievement, claimable: false } : achievement
    ),
    hub: hub && {
      ...hub,
      weeklyChest: has(claimKey.chest()) ? { ...hub.weeklyChest, claimable: false, claimed: true } : hub.weeklyChest,
      masteries: hub.masteries.map((mastery) => ({
        ...mastery,
        claimableLevels: mastery.claimableLevels.filter((level) => !has(claimKey.mastery(mastery.shipId, level))),
      })),
      sponsors: hub.sponsors.map((sponsor) => {
        const opened = sponsor.giftStages.filter((stage) => has(claimKey.gift(sponsor.id, stage)));
        if (opened.length === 0) return sponsor;
        return {
          ...sponsor,
          giftStages: sponsor.giftStages.filter((stage) => !opened.includes(stage)),
          openedStages: [...sponsor.openedStages, ...opened],
        };
      }),
      audienceMilestones: hub.audienceMilestones.map((milestone) =>
        has(claimKey.milestone(milestone.threshold)) ? { ...milestone, claimable: false, claimed: true } : milestone
      ),
    },
  };
}

/** La fenêtre « Mécènes » du hub a-t-elle encore quelque chose à ouvrir ? */
export function sponsorsSheetHasClaims(profile: ProfileSummary): boolean {
  const hub = profile.hub;
  if (!hub) return false;
  return hub.sponsors.some((sponsor) => sponsor.giftStages.length > 0) || hub.audienceMilestones.some((milestone) => milestone.claimable);
}

/** La fenêtre « Maîtrises » du hub a-t-elle encore un palier à réclamer ? */
export function masteriesSheetHasClaims(profile: ProfileSummary): boolean {
  return (profile.hub?.masteries ?? []).some((mastery) => mastery.claimableLevels.length > 0);
}
