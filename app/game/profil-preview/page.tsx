import type { Metadata } from "next";
import { totalXpForLevel, levelRewardsLabel, LOGIN_CYCLE_LENGTH, LOGIN_STREAK_MILESTONE, loginRewardForStep, loginWeekIndex, loginWeekProgramme, nextMilestones, progressionView, utcDayKey } from "@/game/progression";
import { DEFAULT_CARD_BACK_ID } from "@/game";
import type { ProfileSummary } from "@/features/progression/profileActions";
import { ProfileScreen } from "@/features/progression/ProfileScreen";
import { hubViewFrom } from "@/features/progression/hubService";
import { StreakPopupPreview } from "@/features/progression/StreakPopupPreview";
import { parseProfileTab } from "@/features/progression/profileTabs";
import { ACHIEVEMENT_CATALOG } from "@/game/achievements";
import { maskAchievement } from "@/features/progression/achievementMask";

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
 * de série de la première venue du jour ; `?audience=280` fait retomber le
 * public sous le seuil des mécènes (ils perdent leur intérêt).
 */
export default function ProfilPreviewRoute({ searchParams }: { searchParams: { serie?: string; onglet?: string; coffre?: string; audience?: string } }) {
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
    // Tout le catalogue, pour voir chaque illustration et chaque état : un
    // exploit sur trois obtenu, un sur sept à réclamer (or qui pulse), les
    // cachés voilés sauf s'ils tombent obtenus (révélés), les Traversées
    // avec leur titre, le reste en cours.
    achievements: ACHIEVEMENT_CATALOG.map((achievement, index) => {
      const unlocked = index % 3 === 0 || index === 1;
      return maskAchievement(
        {
          code: achievement.code,
          family: achievement.family,
          name: achievement.name,
          description: achievement.description,
          rewardTides: achievement.rewardTides,
          masked: false,
          unlocked,
          claimable: unlocked && index % 7 === 1,
          progress: { current: Math.min(49, 3 + index * 7) % 50, target: 50 },
          titleName: achievement.code.startsWith("voyage_") ? achievement.name : null,
        },
        achievement.hidden === true,
        index
      );
    }),
    cardBacks: { options: [], equipped: DEFAULT_CARD_BACK_ID },
    titles: { options: [], equipped: null, available: false },
    maxRewardedLevelReached: false,
    // Hub : un coffre à moitié plein, trois Navires joués, trois Commanditaires éveillés.
    hub: hubViewFrom({
      weekIndex: week,
      accountLevel: view.level,
      // `?coffre=pret` : plein, prêt à ouvrir ; `?coffre=ouvert` : déjà ouvert cette semaine.
      playedThisWeek: searchParams.coffre ? 10 : 4,
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
        ["beladone", 75],
        ["ambassade-cra-poiscail", 46],
        ["compagnie-du-mousquet", 6],
      ]),
      claims: new Set([
        "sponsor_gift|beladone:intrigue",
        "mastery|le-goliath:2",
        "mastery|le-goliath:3",
        ...(searchParams.coffre === "ouvert" ? [`weekly_chest|${week}`] : []),
        // Premier palier d'audience déjà ouvert : le deuxième et le troisième attendent.
        "audience_milestone|250",
      ]),
      // `?audience=280` : public retombé sous le seuil des mécènes — ils perdent leur intérêt.
      audience: { audience: previewAudience(searchParams.audience), best: 1480, lastSpectacle: 68, lastHighlights: ["Un retournement de haut vol", "Un duel indécis jusqu'au bout"] },
    }),
    // `?onglet=stats` : l'onglet Statistiques sur des compteurs plausibles.
    playerStats: {
      matchesPlayed: 36,
      wins: 21,
      losses: 15,
      level: view.level,
      distinctCardsOwned: 142,
      boostersOpened: 27,
      lifetime: {
        play_matches: 30,
        play_pvp_matches: 12,
        play_bot_matches: 18,
        win_pvp_matches: 6,
        win_bot_matches: 12,
        play_first: 16,
        win_first: 10,
        draw_matches: 1,
        play_seconds: 6 * 3600 + 23 * 60,
        own_turns: 214,
        long_matches: 9,
        play_cards: 402,
        play_creatures: 188,
        summon_units: 37,
        play_marins: 64,
        play_structures: 41,
        play_objects: 77,
        play_equipments: 12,
        play_anomalies: 8,
        play_big_cards: 29,
        break_objects: 58,
        draw_cards: 251,
        discard_cards: 14,
        spend_reason: 1290,
        gain_reason_from_cards: 88,
        attacks: 311,
        direct_attacks: 120,
        deal_damage: 1874,
        deal_ship_damage: 642,
        take_damage: 1512,
        take_ship_damage: 498,
        heal_anchor: 73,
        destroy_enemy_units: 203,
        destroy_enemy_structures: 22,
        lose_units: 176,
        scuttle_permanents: 19,
        spring_traps: 31,
        activate_reactions: 64,
        intercept_attacks: 9,
        modify_tide: 47,
        reach_tempete: 33,
        reach_abysses: 11,
        turns_in_tempete: 40,
        deraison_turns: 12,
        deraison_debt: 27,
        ship_ability_uses: 58,
        ship_ability_damage: 96,
        lethal_by_attack: 13,
        lethal_by_effect: 4,
        lethal_by_ship_ability: 2,
        lethal_by_deraison: 1,
        exact_lethal: 3,
        win_by_concede: 1,
        win_within_5_turns: 2,
        win_without_losing_unit: 1,
        win_after_low_anchor: 4,
      },
      records: {
        deal_damage: 142,
        max_damage_in_turn: 31,
        max_single_hit: 12,
        destroy_enemy_units: 14,
        max_enemy_units_destroyed_in_turn: 5,
        max_destroyed_at_once: 4,
        max_cards_played_in_turn: 6,
        play_creatures: 11,
        max_deraison_debt: 5,
        max_win_anchor: 17,
        own_turns: 13,
        play_seconds: 27 * 60 + 40,
      },
    },
  };
  return (
    <>
      <ProfileScreen profile={profile} initialTab={parseProfileTab(searchParams.onglet)} />
      {/* `?serie=1` : le popup de première venue du jour, sur ce même profil factice. */}
      {searchParams.serie && <StreakPopupPreview login={profile.login} />}
    </>
  );
}

/** Audience courante du profil factice : 1240 par défaut, ou `?audience=` (entier positif). */
function previewAudience(raw: string | undefined): number {
  const value = Number(raw);
  return raw !== undefined && Number.isInteger(value) && value >= 0 ? value : 1240;
}
