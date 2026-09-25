import type { MatchAnalysis } from "@/game/audience/types";
import { BOOSTER_DEFAUT } from "@/game/boosters/pools";
import { loginWeekProgramme, type LoginRewardItem } from "@/game/progression/loginRewards";

/**
 * HUB DE PROGRESSION — Coffre hebdomadaire, Maîtrises, Commanditaires.
 *
 * Source : Notion « Dynamique de progression — Maîtrises, Coffres,
 * Audience & Commanditaires » (25/09/2026). La page fixe les rôles et la
 * mise en scène, PAS les chiffres : toutes les valeurs ci-dessous sont
 * PROVISOIRES, regroupées ici pour être validées puis reportées dans
 * Notion. Seul le seuil du coffre (10 parties) a été tranché.
 *
 * Tout est fonction PURE : les services (`features/progression/hubService.ts`)
 * lisent la base, appellent ces règles, et écrivent par une fonction
 * Postgres atomique.
 */

/* ── Coffre hebdomadaire ───────────────────────────────────────────── */

/** Parties à jouer dans la semaine (UTC, du lundi au dimanche) pour ouvrir le coffre. Décision du 25/09/2026. */
export const WEEKLY_CHEST_GOAL = 10;

/**
 * Contenu du coffre de la semaine `weekIndex` (PROVISOIRE) : suit le
 * booster mis en avant par les escales de la même semaine
 * (`loginWeekProgramme`) — une seule vitrine par semaine.
 */
export function weeklyChestContents(weekIndex: number): readonly LoginRewardItem[] {
  const boosterId = loginWeekProgramme(weekIndex).boosterId;
  return [
    { kind: "tides", amount: 60 },
    { kind: "booster", boosterId, count: 1 },
    { kind: "card", rarity: "uncommon", boosterId },
  ];
}

/* ── Maîtrises (par Navire) ────────────────────────────────────────── */

/**
 * Une Maîtrise par NAVIRE : c'est lui qui donne son identité à un deck
 * (préconstruit ou personnel). Elle gagne l'XP de compte des parties
 * jouées avec lui — « +84 XP compte, +84 Maîtrise — Goliath ».
 */
export const MASTERY_MAX_LEVEL = 10;

/** XP pour passer du niveau `level` au suivant (PROVISOIRE) : 100 × niveau. */
export function masteryXpForLevel(level: number): number {
  return 100 * Math.max(1, level);
}

export interface MasteryProgress {
  level: number;
  /** XP dans le niveau en cours. */
  xpInto: number;
  /** XP du niveau en cours au suivant (0 au niveau maximum). */
  xpForNext: number;
}

export function masteryProgress(xpTotal: number): MasteryProgress {
  let level = 1;
  let remaining = Math.max(0, Math.floor(xpTotal));
  while (level < MASTERY_MAX_LEVEL && remaining >= masteryXpForLevel(level)) {
    remaining -= masteryXpForLevel(level);
    level += 1;
  }
  if (level >= MASTERY_MAX_LEVEL) return { level: MASTERY_MAX_LEVEL, xpInto: 0, xpForNext: 0 };
  return { level, xpInto: remaining, xpForNext: masteryXpForLevel(level) };
}

/**
 * Récompense d'un palier de Maîtrise (niveaux 2 à 10, PROVISOIRE) —
 * modeste : la Maîtrise dit ce qu'on joue, elle ne doit pas devenir une
 * seconde route des paliers. Tous les 5 niveaux un booster, un niveau pair
 * sur deux une carte, sinon des Tides.
 */
export function masteryRewardForLevel(level: number): readonly LoginRewardItem[] {
  if (level < 2 || level > MASTERY_MAX_LEVEL) return [];
  if (level % 5 === 0) return [{ kind: "booster", boosterId: BOOSTER_DEFAUT, count: 1 }];
  if (level % 2 === 0) return [{ kind: "card", rarity: "uncommon" }];
  return [{ kind: "tides", amount: 30 }];
}

/* ── Mécènes (Commanditaires) ──────────────────────────────────────── */

export type SponsorId = "compagnie-du-mousquet" | "ambassade-cra-poiscail" | "representant-du-peuple" | "beladone";

export type SponsorColor = "jaune" | "bleu" | "violet" | "marron";

