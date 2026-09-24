/**
 * LABO DES PRÉCONSTRUITS — une partie instrumentée CARTE PAR CARTE.
 *
 * `scripts/metrics.ts` mesure le rythme d'une partie ; ce module mesure ce
 * que chaque carte y a fait, et pour quel camp. C'est ce qu'il faut pour
 * répondre aux questions d'un préconstruit : quelles cartes gagnent, quelles
 * cartes dorment en main, d'où viennent les dégâts, qui porte le coup final,
 * et ce que devient le deck quand sa meilleure carte ne vient pas.
 *
 * Attribution des dégâts d'Ancrage : par ACTION, en comparant l'Ancrage des
 * deux Navires avant et après chaque coup. L'événement `DAMAGE` ne dit pas
 * d'où il vient, l'action en cours si — c'est la même convention que
 * `metrics.ts`, étendue à la carte source.
 *
 * AVERTISSEMENT — c'est un bot qui pilote. Les chiffres décrivent une liste
 * TELLE QUE LE BOT LA JOUE.
 */
import { botHasSomethingToDo } from "@/game/bot/runBotTurn";
import { chooseBotAction } from "@/game/bot/chooseAction";
import type { BotDifficulty } from "@/game/bot/types";
import { getCardDefinition } from "@/game/cards/sets/core";
import type { DeckList } from "@/game/cards/decks/types";
import { dispatch } from "@/game/engine";
import { createSeededRandom } from "@/game/rng";
import { createGameState } from "@/game/state/createGameState";
import type { GameState, PlayerId } from "@/game/state/types";
import type { PlayerAction } from "@/game/actions/types";

const isUnitCard = (type: string) => type === "marin" || type === "creature";

/** Postes de dégâts infligés au Navire ADVERSE. */
export type DamageSource = "combat" | "effet" | "navire" | "tour";

export interface CardLine {
  /** Exemplaires vus en main (main de départ, pioches, retours). */
  seen: number;
  /** Exemplaires joués depuis la main (ou Brisés depuis la main). */
  played: number;
  /** Fins de tour passées en main. */
  heldTurns: number;
  /** Fins de tour passées en main SANS pouvoir être payée. */
  deadTurns: number;
  /** Dégâts infligés au Navire adverse par cette carte (attaque ou effet). */
  shipDamage: number;
  /** Coups de grâce portés. */
  finalBlows: number;
}

export interface SideRecord {
  deck: string;
  won: boolean;
  first: boolean;
  /** Cartes (par id) vues au moins une fois dans la partie. */
  seenIds: string[];
  cards: Record<string, CardLine>;
  damageDealt: Record<DamageSource, number>;
  /** Ancrage perdu par ses propres coûts / effets (hors Déraison). */
  selfDamage: number;
  deraisonDamage: number;
  healed: number;
  unitsPlayed: number;
  summoned: number;
  cardsPlayed: number;
  /** Raison laissée inutilisée en fin de tour, moyenne sur ses tours. */
  reasonLeft: number[];
  /** Dette de Raison en fin de tour (points sous zéro). */
  reasonDebt: number[];
  /** Tours (parmi ses 4 premiers) où il n'a rien joué. */
  idleEarlyTurns: number;
  /** Nombre de ses tours. */
  ownTurns: number;
  /** Main de départ : cartes de coût ≤ 2 et ≤ 3. */
  openingLow2: number;
  openingLow3: number;
  anchorLeft: number;
  finalBlowSource?: DamageSource | "deraison" | "self";
}

export interface GameRecord {
  seed: number;
  turns: number;
  winner: "a" | "b" | "nul";
  a: SideRecord;
  b: SideRecord;
}

function emptyLine(): CardLine {
  return { seen: 0, played: 0, heldTurns: 0, deadTurns: 0, shipDamage: 0, finalBlows: 0 };
}

function emptySide(deck: string, first: boolean): SideRecord {
  return {
    deck,
    won: false,
    first,
    seenIds: [],
    cards: {},
    damageDealt: { combat: 0, effet: 0, navire: 0, tour: 0 },
    selfDamage: 0,
    deraisonDamage: 0,
    healed: 0,
    unitsPlayed: 0,
    summoned: 0,
    cardsPlayed: 0,
    reasonLeft: [],
    reasonDebt: [],
    idleEarlyTurns: 0,
    ownTurns: 0,
    openingLow2: 0,
    openingLow3: 0,
    anchorLeft: 0,
  };
}

function line(side: SideRecord, cardId: string): CardLine {
  return (side.cards[cardId] ??= emptyLine());
}

function sourceOf(action: PlayerAction): DamageSource {
  if (action.type === "attack") return "combat";
  if (action.type === "fireShipAbility" || action.type === "activateShipAbility") return "navire";
  if (action.type === "endTurn") return "tour";
  return "effet";
}

/** La carte à l'origine du coup, si l'action en désigne une. */
function sourceCard(action: PlayerAction, before: GameState): string | undefined {
  const a = action as { type: string; attackerInstanceId?: string; instanceId?: string; sourceInstanceId?: string };
  const id = a.attackerInstanceId ?? a.instanceId ?? a.sourceInstanceId;
  if (!id) return undefined;
  for (const player of before.players) {
    for (const zone of [player.hand, player.board, player.graveyard]) {
      const card = zone.find((c) => c.instanceId === id);
      if (card) return card.cardId;
    }
  }
  return undefined;
}

