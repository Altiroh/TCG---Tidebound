import type { GameEvent } from "@/game/events/types";
import type { GameState, PlayerId } from "@/game/state/types";
import type { MatchBalanceReport } from "@/game/balance/matchReport";

/**
 * STATISTIQUES DES PARTIES — la synthèse de toutes les parties terminées,
 * lue par `scripts/matchStatsReport.ts` (bouton « Statistiques des parties »
 * de GitHub Actions).
 *
 * La banque d'équilibrage (`matchReport.ts`) mesure UNE partie ; ce module
 * en agrège un lot : cartes les plus jouées, durées, déroulé type, causes de
 * victoire. Pur : il ne lit ni la base ni l'horloge.
 *
 * Seuls les sièges HUMAINS comptent pour les cartes, Navires et decks — le
 * bot joue des préconstruits figés, il ne dit rien des choix des joueurs.
 */

/** Comment la partie s'est jouée jusqu'au bout : le coup qui l'a terminée. */
export type FinishingKind =
  | "attaque"
  | "effet"
  | "sort"
  | "navire"
  | "maree"
  | "deraison"
  | "autre"
  | "jugement"
  | "abandon"
  | "temps"
  | "nul";

export const FINISHING_LABELS: Record<FinishingKind, string> = {
  attaque: "Attaque d'une unité",
  effet: "Effet d'un permanent",
  sort: "Sort joué depuis la main",
  navire: "Capacité de Navire",
  maree: "Marée",
  deraison: "Déraison",
  autre: "Autre perte d'Ancrage",
  jugement: "Jugement de l'Océan",
  abandon: "Abandon",
  temps: "Délai dépassé",
  nul: "Match nul",
};

export interface FinishingBlow {
  kind: FinishingKind;
  /** Carte qui a porté le dernier coup, quand une carte l'a porté. */
  cardId?: string;
}

/** Retrouve la carte d'un exemplaire : zones de l'état final, puis journal (poses et invocations). */
function cardIdIndex(state: GameState): Map<string, string> {
  const index = new Map<string, string>();
  for (const player of state.players) {
    for (const zone of [player.deck, player.hand, player.board, player.graveyard]) {
      for (const card of zone) index.set(card.instanceId, card.cardId);
    }
  }
  for (const event of state.eventLog) {
    if ((event.type === "PLAY_CARD" || event.type === "SUMMON") && !index.has(event.instanceId)) index.set(event.instanceId, event.cardId);
  }
  return index;
}

/**
 * Le coup qui a fini la partie, lu à rebours depuis `GAME_ENDED` : le dernier
 * dégât porté au Navire du perdant. Un abandon, un délai ou un Jugement de
 * l'Océan se nomment par la raison de fin.
 */
export function finishingBlow(state: GameState): FinishingBlow | null {
  const log = state.eventLog;
  let end = -1;
  for (let i = log.length - 1; i >= 0; i -= 1) {
    if (log[i]!.type === "GAME_ENDED") {
      end = i;
      break;
    }
  }
  if (end < 0) return null;
  const ended = log[end] as Extract<GameEvent, { type: "GAME_ENDED" }>;
  const winnerId = ended.winnerId ?? state.winnerId;
  if (!winnerId) return { kind: "nul" };
  if (ended.reason === "concede") return { kind: "abandon" };
  if (ended.reason === "timeout") return { kind: "temps" };
  if (ended.reason === "oceanJudgment") return { kind: "jugement" };

  const loser: PlayerId | undefined = state.players.find((player) => player.id !== winnerId)?.id;
  const cards = cardIdIndex(state);
  // Seule l'action qui a mis fin à la partie compte : un dégât plus ancien
  // n'a pas fait tomber le Navire (la Marée d'un tour précédent, par exemple).
  const inFinalAction = (event: GameEvent) => ended.actionIndex === undefined || event.actionIndex === ended.actionIndex;
  for (let i = end - 1; i >= 0 && inFinalAction(log[i]!); i -= 1) {
    const event = log[i]!;
    if (event.type === "DERAISON_SETTLED" && event.playerId === loser && event.anchorDamage > 0) return { kind: "deraison" };
    if (event.type !== "DAMAGE" || event.targetPlayerId !== loser || !(event.amount > 0)) continue;
    const dealer = event.dealerInstanceId ?? event.origin?.instanceId;
    const cardId = dealer ? cards.get(dealer) : undefined;
    if (event.cause === "tide" || event.fx === "tide") return { kind: "maree" };
    if (event.cause === "combat" || event.combat) return { kind: "attaque", cardId };
    // Le règlement de la Déraison accompagne son `DAMAGE` (juste avant, ou juste après).
    const near = [log[i - 1], log[i + 1]];
    if (near.some((other) => other?.type === "DERAISON_SETTLED" && other.playerId === loser)) return { kind: "deraison" };
    if (event.cause === "effect" || event.origin) {
      if (dealer) return { kind: "effet", cardId };
      // Sans carte en jeu : sort joué de la main, ou capacité de Navire dans la même action.
      const sameAction = (other: GameEvent) => other.actionIndex !== undefined && other.actionIndex === event.actionIndex;
      for (let j = i; j >= 0 && sameAction(log[j]!); j -= 1) {
        const other = log[j]!;
        if (other.type === "SHIP_ABILITY_FIRED" || other.type === "SHIP_ABILITY_ACTIVATED") return { kind: "navire" };
        if (other.type === "PLAY_CARD") return { kind: "sort", cardId: other.cardId };
      }
      return { kind: "sort" };
    }
    return { kind: "autre", cardId };
  }
  return { kind: "autre" };
}

