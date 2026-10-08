import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { PLAYABLE_DECKS, getShipDefinition, type GameState } from "@/game";
import { SHIP_SET } from "@/game/environment/shipData";
import { AUDIENCE_MILESTONES, analyzeMatch, matchAudienceWeight, type AudienceOpponent } from "@/game/audience";
import {
  ABANDONED_MATCH_XP,
  MASTERY_MAX_LEVEL,
  SPONSORS,
  SPONSORS_UNLOCK_LEVEL,
  SPONSOR_STAGES,
  WEEKLY_CHEST_GOAL,
  loginCardPool,
  loginWeekIndex,
  masteryProgress,
  masteryRewardForLevel,
  shiftDayKey,
  sponsorGift,
  sponsorGiftStagesReached,
  sponsorHeldPoints,
  sponsorInterestPercent,
  sponsorPointsForMatch,
  sponsorRevealed,
  sponsorStage,
  sponsorStageLabel,
  sponsorWatches,
  sponsorsLostAt,
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
  /** Qui il est et son histoire — `null` tant qu'il est anonyme. */
  figure: string | null;
  lore: string | null;
  color: SponsorColor;
  /** Audience qu'il exige avant de s'intéresser au joueur. */
  audienceRequired: number;
  /** L'audience COURANTE du joueur atteint son seuil — sinon, il perd son intérêt. */
  meetsAudience: boolean;
  /** Il regarde et a commencé à s'intéresser (au moins un point d'intérêt tenu, `sponsorHeldPoints`). */
  watching: boolean;
  points: number;
  stage: SponsorStage;
  stageLabel: string;
  percent: number;
  /** Colis arrivés et pas encore ouverts, du plus ancien au plus récent. */
  giftStages: SponsorStage[];
  /**
   * Paliers dont le colis a DÉJÀ été ouvert — acquis pour de bon, même si
   * le mécène a depuis perdu son intérêt (il ne le renverra pas).
   */
  openedStages: SponsorStage[];
}

export interface AudienceView {
  /** Spectateurs qui suivent le joueur. */
  audience: number;
  best: number;
  /** Spectacle de la dernière partie (0 à 100), `null` avant la première. */
  lastSpectacle: number | null;
  /** Temps forts de la dernière partie jugée (deux au plus). */
  lastHighlights: string[];
}

/** Un palier d'audience, tel que le panneau du public l'affiche (`game/audience/milestones.ts`). */
export interface AudienceMilestoneView {
  threshold: number;
  label: string;
  rewards: readonly LoginRewardItem[];
  /** Le record l'a franchi. */
  reached: boolean;
  claimed: boolean;
  /** Franchi et pas encore ouvert. */
  claimable: boolean;
}

export interface ProgressionHubView {
  audience: AudienceView;
  /** Paliers de record d'audience, du plus bas au plus haut. */
  audienceMilestones: AudienceMilestoneView[];
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

/**
 * Navire de chaque préconstruit joué, lu au catalogue.
 *
 * Les decks PERSONNELS n'y sont plus résolus : leur navire se modifie, et
 * l'XP de maîtrise suivait le navire ACTUEL — changer le navire d'un deck
 * reversait tout son historique au nouveau, réclamable une seconde fois. Le
 * navire réellement joué est figé dans la partie (`matches.playerN_ship_id`).
 */
function preconShip(deckId: string): string | undefined {
  return PLAYABLE_DECKS.find((deck) => deck.id === deckId)?.shipId;
}

/** Audience du joueur (`player_audience`) — zéro tant qu'il n'a rien joué, ou que la migration manque. */
export async function readAudience(service: Service, userId: string): Promise<AudienceView> {
  const { data, error } = await service
    .from("player_audience")
    .select("audience, best_audience, last_spectacle, last_highlights")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) return { ...NO_AUDIENCE };
  return { audience: data.audience, best: data.best_audience, lastSpectacle: data.last_spectacle, lastHighlights: data.last_highlights ?? [] };
}

