import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { PLAYABLE_DECKS, getShipDefinition, type GameState } from "@/game";
import { SHIP_SET } from "@/game/environment/shipData";
import { analyzeMatch } from "@/game/audience";
import {
  MASTERY_MAX_LEVEL,
  SPONSORS,
  SPONSORS_UNLOCK_LEVEL,
  WEEKLY_CHEST_GOAL,
  loginCardPool,
  loginWeekIndex,
  masteryProgress,
  masteryRewardForLevel,
  shiftDayKey,
  sponsorGift,
  sponsorGiftStagesReached,
  sponsorInterestPercent,
  sponsorPointsForMatch,
  sponsorRevealed,
  sponsorStage,
  sponsorStageLabel,
  utcDayKey,
  weeklyChestContents,
  type LoginRewardItem,
  type SponsorColor,
  type SponsorId,
  type SponsorStage,
} from "@/game/progression";

/**
 * HUB DE PROGRESSION — opérations SERVEUR (pas de `"use server"`).
 *
 * Lit la progression DÉRIVÉE (coffre : parties de la semaine ; Maîtrises :
 * XP par Navire) dans `match_rewards` / `matches`, l'intérêt des
 * Commanditaires dans `player_sponsor_interest`, et les réclamations dans
 * `player_progression_claims`. Règles : `game/progression/hub.ts`.
 *
 * Ne lève jamais : une table absente (migration 20261009120000 pas encore
 * passée) dégrade en « rien à réclamer », jamais en page blanche.
 */

type Service = ReturnType<typeof createSupabaseServiceRoleClient>;

export interface WeeklyChestView {
  weekIndex: number;
  played: number;
  goal: number;
  contents: readonly LoginRewardItem[];
  claimable: boolean;
  claimed: boolean;
}

export interface MasteryView {
  shipId: string;
  shipName: string;
  illustration: string;
  /** Parties jouées à son bord — c'est l'ordre d'affichage : les plus utilisés d'abord. */
  matchesPlayed: number;
  xpTotal: number;
  level: number;
  xpInto: number;
  xpForNext: number;
  /** Paliers atteints et pas encore réclamés (2 → niveau). */
  claimableLevels: number[];
  /** Récompense du prochain palier (ou du premier à réclamer). */
  nextReward: readonly LoginRewardItem[];
  nextRewardLevel: number | null;
}

export interface SponsorView {
  id: SponsorId;
  /** `null` tant qu'il ne s'est pas fait connaître (« Quelqu'un vous observe… »). */
  name: string | null;
  /** Ce qui l'attire — `null` tant qu'il est anonyme. */
  style: string | null;
  color: SponsorColor;
  /** Audience qu'il exige avant de s'intéresser au joueur. */
  audienceRequired: number;
  /** L'audience du joueur atteint son seuil. */
  meetsAudience: boolean;
  /** Il a commencé à regarder (au moins un point d'intérêt). */
  watching: boolean;
  points: number;
  stage: SponsorStage;
  stageLabel: string;
  percent: number;
  /** Colis arrivés et pas encore ouverts, du plus ancien au plus récent. */
  giftStages: SponsorStage[];
}

export interface AudienceView {
  /** Spectateurs qui suivent le joueur. */
  audience: number;
  best: number;
  /** Spectacle de la dernière partie (0 à 100), `null` avant la première. */
  lastSpectacle: number | null;
}

export interface ProgressionHubView {
  audience: AudienceView;
  weeklyChest: WeeklyChestView;
  masteries: MasteryView[];
  /** `false` sous le niveau d'ouverture des Commanditaires. */
  sponsorsUnlocked: boolean;
  sponsors: SponsorView[];
}

/** Lundi (UTC) de la semaine qui contient `dayKey`. */
function weekStartDay(dayKey: string): string {
  const weekday = (new Date(`${dayKey}T00:00:00Z`).getUTCDay() + 6) % 7; // lundi = 0
  return shiftDayKey(dayKey, -weekday);
}

/** Navire de chaque deck joué : préconstruits (catalogue) puis decks personnels (base). */
async function shipsOfDecks(service: Service, deckIds: string[]): Promise<Map<string, string>> {
  const ships = new Map<string, string>();
  const unknown: string[] = [];
  for (const deckId of new Set(deckIds)) {
    const precon = PLAYABLE_DECKS.find((deck) => deck.id === deckId);
    if (precon) ships.set(deckId, precon.shipId);
    else unknown.push(deckId);
  }
  const uuids = unknown.filter((id) => /^[0-9a-f-]{36}$/i.test(id));
  if (uuids.length > 0) {
    const { data } = await service.from("player_decks").select("id, ship_id").in("id", uuids);
    for (const row of data ?? []) ships.set(row.id, row.ship_id);
  }
  return ships;
}