/** Une partie terminée, prête à agréger. */
export interface DigestMatch {
  mode: string;
  botDifficulty: string | null;
  /** `finished` ou `abandoned` (statut de `matches`). */
  status: string;
  /** Jour de fin, `AAAA-MM-JJ`. */
  day: string;
  report: MatchBalanceReport;
  finishing: FinishingBlow | null;
  /** Sièges tenus par un joueur (le bot exclu). */
  humanSeats: Array<1 | 2>;
  /** Deck de chaque siège (`player1_deck_id`, `player2_deck_id`). */
  deckIds: [string | null, string | null];
}

export interface Spread {
  count: number;
  min: number;
  max: number;
  mean: number;
  median: number;
}

export function spread(values: number[]): Spread | null {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const middle = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
  return {
    count: sorted.length,
    min: sorted[0]!,
    max: sorted[sorted.length - 1]!,
    mean: sorted.reduce((sum, value) => sum + value, 0) / sorted.length,
    median,
  };
}

export interface CardDigest {
  cardId: string;
  /** Poses depuis la main, toutes parties confondues. */
  plays: number;
  /** Parties où la carte a été posée au moins une fois. */
  matchesPlayed: number;
  /** Parties gagnées parmi `matchesPlayed` (nuls exclus du dénominateur). */
  winsWhenPlayed: number;
  decidedWhenPlayed: number;
  damage: number;
  kills: number;
  /** Parties terminées par un coup de cette carte. */
  finishers: number;
}

export interface CountedDigest {
  id: string;
  matches: number;
  wins: number;
  decided: number;
}

export interface MatchDigest {
  matches: number;
  byMode: Record<string, number>;
  byStatus: Record<string, number>;
  seconds: Spread | null;
  tableTurns: Spread | null;
  ownTurns: Spread | null;
  /** Cartes posées par un joueur humain, par partie. */
  playsPerSeat: Spread | null;
  /** Ancrage restant au vainqueur. */
  winnerAnchor: Spread | null;
  /** Déraison du perdant à la fin. */
  loserReason: Spread | null;
  firstPlayer: { wins: number; decided: number };
  endReasons: Record<string, number>;
  finishing: Record<FinishingKind, number>;
  /** Victoires des joueurs contre le bot, par difficulté. */
  vsBot: CountedDigest[];
  ships: CountedDigest[];
  decks: CountedDigest[];
  cards: CardDigest[];
  perDay: Record<string, number>;
  /** Partie la plus courte et la plus longue (en secondes de jeu). */
  shortest: DigestMatch | null;
  longest: DigestMatch | null;
}

function counter(map: Map<string, CountedDigest>, id: string, result: "win" | "loss" | "draw") {
  const entry = map.get(id) ?? { id, matches: 0, wins: 0, decided: 0 };
  entry.matches += 1;
  if (result !== "draw") entry.decided += 1;
  if (result === "win") entry.wins += 1;
  map.set(id, entry);
}