export interface SponsorDefinition {
  id: SponsorId;
  name: string;
  /** Couleur du mécène — son sceau, sa jauge. */
  color: SponsorColor;
  /** Qui il est, pour l'illustration à venir. */
  figure: string;
  /**
   * Ce qui l'attire, en une ligne — volontairement LARGE (décision du
   * 25/09/2026 : pas de style trop visé pour l'instant).
   */
  attraction: string;
  /**
   * Son histoire (Notion « Dynamique de progression », section Mécènes —
   * premier jet du 25/09/2026, À CORRIGER par le design : le texte suit
   * Notion, jamais l'inverse).
   */
  lore: string;
  /**
   * Audience minimale pour qu'il s'intéresse vraiment au joueur : le public
   * est le prérequis, chaque mécène a le sien.
   */
  audienceRequired: number;
}

/** Les quatre mécènes (décision du 25/09/2026), du plus accessible au plus exigeant. */
export const SPONSORS: readonly SponsorDefinition[] = [
  {
    id: "beladone",
    name: "Béladone",
    color: "marron",
    figure: "Une femme du peuple",
    attraction: "Les marins qui reviennent jouer, jour après jour.",
    lore:
      "Tout le monde connaît Béladone sur les quais. Elle ne possède ni navire ni titre, mais elle plie des " +
      "bateaux de papier sur lesquels elle écrit le nom des marins en qui elle croit, et les laisse filer " +
      "sur la marée. On dit que ceux dont le nom revient souvent finissent par être connus. Elle n'aime pas " +
      "les coups d'éclat : elle aime ceux qui reviennent, jour après jour.",
    audienceRequired: 300,
  },
  {
    id: "ambassade-cra-poiscail",
    name: "L'Ambassade Cra-Poiscail",
    color: "bleu",
    figure: "Un Cra-Poiscail",
    attraction: "Les parties longues et disputées.",
    lore:
      "Délégation diplomatique installée à quai, l'Ambassade tient d'immenses registres où sont consignés " +
      "les duels les plus longs de la saison. Pour les Cra-Poiscail, la patience est une vertu diplomatique " +
      ": un capitaine qui tient bon, qui négocie chaque tour avec la marée, mérite qu'on lui ouvre les " +
      "portes des eaux profondes.",
    audienceRequired: 700,
  },
  {
    id: "compagnie-du-mousquet",
    name: "La Compagnie du Mousquet",
    color: "jaune",
    figure: "Un chat homme-bête",
    attraction: "Les victoires qui ont du panache.",
    lore:
      "Compagnie de duellistes félins, bretteurs et tireurs, la Compagnie du Mousquet ne jure que par " +
      "l'honneur et le style. Gagner ne suffit pas : il faut gagner avec élégance, de face, sous les yeux " +
      "de tous. Elle finance volontiers les capitaines dont les victoires font lever les chapeaux.",
    audienceRequired: 1000,
  },
  {
    id: "representant-du-peuple",
    name: "Le Représentant du Peuple",
    color: "violet",
    figure: "Une Sentinelle chromatique blanche",
    attraction: "Ce que le public acclame.",
    lore:
      "Élu par la foule — ou peut-être façonné par elle — le Représentant du Peuple est la voix de ceux qui " +
      "regardent. Il ne remarque que les capitaines que le public acclame ; quand les gradins se lèvent, il " +
      "se lève avec eux.",
    audienceRequired: 1500,
  },
];

/**
 * Les Commanditaires ne regardent qu'un marin confirmé : leur intérêt ne
 * s'éveille — et leurs colis n'arrivent — qu'à partir de ce niveau de
 * compte (décision du 25/09/2026, « histoire de motiver à jouer »).
 */
export const SPONSORS_UNLOCK_LEVEL = 10;

/**
 * Niveau de compte à partir duquel une OFFRE DE MÉCÉNAT peut être faite par
 * un Commanditaire Fasciné (décision du 25/09/2026). L'offre elle-même
 * (sceau sur le profil, progression cosmétique) reste à construire.
 */
export const PATRONAGE_UNLOCK_LEVEL = 25;

export type SponsorStage = "indifferent" | "intrigue" | "interesse" | "fascine";