/** Audience du joueur (`player_audience`) — zéro tant qu'il n'a rien joué, ou que la migration manque. */
export async function readAudience(service: Service, userId: string): Promise<AudienceView> {
  const { data, error } = await service.from("player_audience").select("audience, best_audience, last_spectacle").eq("user_id", userId).maybeSingle();
  if (error || !data) return { audience: 0, best: 0, lastSpectacle: null };
  return { audience: data.audience, best: data.best_audience, lastSpectacle: data.last_spectacle };
}

async function readClaims(service: Service, userId: string): Promise<Set<string>> {
  const { data, error } = await service.from("player_progression_claims").select("kind, claim_key").eq("user_id", userId);
  if (error) return new Set();
  return new Set((data ?? []).map((row) => `${row.kind}|${row.claim_key}`));
}

/** XP de compte par Navire, et parties de la semaine en cours. */
async function readMatchHistory(service: Service, userId: string, weekStart: string) {
  const { data: rewards } = await service
    .from("match_rewards")
    .select("match_id, xp_granted, granted_at")
    .eq("user_id", userId)
    .order("granted_at", { ascending: false })
    .limit(2000);
  const rows = rewards ?? [];
  const playedThisWeek = rows.filter((row) => row.granted_at.slice(0, 10) >= weekStart).length;

  const xpByShip = new Map<string, number>();
  const matchesByShip = new Map<string, number>();
  const matchIds = rows.map((row) => row.match_id);
  for (let start = 0; start < matchIds.length; start += 200) {
    const chunk = matchIds.slice(start, start + 200);
    const { data: matches } = await service.from("matches").select("id, player1_id, player1_deck_id, player2_deck_id").in("id", chunk);
    const deckOf = new Map<string, string>();
    for (const match of matches ?? []) {
      const deckId = match.player1_id === userId ? match.player1_deck_id : match.player2_deck_id;
      if (deckId) deckOf.set(match.id, deckId);
    }
    const ships = await shipsOfDecks(service, [...deckOf.values()]);
    for (const row of rows.slice(start, start + 200)) {
      const deckId = deckOf.get(row.match_id);
      const shipId = deckId ? ships.get(deckId) : undefined;
      if (shipId) {
        xpByShip.set(shipId, (xpByShip.get(shipId) ?? 0) + row.xp_granted);
        matchesByShip.set(shipId, (matchesByShip.get(shipId) ?? 0) + 1);
      }
    }
  }
  return { playedThisWeek, xpByShip, matchesByShip };
}

function masteryView(shipId: string, xpTotal: number, matchesPlayed: number, claims: Set<string>): MasteryView {
  const progress = masteryProgress(xpTotal);
  const claimableLevels: number[] = [];
  for (let level = 2; level <= progress.level; level += 1) {
    if (!claims.has(`mastery|${shipId}:${level}`)) claimableLevels.push(level);
  }
  const nextRewardLevel = claimableLevels[0] ?? (progress.level < MASTERY_MAX_LEVEL ? progress.level + 1 : null);
  const ship = getShipDefinition(shipId);
  return {
    shipId,
    shipName: ship.name,
    illustration: ship.illustration ?? "",
    matchesPlayed,
    xpTotal,
    ...progress,
    claimableLevels,
    nextReward: nextRewardLevel ? masteryRewardForLevel(nextRewardLevel) : [],
    nextRewardLevel,
  };
}

export async function readProgressionHub(userId: string, accountLevel: number, now: Date = new Date()): Promise<ProgressionHubView> {
  const today = utcDayKey(now);
  const weekIndex = loginWeekIndex(today);
  const empty = hubViewFrom({ weekIndex, accountLevel, playedThisWeek: 0, xpByShip: new Map(), pointsBySponsor: new Map(), claims: new Set() });

  try {
    const service = createSupabaseServiceRoleClient();
    const [claims, history, interest, audience] = await Promise.all([
      readClaims(service, userId),
      readMatchHistory(service, userId, weekStartDay(today)),
      service.from("player_sponsor_interest").select("sponsor_id, points").eq("user_id", userId),
      readAudience(service, userId),
    ]);
    return hubViewFrom({
      weekIndex,
      accountLevel,
      playedThisWeek: history.playedThisWeek,
      xpByShip: history.xpByShip,
      matchesByShip: history.matchesByShip,
      pointsBySponsor: new Map((interest.error ? [] : (interest.data ?? [])).map((row) => [row.sponsor_id, row.points])),
      claims,
      audience,
    });
  } catch (error) {
    console.error("[readProgressionHub] Lecture impossible :", error);
    return empty;
  }
}

