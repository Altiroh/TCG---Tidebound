import { getCardDefinition } from "@/game/cards/sets/core";
import { UNIT_CARD_TYPES } from "@/game/cards/types";
import type { GameEvent } from "@/game/events/types";
import type { GameState, PlayerId } from "@/game/state/types";
import { computeMatchStats, matchSeconds } from "@/game/quests/progress";
import type { MatchStats } from "@/game/quests/matchStats";

/**
 * BANQUE D'ÉQUILIBRAGE — le relevé d'une partie terminée, tel qu'il est
 * versé en base (`balance_matches`, `balance_match_seats`,
 * `balance_card_lines`) pour être agrégé plus tard, carte par carte et
 * Navire par Navire.
 *
 * Ce n'est PAS un compteur de joueur (`game/quests/matchStats.ts` s'en
 * charge) : c'est une mesure du JEU. Elle couvre donc les deux sièges, bot
 * compris, et toutes les parties terminées, amicales comprises — c'est à
 * la lecture qu'on filtre (`is_bot`, `mode`, `counts_as_played`).
 *
 * Tout est dérivé du journal d'événements et de l'état final, comme les
 * quêtes : rien ne vient du client.
 *
 * ATTRIBUTION À UNE CARTE. Un `DAMAGE` nomme la carte qui frappe
 * (`dealerInstanceId`) ou d'où part l'effet (`origin.instanceId`) ; sans
 * l'une ni l'autre (sort joué depuis la main), le coup revient à la
 * dernière carte JOUÉE dans la même action. Une destruction revient à la
 * carte qui a porté le dernier coup à la victime, à défaut à la carte
 * source de l'action en cours (« détruisez une unité »). Les dégâts d'une
 * capacité de Navire sont comptés au siège, pas à une carte.
 *
 * Le relevé a une VERSION (`BALANCE_REPORT_VERSION`) : on la monte dès
 * qu'une règle d'attribution change, pour ne jamais mélanger deux façons de
 * compter dans une même agrégation.
 */
export const BALANCE_REPORT_VERSION = 1;

/** Ligne d'une carte pour UN siège, dans UNE partie. Une carte absente du deck n'a de ligne que si elle a été invoquée. */
export interface BalanceCardLine {
  cardId: string;
  /**
   * Empreinte de la DÉFINITION de la carte au moment de la partie (coût,
   * stats, texte, capacités). Change à chaque retouche : c'est ce qui
   * permet de comparer une carte avant et après un rééquilibrage.
   */
  defHash: string;
  /** Exemplaires dans le deck au départ (0 pour un jeton invoqué). */
  copies: number;
  /** Exemplaires passés par la main : main de départ, pioche, retour en main. */
  seen: number;
  /** Poses depuis la main (une carte renvoyée en main puis rejouée compte deux fois). */
  played: number;
  /** Somme des tours DU JOUEUR (1, 2, 3…) où elle a été jouée — moyenne = `/ played`. */
  playTurnSum: number;
  /** Exemplaires invoqués par un effet (jetons, Péons…). */
  summoned: number;
  /** Dégâts infligés au camp adverse (unités et Navire). */
  damageDealt: number;
  /** Part de `damageDealt` portée au Navire adverse. */
  shipDamage: number;
  /** Unités adverses détruites. */
  kills: number;
  /** Exemplaires de cette carte détruits (Sabordage exclu). */
  deaths: number;
  /** Réactions activées depuis cette carte (pièges compris). */
  reactions: number;
  /** Capacités déclenchées résolues pour cette carte. */
  abilities: number;
}

export type BalanceSeatResult = "win" | "loss" | "draw";

export interface BalanceSeatReport {
  /** 1 ou 2 : l'ordre de `state.players`. */
  seat: 1 | 2;
  playerId: PlayerId;
  shipId: string;
  result: BalanceSeatResult;
  wentFirst: boolean;
  /** Tours joués par CE joueur. */
  ownTurns: number;
  finalAnchor: number;
  finalReason: number;
  shipAbilityUses: number;
  /** Dégâts infligés à l'adversaire par les capacités de Navire de ce siège. */
  shipAbilityDamage: number;
  /** Relevé complet des statistiques de partie de ce siège (mêmes clés que les compteurs à vie). */
  stats: MatchStats;
  cards: BalanceCardLine[];
}