/** Paliers d'intérêt (points cumulés, PROVISOIRES) : Indifférent → Intrigué → Intéressé → Fasciné. */
export const SPONSOR_STAGES: readonly { id: SponsorStage; label: string; minPoints: number }[] = [
  { id: "indifferent", label: "Indifférent", minPoints: 0 },
  { id: "intrigue", label: "Intrigué", minPoints: 15 },
  { id: "interesse", label: "Intéressé", minPoints: 45 },
  { id: "fascine", label: "Fasciné", minPoints: 120 },
];

/** Plafond de la jauge : l'intérêt affiché est une part de ce total. */
export const SPONSOR_MAX_POINTS = SPONSOR_STAGES[SPONSOR_STAGES.length - 1]!.minPoints;

export function sponsorStage(points: number): SponsorStage {
  let stage: SponsorStage = "indifferent";
  for (const entry of SPONSOR_STAGES) if (points >= entry.minPoints) stage = entry.id;
  return stage;
}

export function sponsorStageLabel(stage: SponsorStage): string {
  return SPONSOR_STAGES.find((entry) => entry.id === stage)?.label ?? "Indifférent";
}

/** Intérêt affiché, 0 à 100 %. */
export function sponsorInterestPercent(points: number): number {
  return Math.min(100, Math.round((Math.max(0, points) / SPONSOR_MAX_POINTS) * 100));
}

/**
 * Le Commanditaire se fait connaître à partir d'« Intrigué » ; avant, il
 * n'est qu'« Quelqu'un vous observe » (Notion : ce sont eux qui remarquent
 * le joueur, il ne les choisit pas).
 */
export function sponsorRevealed(points: number): boolean {
  return sponsorStage(points) !== "indifferent";
}

/** Colis envoyé en atteignant un palier (PROVISOIRE). Aucun pour « Indifférent ». */
export function sponsorGift(stage: SponsorStage): readonly LoginRewardItem[] {
  if (stage === "intrigue") return [{ kind: "tides", amount: 40 }];
  if (stage === "interesse") return [{ kind: "booster", boosterId: BOOSTER_DEFAUT, count: 1 }];
  if (stage === "fascine") return [{ kind: "card", rarity: "rare" }];
  return [];
}

/** Paliers ATTEINTS qui envoient un colis, du plus ancien au plus récent. */
export function sponsorGiftStagesReached(points: number): SponsorStage[] {
  return SPONSOR_STAGES.filter((entry) => entry.id !== "indifferent" && points >= entry.minPoints).map((entry) => entry.id);
}

/** Plafond de points qu'une seule partie peut apporter à un mécène. */
const SPONSOR_POINTS_PER_MATCH = 10;

export interface SponsorMatchContext {
  /** Audience du joueur APRÈS cette partie. */
  audience: number;
  /** Verdict du public sur la partie (`analyzeMatch`). */
  analysis: Pick<MatchAnalysis, "spectacle" | "traits">;
  /** Jours d'affilée joués après cette partie (série de jeu). */
  playStreak?: number;
}

/**
 * Points d'intérêt qu'UNE partie terminée rapporte, par mécène
 * (PROVISOIRE). Aucun tant que l'audience n'atteint pas son seuil : c'est
 * le public qui attire leur regard. Ils lisent les TRAITS du moteur
 * d'audience — ce qui les attire reste large : la régularité, la durée, le
 * panache, la ferveur du public.
 */
export function sponsorPointsForMatch(context: SponsorMatchContext): Record<SponsorId, number> {
  const { traits } = context.analysis;
  const raw: Record<SponsorId, number> = {
    beladone: 2 + ((context.playStreak ?? 0) >= 3 ? 3 : 0),
    "ambassade-cra-poiscail": Math.round(traits.endurance / 12),
    "compagnie-du-mousquet": Math.round(traits.panache / 10),
    "representant-du-peuple": traits.ferveur >= 75 ? 8 : traits.ferveur >= 55 ? 4 : 0,
  };
  const points = {} as Record<SponsorId, number>;
  for (const sponsor of SPONSORS) {
    points[sponsor.id] = context.audience >= sponsor.audienceRequired ? Math.min(SPONSOR_POINTS_PER_MATCH, raw[sponsor.id]) : 0;
  }
  return points;
}