/**
 * La vue du hub à partir de ce qui a été LU — fonction pure, partagée avec
 * le laboratoire (`/game/profil-preview`).
 */
export function hubViewFrom({
  weekIndex,
  accountLevel,
  playedThisWeek,
  xpByShip,
  matchesByShip,
  pointsBySponsor,
  claims,
  audience = { audience: 0, best: 0, lastSpectacle: null },
}: {
  weekIndex: number;
  accountLevel: number;
  playedThisWeek: number;
  xpByShip: ReadonlyMap<string, number>;
  /** Parties jouées par Navire. Absent : l'XP sert seule à ordonner. */
  matchesByShip?: ReadonlyMap<string, number>;
  pointsBySponsor: ReadonlyMap<string, number>;
  claims: Set<string>;
  audience?: AudienceView;
}): ProgressionHubView {
  const claimed = claims.has(`weekly_chest|${weekIndex}`);
  return {
    weeklyChest: {
      weekIndex,
      played: playedThisWeek,
      goal: WEEKLY_CHEST_GOAL,
      contents: weeklyChestContents(weekIndex),
      claimed,
      claimable: !claimed && playedThisWeek >= WEEKLY_CHEST_GOAL,
    },
    // Les Navires les plus UTILISÉS d'abord (parties jouées, l'XP départage) ;
    // les autres ensuite, pour qu'on sache qu'ils existent.
    masteries: SHIP_SET.map((ship) => masteryView(ship.id, xpByShip.get(ship.id) ?? 0, matchesByShip?.get(ship.id) ?? 0, claims)).sort(
      (a, b) => b.matchesPlayed - a.matchesPlayed || b.xpTotal - a.xpTotal
    ),
    sponsorsUnlocked: accountLevel >= SPONSORS_UNLOCK_LEVEL,
    audience,
    // Ceux qui regardent d'abord, puis du plus accessible au plus exigeant.
    sponsors: SPONSORS.map((sponsor) => sponsorView(sponsor.id, pointsBySponsor.get(sponsor.id) ?? 0, claims, accountLevel, audience.audience)).sort(
      (a, b) => b.points - a.points || a.audienceRequired - b.audienceRequired
    ),
  };
}

function sponsorView(id: SponsorId, points: number, claims: Set<string>, accountLevel: number, audience: number): SponsorView {
  const definition = SPONSORS.find((sponsor) => sponsor.id === id)!;
  const revealed = sponsorRevealed(points);
  const stage = sponsorStage(points);
  return {
    id,
    name: revealed ? definition.name : null,
    style: revealed ? definition.attraction : null,
    color: definition.color,
    audienceRequired: definition.audienceRequired,
    meetsAudience: audience >= definition.audienceRequired,
    watching: points > 0,
    points,
    stage,
    stageLabel: sponsorStageLabel(stage),
    percent: sponsorInterestPercent(points),
    giftStages:
      accountLevel >= SPONSORS_UNLOCK_LEVEL ? sponsorGiftStagesReached(points).filter((reached) => !claims.has(`sponsor_gift|${id}:${reached}`)) : [],
  };
}

/* ── Réclamations ──────────────────────────────────────────────────── */

export interface HubClaimResult {
  ok: boolean;
  error?: string;
  /** Ce qui a été reçu, cartes tirées comprises (`cardId`) — pour la révélation. */
  items?: LoginRewardItem[];
}

/** Tire les cartes d'un lot de récompenses et prépare l'appel atomique. */
function settleItems(items: readonly LoginRewardItem[]) {
  let tides = 0;
  let boosterId: string | null = null;
  let cardId: string | null = null;
  const received: LoginRewardItem[] = [];
  for (const item of items) {
    if (item.kind === "tides") tides += item.amount;
    else if (item.kind === "booster") boosterId = item.boosterId;
    else if (item.kind === "card") {
      const pool = loginCardPool(item);
      cardId = pool.length > 0 ? pool[Math.floor(Math.random() * pool.length)]! : null;
      if (cardId) {
        received.push({ ...item, cardId });
        continue;
      }
    }
    received.push(item);
  }
  return { tides, boosterId, cardId, received };
}