const NO_AUDIENCE: AudienceView = { audience: 0, best: 0, lastSpectacle: null, lastHighlights: [] };

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
  // Coffre de la semaine : seules les parties JOUÉES comptent. Une partie
  // abandonnée ou écartée par l'anti-farm paie exactement `ABANDONED_MATCH_XP`
  // (jamais de bonus ni de prime) ; une partie jouée, au moins `MATCH_XP.completed`.
  const playedThisWeek = rows.filter((row) => row.granted_at.slice(0, 10) >= weekStart && row.xp_granted > ABANDONED_MATCH_XP).length;

  const xpByShip = new Map<string, number>();
  const matchesByShip = new Map<string, number>();
  const matchIds = rows.map((row) => row.match_id);
  for (let start = 0; start < matchIds.length; start += 200) {
    const chunk = matchIds.slice(start, start + 200);
    const { data: matches } = await service
      .from("matches")
      .select("id, player1_id, player1_deck_id, player2_deck_id, player1_ship_id, player2_ship_id")
      .in("id", chunk);
    const shipOf = new Map<string, string>();
    for (const match of matches ?? []) {
      const isPlayer1 = match.player1_id === userId;
      const frozen = isPlayer1 ? match.player1_ship_id : match.player2_ship_id;
      const deckId = isPlayer1 ? match.player1_deck_id : match.player2_deck_id;
      // Navire figé au démarrage ; à défaut (partie antérieure à la
      // migration sans état conservé), seul un préconstruit fait foi.
      const shipId = frozen ?? (deckId ? preconShip(deckId) : undefined);
      if (shipId) shipOf.set(match.id, shipId);
    }
    for (const row of rows.slice(start, start + 200)) {
      const shipId = shipOf.get(row.match_id);
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

/**
 * Paliers de MAÎTRISE atteints et pas encore réclamés, tous Navires
 * confondus — pour les raccourcis du bandeau et la pastille de l'avatar,
 * qui ne les comptaient pas. Même règle que le hub (`masteryView`), lue sur
 * les mêmes tables. Toute erreur vaut zéro : un compteur d'attention ne
 * doit jamais faire tomber le bandeau.
 *
 * `ships` : les Navires concernés, du plus joué au moins joué — le premier
 * illustre le raccourci.
 */
export async function countClaimableMasteryLevels(userId: string): Promise<{ total: number; ships: string[] }> {
  try {
    const service = createSupabaseServiceRoleClient();
    const [claims, history] = await Promise.all([readClaims(service, userId), readMatchHistory(service, userId, "9999-12-31")]);
    const waiting = SHIP_SET.map((ship) => masteryView(ship.id, history.xpByShip.get(ship.id) ?? 0, history.matchesByShip.get(ship.id) ?? 0, claims))
      .filter((mastery) => mastery.claimableLevels.length > 0)
      .sort((a, b) => b.matchesPlayed - a.matchesPlayed || b.xpTotal - a.xpTotal);
    return {
      total: waiting.reduce((sum, mastery) => sum + mastery.claimableLevels.length, 0),
      ships: waiting.map((mastery) => mastery.shipId),
    };
  } catch (error) {
    console.error("[countClaimableMasteryLevels] Lecture impossible :", error);
    return { total: 0, ships: [] };
  }
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
  audience = NO_AUDIENCE,
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
    audienceMilestones: AUDIENCE_MILESTONES.map((milestone) => {
      const reached = audience.best >= milestone.threshold;
      const claimed = claims.has(`audience_milestone|${milestone.threshold}`);
      return { ...milestone, reached, claimed, claimable: reached && !claimed };
    }),
    // Ceux qui regardent d'abord, puis du plus accessible au plus exigeant.
    sponsors: SPONSORS.map((sponsor) => sponsorView(sponsor.id, pointsBySponsor.get(sponsor.id) ?? 0, claims, accountLevel, audience)).sort(
      (a, b) => b.points - a.points || a.audienceRequired - b.audienceRequired
    ),
  };
}

function sponsorView(id: SponsorId, storedPoints: number, claims: Set<string>, accountLevel: number, audience: AudienceView): SponsorView {
  const definition = SPONSORS.find((sponsor) => sponsor.id === id)!;
  // Sous son seuil, il a détourné les yeux : plus d'intérêt, plus de palier, plus de colis à venir.
  const points = sponsorHeldPoints(definition.audienceRequired, audience.audience, storedPoints);
  const revealed = sponsorRevealed(points);
  const stage = sponsorStage(points);
  return {
    id,
    name: revealed ? definition.name : null,
    style: revealed ? definition.attraction : null,
    figure: revealed ? definition.figure : null,
    lore: revealed ? definition.lore : null,
    color: definition.color,
    audienceRequired: definition.audienceRequired,
    // Même règle que l'octroi des points : le panneau ne dit jamais « il vous regarde » quand la partie suivante ne lui en donnerait pas.
    meetsAudience: sponsorWatches(definition.audienceRequired, audience.audience),
    watching: points > 0,
    points,
    stage,
    stageLabel: sponsorStageLabel(stage),
    percent: sponsorInterestPercent(points),
    giftStages:
      accountLevel >= SPONSORS_UNLOCK_LEVEL ? sponsorGiftStagesReached(points).filter((reached) => !claims.has(`sponsor_gift|${id}:${reached}`)) : [],
    openedStages: SPONSOR_STAGES.filter((stage) => claims.has(`sponsor_gift|${id}:${stage.id}`)).map((stage) => stage.id),
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
  kind: "weekly_chest" | "mastery" | "sponsor_gift" | "audience_milestone",
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

/** Ouvre un palier d'audience franchi par le record (migration 20261013120000 : type de réclamation `audience_milestone`). */
export async function claimAudienceMilestone(userId: string, accountLevel: number, threshold: number): Promise<HubClaimResult> {
  try {
    const hub = await readProgressionHub(userId, accountLevel);
    const milestone = hub.audienceMilestones.find((entry) => entry.threshold === threshold);
    if (!milestone || !milestone.claimable) return { ok: false, error: "Ce palier d'audience n'est pas à réclamer." };
    return await grant(userId, "audience_milestone", String(threshold), milestone.rewards);
  } catch (error) {
    console.error("[claimAudienceMilestone] Échec :", error);
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
  context: {
    accountLevel: number;
    playStreak?: number;
    /** Contre qui : un joueur, ou un bot de tel niveau (`audienceOpponent`). Défaut : un joueur. */
    opponent?: AudienceOpponent;
    /** Prime du public déjà octroyée avec la partie (`awardMatchReward`) — notée pour l'écran de fin. */
    prize?: { xp: number; tides: number } | null;
    /**
     * Le joueur a-t-il vraiment joué (`isMeaningfulMatch`) ? Non : la partie
     * est notée, mais ne pèse rien sur l'audience ni sur les mécènes
     * (`matchAudienceWeight`). Défaut : oui.
     */
    played?: boolean;
  }
): Promise<void> {
  try {
    const service = createSupabaseServiceRoleClient();
    const analysis = analyzeMatch(finalState, userId);
    const opponent = context.opponent ?? "joueur";
    const played = context.played ?? true;
    // Une victoire ne fait jamais perdre d'audience (migration 20261029120000).
    let { data, error } = await service.rpc("record_match_audience", {
      p_user_id: userId,
      p_match_id: matchId,
      p_spectacle: analysis.spectacle,
      p_highlights: analysis.highlights,
      p_vs_bot: opponent !== "joueur",
      p_prize_xp: context.prize?.xp ?? 0,
      p_prize_tides: context.prize?.tides ?? 0,
      p_weight: matchAudienceWeight(opponent, played),
      p_won: analysis.facts.won,
    });
    // Migration 20261029120000 pas encore passée : la fonction ne connaît pas
    // `p_won`. On juge quand même, sans le plancher de victoire.
    if (error?.code === "PGRST202") {
      ({ data, error } = await service.rpc("record_match_audience", {
        p_user_id: userId,
        p_match_id: matchId,
        p_spectacle: analysis.spectacle,
        p_highlights: analysis.highlights,
        p_vs_bot: opponent !== "joueur",
        p_prize_xp: context.prize?.xp ?? 0,
        p_prize_tides: context.prize?.tides ?? 0,
        p_weight: matchAudienceWeight(opponent, played),
      }));
    }
    // Migration 20261015120000 pas encore passée : la fonction ne connaît pas
    // `p_weight` (PostgREST ne trouve pas la signature). On juge quand même,
    // avec le poids fixe « contre le bot » de 20261013120000.
    // Sans `p_weight`, une partie non jouée ne peut pas être neutralisée : on ne la juge pas.
    if (error?.code === "PGRST202" && !played) return;
    if (error?.code === "PGRST202") {
      ({ data, error } = await service.rpc("record_match_audience", {
        p_user_id: userId,
        p_match_id: matchId,
        p_spectacle: analysis.spectacle,
        p_highlights: analysis.highlights,
        p_vs_bot: opponent !== "joueur",
        p_prize_xp: context.prize?.xp ?? 0,
        p_prize_tides: context.prize?.tides ?? 0,
      }));
    }
    if (error) {
      console.error("[recordMatchAudience] Refusé :", error.message);
      return;
    }
    // Déjà comptée (rejeu) : les mécènes l'ont déjà vue aussi.
    if (!data?.recorded) return;

    // L'intérêt suit l'audience COURANTE : retombée sous le seuil d'un
    // mécène, elle lui fait perdre son intérêt (`sponsorsLostAt`). Migration
    // 20261021120000 pas encore passée : la lecture applique déjà la règle
    // (`sponsorHeldPoints`), l'effacement attendra.
    const lost = sponsorsLostAt(data.audience ?? 0);
    if (lost.length > 0) {
      const forgotten = await service.rpc("forget_sponsor_interest", { p_user_id: userId, p_sponsor_ids: lost });
      if (forgotten.error && forgotten.error.code !== "PGRST202") console.error("[recordMatchAudience] Oubli des mécènes refusé :", forgotten.error.message);
    }

    if (!played || context.accountLevel < SPONSORS_UNLOCK_LEVEL) return;

    const points = sponsorPointsForMatch({ audience: data.audience ?? 0, analysis, playStreak: context.playStreak });
    if (!Object.values(points).some((value) => value > 0)) return;
    const interest = await service.rpc("record_sponsor_interest", { p_user_id: userId, p_match_id: matchId, p_points: points });
    if (interest.error) console.error("[recordMatchAudience] Intérêt refusé :", interest.error.message);
  } catch (error) {
    console.error("[recordMatchAudience] Échec :", error);
  }
}
