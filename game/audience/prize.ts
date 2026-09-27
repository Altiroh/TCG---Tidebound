import { AUDIENCE_OPPONENT_WEIGHT, type AudienceOpponent } from "@/game/audience/analyzeMatch";

/**
 * LA PRIME DU PUBLIC — ce qu'UNE partie rapporte quand elle a plu.
 *
 * À chaque partie terminée, le spectacle (`analyzeMatch`) se paie : plus la
 * salle a vibré, plus la prime est belle — victoire ou défaite, une défaite
 * héroïque paie aussi. Elle s'ajoute à l'XP et aux Tides de la partie, dans
 * le MÊME octroi atomique (`grant_match_progression`) : une fois par partie,
 * jamais deux.
 *
 * Calibrée sur l'économie de partie (victoire PvP 5 Tides, défaite 2, bot 0 ;
 * 25 à 50 XP) et sur le relevé `npm run audience` (26/09/2026) : ~64 % des
 * verdicts atteignent au moins « suit », ~21 % au moins « captivé », ~8 %
 * « debout ».
 *
 *   spectacle   humeur            XP    Tides (PvP)
 *   < 40        s'ennuie/impatient  0     0
 *   40 – 59     suit la partie      5     0   (un seul libellé par humeur : `audienceMood`)
 *   60 – 79     captivé            10     1
 *   ≥ 80        debout             20     3
 *
 * Contre un bot : l'XP suit le poids de l'adversaire (`AUDIENCE_OPPONENT_WEIGHT` :
 * difficile 70 %, moyen 50 %, facile 25 %), et AUCUN Tide — la règle de partie
 * contre le bot (Tides à 0, Notion « Progression joueur » §7) reste
 * verrouillée. Une partie abandonnée sans jeu réel ne touche rien.
 *
 * Valeurs PROVISOIRES, reportées dans Notion.
 */
export interface AudiencePrizeTier {
  /** Spectacle minimal. */
  minSpectacle: number;
  label: string;
  xp: number;
  tides: number;
}

export const AUDIENCE_PRIZE_TIERS: readonly AudiencePrizeTier[] = [
  { minSpectacle: 80, label: "Le public est debout", xp: 20, tides: 3 },
  { minSpectacle: 60, label: "Le public est captivé", xp: 10, tides: 1 },
  { minSpectacle: 40, label: "Le public suit la partie", xp: 5, tides: 0 },
];

export interface AudiencePrize {
  spectacle: number;
  /** Palier atteint, `null` quand la salle ne paie rien. */
  label: string | null;
  xp: number;
  tides: number;
}

export function audiencePrize(
  spectacle: number,
  options: { opponent?: AudienceOpponent; abandoned?: boolean } = {}
): AudiencePrize {
  const tier = options.abandoned ? undefined : AUDIENCE_PRIZE_TIERS.find((entry) => spectacle >= entry.minSpectacle);
  if (!tier) return { spectacle, label: null, xp: 0, tides: 0 };
  const opponent = options.opponent ?? "joueur";
  return {
    spectacle,
    label: tier.label,
    xp: Math.round(tier.xp * AUDIENCE_OPPONENT_WEIGHT[opponent]),
    tides: opponent === "joueur" ? tier.tides : 0,
  };
}