export function playInstrumentedGame(
  deckA: DeckList,
  deckB: DeckList,
  seed: number,
  bot: BotDifficulty = "moyen",
  labels: { a: string; b: string } = { a: deckA.name, b: deckB.name }
): GameRecord {
  const random = createSeededRandom(seed ^ 0x5eed);
  let state: GameState = createGameState({
    gameId: `lab-${seed}`,
    player1: { id: "a", deck: deckA },
    player2: { id: "b", deck: deckB },
    seed,
  });

  const sides: Record<PlayerId, SideRecord> = {
    a: emptySide(labels.a, state.activePlayerId === "a"),
    b: emptySide(labels.b, state.activePlayerId === "b"),
  };
  const seenInstances: Record<PlayerId, Set<string>> = { a: new Set(), b: new Set() };
  const seenIds: Record<PlayerId, Set<string>> = { a: new Set(), b: new Set() };
  const playedThisTurn: Record<PlayerId, number> = { a: 0, b: 0 };

  const noteHands = (st: GameState) => {
    for (const p of st.players) {
      for (const card of p.hand) {
        if (seenInstances[p.id]!.has(card.instanceId)) continue;
        seenInstances[p.id]!.add(card.instanceId);
        seenIds[p.id]!.add(card.cardId);
        line(sides[p.id]!, card.cardId).seen += 1;
      }
    }
  };

  for (const p of state.players) {
    const side = sides[p.id]!;
    side.openingLow2 = p.hand.filter((c) => getCardDefinition(c.cardId).cost <= 2).length;
    side.openingLow3 = p.hand.filter((c) => getCardDefinition(c.cardId).cost <= 3).length;
  }
  noteHands(state);

  let guard = 0;
  while (state.status === "active" && guard < 1200) {
    guard += 1;
    const actor = state.players.map((p) => p.id).find((id) => botHasSomethingToDo(state, id));
    if (!actor) break;
    const before = state;
    const action = chooseBotAction(state, actor, bot, random);

    if (action.type === "endTurn" && actor === before.activePlayerId) {
      const me = before.players.find((p) => p.id === actor)!;
      const side = sides[actor]!;
      side.ownTurns += 1;
      if (side.ownTurns <= 4 && playedThisTurn[actor] === 0) side.idleEarlyTurns += 1;
      playedThisTurn[actor] = 0;
      side.reasonLeft.push(Math.max(0, me.reason));
      side.reasonDebt.push(Math.max(0, -me.reason));
      for (const card of me.hand) {
        const l = line(side, card.cardId);
        l.heldTurns += 1;
        if (getCardDefinition(card.cardId).cost > me.reason) l.deadTurns += 1;
      }
    }

    const res = dispatch(state, action);
    if (!res.ok || res.state === state) break;

    const played = new Set<string>();
    let deraison: Record<string, number> = {};
    for (const e of res.events) {
      if (!e) continue;
      if (e.type === "PLAY_CARD") {
        played.add(e.instanceId);
        const side = sides[e.playerId]!;
        line(side, e.cardId).played += 1;
        side.cardsPlayed += 1;
        playedThisTurn[e.playerId] = (playedThisTurn[e.playerId] ?? 0) + 1;
        if (isUnitCard(getCardDefinition(e.cardId).type)) side.unitsPlayed += 1;
      }
      if (e.type === "OBJECT_BROKEN" && e.fromHand) {
        const side = sides[e.playerId]!;
        line(side, e.cardId).played += 1;
        side.cardsPlayed += 1;
        playedThisTurn[e.playerId] = (playedThisTurn[e.playerId] ?? 0) + 1;
      }
      if (e.type === "SUMMON" && !played.has(e.instanceId)) sides[e.playerId]!.summoned += 1;
      if (e.type === "DERAISON_SETTLED") deraison = { ...deraison, [e.playerId]: (deraison[e.playerId] ?? 0) + e.anchorDamage };
    }

    // Ancrage : qui a perdu quoi pendant ce coup, et à cause de qui.
    const src = sourceOf(action);
    const card = src === "tour" ? undefined : sourceCard(action, before);
    for (const p of res.state.players) {
      const was = before.players.find((q) => q.id === p.id)!.anchor;
      const delta = p.anchor - was;
      const side = sides[p.id]!;
      if (delta > 0) {
        side.healed += delta;
        continue;
      }
      if (delta === 0) continue;
      let loss = -delta;
      const fromDeraison = Math.min(loss, deraison[p.id] ?? 0);
      side.deraisonDamage += fromDeraison;
      loss -= fromDeraison;
      if (loss <= 0) continue;
      const dealerId = p.id === "a" ? "b" : "a";
      // Perte sur son propre coup, hors fin de tour : un coût ou un
      // contrecoup qu'il s'inflige (sauf en combat, où c'est la riposte).
      if (p.id === actor && src === "effet") {
        side.selfDamage += loss;
        continue;
      }
      const dealer = sides[dealerId]!;
      dealer.damageDealt[src] += loss;
      if (card && p.id !== actor) line(dealer, card).shipDamage += loss;
      if (p.anchor <= 0 && was > 0) {
        dealer.finalBlowSource = src;
        if (card && p.id !== actor) line(dealer, card).finalBlows += 1;
      }
    }

    state = res.state;
    noteHands(state);
  }

  const winner: GameRecord["winner"] = state.winnerId === "a" ? "a" : state.winnerId === "b" ? "b" : "nul";
  for (const p of state.players) {
    const side = sides[p.id]!;
    side.won = winner === p.id;
    side.anchorLeft = p.anchor;
    side.seenIds = [...seenIds[p.id]!];
  }
  return { seed, turns: state.turnNumber, winner, a: sides.a!, b: sides.b! };
}
