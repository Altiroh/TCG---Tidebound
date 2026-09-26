import { BOOSTER_DEFAUT } from "@/game/boosters/pools";
import type { LoginRewardItem } from "@/game/progression/loginRewards";

/**
 * PALIERS D'AUDIENCE — ce que le public RAPPORTE.
 *
 * L'audience monte et descend ; ses paliers, eux, se lisent sur le RECORD
 * (`best_audience`) : un palier franchi l'est pour de bon, une mauvaise
 * série ne le reprend pas. Chaque palier s'ouvre une fois, depuis le
 * panneau du public (réclamation `audience_milestone`, même circuit que le
 * coffre et les Maîtrises).
 *
 * Seuils et contenus PROVISOIRES (26/09/2026), reportés dans Notion. Tenir
 * un spectacle S amène l'audience vers 25 S (`nextAudience`) : 250 et 500
 * viennent en jouant, 1000 demande des parties suivies, 1500 des parties
 * captivantes, 2000 un public debout, partie après partie.
 */
export interface AudienceMilestone {
  /** Record d'audience à atteindre — aussi la clé de réclamation. */
  threshold: number;
  /** Nom du palier, tel que le panneau l'affiche. */
  label: string;
  rewards: readonly LoginRewardItem[];
}

export const AUDIENCE_MILESTONES: readonly AudienceMilestone[] = [
  { threshold: 250, label: "Premiers curieux", rewards: [{ kind: "tides", amount: 30 }] },
  { threshold: 500, label: "Une salle qui se remplit", rewards: [{ kind: "tides", amount: 60 }] },
  { threshold: 1000, label: "Les quais en parlent", rewards: [{ kind: "booster", boosterId: BOOSTER_DEFAUT, count: 1 }] },
  { threshold: 1500, label: "Salle comble", rewards: [{ kind: "card", rarity: "rare" }] },
  {
    threshold: 2000,
    label: "Le port entier regarde",
    rewards: [
      { kind: "tides", amount: 150 },
      { kind: "booster", boosterId: BOOSTER_DEFAUT, count: 1 },
    ],
  },
];

/** Paliers atteints par un record d'audience, du plus bas au plus haut. */
export function audienceMilestonesReached(best: number): AudienceMilestone[] {
  return AUDIENCE_MILESTONES.filter((milestone) => best >= milestone.threshold);
}

/** Prochain palier à atteindre, `null` quand tous le sont. */
export function nextAudienceMilestone(best: number): AudienceMilestone | null {
  return AUDIENCE_MILESTONES.find((milestone) => best < milestone.threshold) ?? null;
}