export interface MatchBalanceReport {
  version: number;
  /** Tours de TABLE. */
  tableTurns: number;
  seconds: number;
  endReason: string | null;
  /** Siège vainqueur, `null` pour un nul. */
  winnerSeat: 1 | 2 | null;
  /** Siège qui a joué le premier tour. */
  firstSeat: 1 | 2 | null;
  seats: [BalanceSeatReport, BalanceSeatReport];
}

export interface MatchBalanceReportInput {
  /** État FINAL complet (jamais une vue projetée). */
  state: GameState;
  /** Partie contre bot : transmis à `computeMatchStats` pour les clés PvP. */
  vsBot: boolean;
}

/** Empreinte courte (FNV-1a 32 bits, hexadécimal) d'une définition de carte. */
export function cardDefinitionHash(cardId: string): string {
  let json: string;
  try {
    json = JSON.stringify(getCardDefinition(cardId));
  } catch {
    return "inconnue";
  }
  let hash = 0x811c9dc5;
  for (let index = 0; index < json.length; index += 1) {
    hash ^= json.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

interface Identity {
  owner: PlayerId;
  cardId: string;
}

type CardKey = string;
const cardKey = (owner: PlayerId, cardId: string): CardKey => `${owner}\u0000${cardId}`;

export function computeMatchBalanceReport({ state, vsBot }: MatchBalanceReportInput): MatchBalanceReport {
  const [p1, p2] = state.players;
  const seatOf = (playerId: PlayerId | undefined): 1 | 2 | null => (playerId === p1.id ? 1 : playerId === p2.id ? 2 : null);
  const otherOf = (playerId: PlayerId): PlayerId => (playerId === p1.id ? p2.id : p1.id);

  // --- Identités : qui possède quel exemplaire, et d'où il vient -----------
  const identities = new Map<string, Identity>();
  /** Exemplaire NEUF → exemplaire d'origine (retour en main). */
  const aliasOf = new Map<string, string>();
  /** Exemplaires nés en cours de partie par invocation : jamais « au deck ». */
  const tokens = new Set<string>();
  const remember = (instanceId: string, owner: PlayerId | undefined, cardId: string | undefined) => {
    if (!owner || !cardId || identities.has(instanceId)) return;
    identities.set(instanceId, { owner, cardId });
  };
  for (const player of state.players) {
    for (const zone of [player.deck, player.hand, player.board, player.graveyard]) {
      for (const card of zone) remember(card.instanceId, player.id, card.cardId);
    }
  }
  const lande = state.environment.lande;
  if (lande) remember(lande.instanceId, lande.ownerId, lande.cardId);
  for (const event of state.eventLog) {
    if (event.type === "PLAY_CARD" || event.type === "OBJECT_BROKEN") remember(event.instanceId, event.playerId, event.cardId);
    else if (event.type === "SUMMON") {
      remember(event.instanceId, event.playerId, event.cardId);
      if (!event.played) tokens.add(event.instanceId);
    } else if (event.type === "CARD_MOVED" && event.cardId) {
      remember(event.instanceId, event.ownerId, event.cardId);
      if (event.toInstanceId && event.toInstanceId !== event.instanceId) {
        remember(event.toInstanceId, event.ownerId, event.cardId);
        aliasOf.set(event.toInstanceId, event.instanceId);
      }
    }
  }
  const rootOf = (instanceId: string): string => {
    let current = instanceId;
    for (let guard = 0; guard < 64; guard += 1) {
      const parent = aliasOf.get(current);
      if (!parent) return current;
      current = parent;
    }
    return current;
  };

  // --- Lignes de cartes ------------------------------------------------------
  const lines = new Map<CardKey, BalanceCardLine & { owner: PlayerId }>();
  const lineFor = (owner: PlayerId, cardId: string) => {
    const key = cardKey(owner, cardId);
    let line = lines.get(key);
    if (!line) {
      line = {
        owner,
        cardId,
        defHash: cardDefinitionHash(cardId),
        copies: 0,
        seen: 0,
        played: 0,
        playTurnSum: 0,
        summoned: 0,
        damageDealt: 0,
        shipDamage: 0,
        kills: 0,
        deaths: 0,
        reactions: 0,
        abilities: 0,
      };
      lines.set(key, line);
    }
    return line;
  };
  const lineOfInstance = (instanceId: string | undefined) => {
    if (!instanceId) return undefined;
    const identity = identities.get(instanceId) ?? identities.get(rootOf(instanceId));
    return identity ? lineFor(identity.owner, identity.cardId) : undefined;
  };

  // Exemplaires au deck : toute origine qui n'est ni un jeton, ni un alias.
  for (const [instanceId, identity] of identities) {
    if (aliasOf.has(instanceId) || tokens.has(rootOf(instanceId))) continue;
    if (seatOf(identity.owner) === null) continue;
    lineFor(identity.owner, identity.cardId).copies += 1;
  }

  /** Origines passées par la main (main de départ comprise : elle en sort forcément, ou y est encore). */
  const seenRoots = new Set<string>();
  const markSeen = (instanceId: string) => {
    const root = rootOf(instanceId);
    if (!tokens.has(root)) seenRoots.add(root);
  };
  for (const player of state.players) for (const card of player.hand) markSeen(card.instanceId);

  // --- Lecture du journal -----------------------------------------------------
  const ownTurns = new Map<PlayerId, number>([
    [p1.id, 0],
    [p2.id, 0],
  ]);
  const shipAbilityUses = new Map<PlayerId, number>([
    [p1.id, 0],
    [p2.id, 0],
  ]);
  const shipAbilityDamage = new Map<PlayerId, number>([
    [p1.id, 0],
    [p2.id, 0],
  ]);
  let firstPlayer: PlayerId | null = null;
  let endReason: string | null = null;
  /** Dernière carte à avoir blessé chaque exemplaire — pour créditer sa destruction. */
  const lastHitBy = new Map<string, BalanceCardLine & { owner: PlayerId }>();
  const scuttled = new Set<string>();

  let groupKey: number | string | undefined;
  let legacyGroup = 0;
  /** Carte source de l'action en cours (pose, capacité résolue). */
  let groupSource: (BalanceCardLine & { owner: PlayerId }) | undefined;
  /** Joueur qui résout en ce moment une capacité de Navire. */
  let groupShip: PlayerId | null = null;

  for (const event of state.eventLog) {
    if (event.actionIndex === undefined && LEGACY_MARKERS.has(event.type)) legacyGroup += 1;
    const key = event.actionIndex ?? `ancien:${legacyGroup}`;
    if (key !== groupKey) {
      groupKey = key;
      groupSource = undefined;
      groupShip = null;
    }

    switch (event.type) {
      case "TURN_STARTED":
        if (event.playerId) {
          if (firstPlayer === null) firstPlayer = event.playerId;
          ownTurns.set(event.playerId, (ownTurns.get(event.playerId) ?? 0) + 1);
        }
        groupSource = undefined;
        groupShip = null;
        break;

      case "GAME_ENDED":
        endReason = event.reason ?? null;
        break;

      case "DRAW_CARD":
        markSeen(event.instanceId);
        break;

      case "CARD_MOVED":
        if (event.fromZone === "hand" || event.toZone === "hand") markSeen(event.instanceId);
        if (event.toInstanceId && event.toZone === "hand") markSeen(event.toInstanceId);
        break;

      case "OBJECT_BROKEN":
        if (event.fromHand) markSeen(event.instanceId);
        groupSource = lineOfInstance(event.instanceId);
        groupShip = null;
        break;

      case "PLAY_CARD": {
        markSeen(event.instanceId);
        const line = lineFor(event.playerId, event.cardId);
        line.played += 1;
        line.playTurnSum += ownTurns.get(event.playerId) ?? 0;
        groupSource = line;
        groupShip = null;
        break;
      }

      case "SUMMON":
        if (!event.played) lineFor(event.playerId, event.cardId).summoned += 1;
        break;

      case "ABILITY_RESOLVED": {
        const line = lineOfInstance(event.instanceId);
        if (line) {
          line.abilities += 1;
          groupSource = line;
        }
        break;
      }

      case "REACTION_ACTIVATED": {
        const line = lineOfInstance(event.sourceInstanceId);
        if (line) line.reactions += 1;
        break;
      }

      case "SHIP_ABILITY_ACTIVATED":
      case "SHIP_ABILITY_FIRED":
        if (event.type === "SHIP_ABILITY_ACTIVATED") shipAbilityUses.set(event.playerId, (shipAbilityUses.get(event.playerId) ?? 0) + 1);
        groupShip = event.playerId;
        groupSource = undefined;
        break;

      case "SABORDED":
        scuttled.add(event.instanceId);
        break;

      case "DAMAGE": {
        if (event.amount <= 0) break;
        const victimOwner = event.targetPlayerId ?? (event.targetInstanceId ? identities.get(event.targetInstanceId)?.owner : undefined);
        if (!victimOwner) break;
        const dealer = lineOfInstance(event.dealerInstanceId ?? event.origin?.instanceId);
        const sourcePlayer = event.sourcePlayerId ?? event.origin?.playerId;
        let credited = dealer;
        if (!credited && event.cause !== "tide" && event.cause !== "combat") {
          if (groupShip !== null && (sourcePlayer === undefined || sourcePlayer === groupShip)) {
            if (groupShip !== victimOwner) shipAbilityDamage.set(groupShip, (shipAbilityDamage.get(groupShip) ?? 0) + event.amount);
            break;
          }
          if (groupSource && (sourcePlayer === undefined || sourcePlayer === groupSource.owner)) credited = groupSource;
        }
        if (!credited || credited.owner === victimOwner) break;
        credited.damageDealt += event.amount;
        if (event.targetPlayerId) credited.shipDamage += event.amount;
        if (event.targetInstanceId) lastHitBy.set(event.targetInstanceId, credited);
        break;
      }

      case "DESTROY": {
        const victim = identities.get(event.instanceId) ?? identities.get(rootOf(event.instanceId));
        if (!victim) break;
        if (!scuttled.has(event.instanceId)) lineFor(victim.owner, victim.cardId).deaths += 1;
        if (!isUnit(victim.cardId) || scuttled.has(event.instanceId)) break;
        const killer = lastHitBy.get(event.instanceId) ?? groupSource;
        if (killer && killer.owner === otherOf(victim.owner)) killer.kills += 1;
        break;
      }

      default:
        break;
    }
  }

  for (const root of seenRoots) {
    const identity = identities.get(root);
    if (identity && seatOf(identity.owner) !== null) lineFor(identity.owner, identity.cardId).seen += 1;
  }

  const winnerSeat = seatOf(state.winnerId);
  const seat = (player: GameState["players"][number], index: 1 | 2): BalanceSeatReport => ({
    seat: index,
    playerId: player.id,
    shipId: player.shipId,
    result: winnerSeat === null ? "draw" : winnerSeat === index ? "win" : "loss",
    wentFirst: firstPlayer === player.id,
    ownTurns: ownTurns.get(player.id) ?? 0,
    finalAnchor: player.anchor,
    finalReason: player.reason,
    shipAbilityUses: shipAbilityUses.get(player.id) ?? 0,
    shipAbilityDamage: shipAbilityDamage.get(player.id) ?? 0,
    stats: computeMatchStats({ state, playerId: player.id, vsBot, won: state.winnerId === player.id }),
    cards: Array.from(lines.values())
      .filter((line) => line.owner === player.id)
      .map(({ owner: _owner, ...line }) => line)
      .sort((a, b) => a.cardId.localeCompare(b.cardId)),
  });

  return {
    version: BALANCE_REPORT_VERSION,
    tableTurns: state.turnNumber,
    seconds: matchSeconds(state),
    endReason,
    winnerSeat,
    firstSeat: seatOf(firstPlayer ?? undefined),
    seats: [seat(p1, 1), seat(p2, 2)],
  };
}

/** Marqueurs d'action d'un journal ancien, non signé (`actionIndex` absent). */
const LEGACY_MARKERS: ReadonlySet<GameEvent["type"]> = new Set<GameEvent["type"]>([
  "PLAY_CARD",
  "ATTACK",
  "OBJECT_BROKEN",
  "SHIP_ABILITY_ACTIVATED",
  "SHIP_ABILITY_FIRED",
  "TURN_STARTED",
  "END_TURN",
  "PHASE_CHANGED",
]);

function isUnit(cardId: string): boolean {
  try {
    return UNIT_CARD_TYPES.includes(getCardDefinition(cardId).type);
  } catch {
    return false;
  }
}