const tally = (record: Record<string, number>, key: string) => {
  record[key] = (record[key] ?? 0) + 1;
};

export function digestMatches(matches: DigestMatch[]): MatchDigest {
  const byMode: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  const endReasons: Record<string, number> = {};
  const perDay: Record<string, number> = {};
  const finishing = Object.fromEntries(Object.keys(FINISHING_LABELS).map((key) => [key, 0])) as Record<FinishingKind, number>;
  const vsBot = new Map<string, CountedDigest>();
  const ships = new Map<string, CountedDigest>();
  const decks = new Map<string, CountedDigest>();
  const cards = new Map<string, CardDigest>();
  const seconds: number[] = [];
  const tableTurns: number[] = [];
  const ownTurns: number[] = [];
  const playsPerSeat: number[] = [];
  const winnerAnchor: number[] = [];
  const loserReason: number[] = [];
  const firstPlayer = { wins: 0, decided: 0 };
  let shortest: DigestMatch | null = null;
  let longest: DigestMatch | null = null;

  const card = (cardId: string): CardDigest => {
    let entry = cards.get(cardId);
    if (!entry) {
      entry = { cardId, plays: 0, matchesPlayed: 0, winsWhenPlayed: 0, decidedWhenPlayed: 0, damage: 0, kills: 0, finishers: 0 };
      cards.set(cardId, entry);
    }
    return entry;
  };

  for (const match of matches) {
    const { report } = match;
    tally(byMode, match.mode);
    tally(byStatus, match.status);
    tally(endReasons, report.endReason ?? "inconnue");
    tally(perDay, match.day);
    if (match.finishing) {
      finishing[match.finishing.kind] += 1;
      if (match.finishing.cardId) card(match.finishing.cardId).finishers += 1;
    }
    if (report.seconds > 0) {
      seconds.push(report.seconds);
      if (!shortest || report.seconds < shortest.report.seconds) shortest = match;
      if (!longest || report.seconds > longest.report.seconds) longest = match;
    }
    tableTurns.push(report.tableTurns);
    if (report.winnerSeat !== null && report.firstSeat !== null) {
      firstPlayer.decided += 1;
      if (report.winnerSeat === report.firstSeat) firstPlayer.wins += 1;
    }

    for (const seat of report.seats) {
      if (seat.result === "win") winnerAnchor.push(seat.finalAnchor);
      if (seat.result === "loss") loserReason.push(seat.finalReason);
      if (!match.humanSeats.includes(seat.seat)) continue;
      ownTurns.push(seat.ownTurns);
      if (match.mode === "bot") counter(vsBot, match.botDifficulty ?? "inconnue", seat.result);
      counter(ships, seat.shipId, seat.result);
      const deckId = match.deckIds[seat.seat - 1];
      if (deckId) counter(decks, deckId, seat.result);
      let plays = 0;
      for (const line of seat.cards) {
        const entry = card(line.cardId);
        entry.plays += line.played;
        entry.damage += line.damageDealt;
        entry.kills += line.kills;
        plays += line.played;
        if (line.played > 0) {
          entry.matchesPlayed += 1;
          if (seat.result !== "draw") entry.decidedWhenPlayed += 1;
          if (seat.result === "win") entry.winsWhenPlayed += 1;
        }
      }
      playsPerSeat.push(plays);
    }
  }

  const sortedCounts = (map: Map<string, CountedDigest>) => [...map.values()].sort((a, b) => b.matches - a.matches || a.id.localeCompare(b.id));
  return {
    matches: matches.length,
    byMode,
    byStatus,
    seconds: spread(seconds),
    tableTurns: spread(tableTurns),
    ownTurns: spread(ownTurns),
    playsPerSeat: spread(playsPerSeat),
    winnerAnchor: spread(winnerAnchor),
    loserReason: spread(loserReason),
    firstPlayer,
    endReasons,
    finishing,
    vsBot: sortedCounts(vsBot),
    ships: sortedCounts(ships),
    decks: sortedCounts(decks),
    cards: [...cards.values()].sort((a, b) => b.plays - a.plays || a.cardId.localeCompare(b.cardId)),
    perDay,
    shortest,
    longest,
  };
}