async function grant(
  userId: string,
  kind: "weekly_chest" | "mastery" | "sponsor_gift",
  key: string,
  items: readonly LoginRewardItem[]
): Promise<HubClaimResult> {
  const service = createSupabaseServiceRoleClient();
  const { tides, boosterId, cardId, received } = settleItems(items);
  const { data, error } = await service.rpc("claim_progression_reward", {
    p_user_id: userId,
    p_kind: kind,
    p_key: key,
    p_tides: tides,
    p_booster_id: boosterId,
    p_card_id: cardId,
  });
  if (error) {
    console.error(`[hub:${kind}] Refusé :`, error.message);
    return { ok: false, error: "Réclamation impossible pour le moment." };
  }
  if (!data?.ok) return { ok: false, error: data?.error ?? "Réclamation impossible." };
  return { ok: true, items: received };
}

export async function claimWeeklyChest(userId: string, accountLevel: number, now: Date = new Date()): Promise<HubClaimResult> {
  try {
    const hub = await readProgressionHub(userId, accountLevel, now);
    const chest = hub.weeklyChest;
    if (chest.claimed) return { ok: false, error: "Le coffre de la semaine est déjà ouvert." };
    if (!chest.claimable) return { ok: false, error: `Encore ${chest.goal - chest.played} partie(s) cette semaine pour l'ouvrir.` };
    return await grant(userId, "weekly_chest", String(chest.weekIndex), chest.contents);
  } catch (error) {
    console.error("[claimWeeklyChest] Échec :", error);
    return { ok: false, error: "Réclamation impossible pour le moment." };
  }
}

export async function claimMasteryReward(userId: string, accountLevel: number, shipId: string, level: number): Promise<HubClaimResult> {
  try {
    const hub = await readProgressionHub(userId, accountLevel);
    const mastery = hub.masteries.find((entry) => entry.shipId === shipId);
    if (!mastery || !mastery.claimableLevels.includes(level)) return { ok: false, error: "Ce palier de Maîtrise n'est pas à réclamer." };
    return await grant(userId, "mastery", `${shipId}:${level}`, masteryRewardForLevel(level));
  } catch (error) {
    console.error("[claimMasteryReward] Échec :", error);
    return { ok: false, error: "Réclamation impossible pour le moment." };
  }
}

export async function claimSponsorGift(userId: string, accountLevel: number, sponsorId: SponsorId, stage: SponsorStage): Promise<HubClaimResult> {
  try {
    if (accountLevel < SPONSORS_UNLOCK_LEVEL) return { ok: false, error: `Les Commanditaires vous remarqueront au niveau ${SPONSORS_UNLOCK_LEVEL}.` };
    const hub = await readProgressionHub(userId, accountLevel);
    const sponsor = hub.sponsors.find((entry) => entry.id === sponsorId);
    if (!sponsor || !sponsor.giftStages.includes(stage)) return { ok: false, error: "Aucun colis de ce Commanditaire n'attend." };
    return await grant(userId, "sponsor_gift", `${sponsorId}:${stage}`, sponsorGift(stage));
  } catch (error) {
    console.error("[claimSponsorGift] Échec :", error);
    return { ok: false, error: "Réclamation impossible pour le moment." };
  }
}

/**
 * Fin de partie, pour UN joueur : le public juge la partie (spectacle,
 * audience — ouverte à tous, dès le premier jour), puis les mécènes qui la
 * regardaient y puisent leur intérêt — à partir du niveau d'ouverture, et
 * seulement ceux dont le seuil d'audience est atteint. Une fois par partie
 * (les fonctions Postgres s'en assurent). Ne lève jamais : une fin de
 * partie ne doit pas échouer pour ça.
 */
export async function recordMatchAudience(
  matchId: string,
  userId: string,
  finalState: GameState,
  context: { accountLevel: number; playStreak?: number }
): Promise<void> {
  try {
    const service = createSupabaseServiceRoleClient();
    const analysis = analyzeMatch(finalState, userId);
    const { data, error } = await service.rpc("record_match_audience", {
      p_user_id: userId,
      p_match_id: matchId,
      p_spectacle: analysis.spectacle,
      p_highlights: analysis.highlights,
    });
    if (error) {
      console.error("[recordMatchAudience] Refusé :", error.message);
      return;
    }
    // Déjà comptée (rejeu) : les mécènes l'ont déjà vue aussi.
    if (!data?.recorded || context.accountLevel < SPONSORS_UNLOCK_LEVEL) return;

    const points = sponsorPointsForMatch({ audience: data.audience ?? 0, analysis, playStreak: context.playStreak });
    if (!Object.values(points).some((value) => value > 0)) return;
    const interest = await service.rpc("record_sponsor_interest", { p_user_id: userId, p_match_id: matchId, p_points: points });
    if (interest.error) console.error("[recordMatchAudience] Intérêt refusé :", interest.error.message);
  } catch (error) {
    console.error("[recordMatchAudience] Échec :", error);
  }
}
