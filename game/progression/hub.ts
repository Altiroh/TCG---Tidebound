import { getCardDefinition } from "@/game/cards/sets/core";
import type { GameState, PlayerId } from "@/game/state/types";
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

/* ── Commanditaires ────────────────────────────────────────────────── */

export type SponsorId =
  | "compagnie-du-phare"
  | "veuve-des-profondeurs"
  | "comptoir-des-trois-ancres"
  | "roi-cra-poiscail"
  | "amiral-sans-pavillon"
  | "le-collectionneur";

export interface SponsorDefinition {
  id: SponsorId;
  name: string;
  /** Ce qu'il remarque, en une ligne (Notion). */
  style: string;
}

/** Les six Commanditaires de la page Notion, dans son ordre. */
export const SPONSORS: readonly SponsorDefinition[] = [
  { id: "compagnie-du-phare", name: "La Compagnie du Phare", style: "Défense, Structures, contrôle, parties méthodiques." },
  { id: "veuve-des-profondeurs", name: "La Veuve des Profondeurs", style: "Abysse, sacrifices, faible Raison, prises de risque." },
  { id: "comptoir-des-trois-ancres", name: "Le Comptoir des Trois Ancres", style: "Objets, Bris, économie et matériel." },
  { id: "roi-cra-poiscail", name: "Le Roi Cra-Poiscail", style: "Cra-Poiscail et interactions improbables." },
  { id: "amiral-sans-pavillon", name: "L'Amiral sans Pavillon", style: "Agressivité, canons, dégâts directs, victoires rapides." },
  { id: "le-collectionneur", name: "Le Collectionneur", style: "Diversité des decks et des cartes utilisées." },
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

/** Plafond de points qu'une seule partie peut apporter à un Commanditaire. */
const SPONSOR_POINTS_PER_MATCH = 10;

/**
 * Points d'intérêt qu'UNE partie terminée rapporte au joueur `playerId`,
 * par Commanditaire (PROVISOIRE). Lu dans le journal de la partie : ce que
 * le joueur a VRAIMENT fait, pas son deck.
 */
export function sponsorPointsForMatch(state: GameState, playerId: PlayerId): Record<SponsorId, number> {
  let structures = 0;
  let abyssal = 0;
  let saborded = 0;
  let objects = 0;
  let broken = 0;
  let craPoiscail = 0;
  let directAttacks = 0;
  const distinct = new Set<string>();

  for (const event of state.eventLog) {
    if (event.type === "PLAY_CARD" && event.playerId === playerId) {
      distinct.add(event.cardId);
      let def;
      try {
        def = getCardDefinition(event.cardId);
      } catch {
        continue;
      }
      if (def.type === "structure") structures += 1;
      if (def.type === "objet" || def.type === "equipement") objects += 1;
      if (event.cardId.endsWith("-abyssal")) abyssal += 1;
      if (def.archetype === "cra-poiscail") craPoiscail += 1;
    } else if (event.type === "SABORDED" && event.playerId === playerId) saborded += 1;
    else if (event.type === "OBJECT_BROKEN" && event.playerId === playerId) broken += 1;
    else if (event.type === "ATTACK" && event.playerId === playerId && !event.defenderInstanceId) directAttacks += 1;
  }

  const won = state.winnerId === playerId;
  // `turnNumber` compte les tours des DEUX joueurs.
  const tableTurns = Math.ceil(state.turnNumber / 2);
  const cap = (value: number) => Math.min(SPONSOR_POINTS_PER_MATCH, value);

  return {
    "compagnie-du-phare": cap(structures * 2 + (tableTurns >= 8 ? 3 : 0)),
    "veuve-des-profondeurs": cap(abyssal * 3 + saborded * 2),
    "comptoir-des-trois-ancres": cap(objects + broken * 2),
    "roi-cra-poiscail": cap(craPoiscail),
    "amiral-sans-pavillon": cap(directAttacks + (won && tableTurns <= 6 ? 4 : 0)),
    "le-collectionneur": distinct.size >= 12 ? 5 : distinct.size >= 8 ? 3 : 0,
  };
}
