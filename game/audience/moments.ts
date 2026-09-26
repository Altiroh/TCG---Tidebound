import { getCardDefinition } from "@/game/cards/sets/core";
import type { CardType } from "@/game/cards/types";
import { getShipDefinition } from "@/game/environment/shipData";
import type { GameState, PlayerId } from "@/game/state/types";

/**
 * LES MOMENTS — le public réagit COUP PAR COUP, pendant la partie.
 *
 * Là où les analyseurs (`analyzers.ts`) jugent la partie dans son ensemble
 * (rythme, tension finale, maîtrise), les moments suivent le journal au fil
 * des coups et font monter ou baisser la salle.
 *
 * Le public juge ce qu'il VOIT, et il le juge avec discernement :
 * - **Qui a fait le coup.** Une destruction est portée au crédit de celui
 *   qui l'a CAUSÉE (combat, dégâts, désignation, Sabordage) — jamais au
 *   simple spectateur : l'adversaire qui sacrifie sa propre unité ne vous
 *   rapporte rien, et votre propre Sabordage ne vous coûte rien.
 * - **Ce que le coup pèse.** Une unité chère abattue compte plus qu'un
 *   jeton ; une frappe au Navire se mesure en part de son Ancrage de départ,
 *   pas en points bruts.
 * - **L'enjeu.** Quand un Navire est au bord du naufrage, chaque coup
 *   compte davantage (`stakes`).
 * - **La lassitude.** Le même coup répété dans le même tour émeut de moins
 *   en moins (`HABITUATION`) : dix piqûres ne valent pas une bordée.
 * - **Une avance qui compte.** Le meneur ne change qu'au-delà d'un écart
 *   franc (`LEAD_GAP`) : deux coups de début de partie ne font pas un
 *   retournement.
 *
 * Deux sortes de moments : le JEU (ce qui se passe sur la table) et la
 * CONDUITE (tour passé, délai laissé filer). Les deux font bouger
 * le compteur en direct ; en fin de partie, seul le jeu entre dans
 * l'analyseur `moments` — la conduite est jugée une seule fois, par
 * l'analyseur `conduite`. Aucun fait n'est compté deux fois.
 *
 * UNE seule passe sur le journal (`readTimeline`), dont les faits de la
 * partie (`facts.ts`) reprennent aussi l'Ancrage et les changements de
 * meneur. Poids PROVISOIRES, en points de spectacle — reportés dans Notion.
 */
export type MomentKind = "jeu" | "conduite";

export interface AudienceMoment {
  /** Position de l'événement dans le journal. */
  index: number;
  id: string;
  /** Ce qu'un commentateur dirait. */
  label: string;
  /** Points de spectacle, positifs ou négatifs (au dixième). */
  weight: number;
  kind: MomentKind;
}

/** Ce que la passe sur le journal retient, en plus des moments. */
export interface MatchTimeline {
  moments: AudienceMoment[];
  startingAnchor: number;
  opponentStartingAnchor: number;
  /** Ancrage le plus bas atteint par le joueur. */
  lowestAnchor: number;
  /** Changements de meneur francs (au-delà de `LEAD_GAP`). */
  leadChanges: number;
  idleTurns: number;
  timeouts: number;
  deraisons: number;
}

/** Écart (en part d'Ancrage de départ) au-delà duquel un joueur MÈNE. */
export const LEAD_GAP = 0.15;
/** Chaque répétition du même coup dans le même tour ne vaut plus que cette part du précédent. */
export const HABITUATION = 0.6;
/** Types de carte dont la destruction émeut la salle (un Objet ou un Équipement qui tombe, non). */
const NOTABLE_TYPES: readonly CardType[] = ["marin", "creature", "structure", "anomalie"];

export function startingAnchorOf(shipId: string | undefined): number {
  try {
    return shipId ? getShipDefinition(shipId).startingAnchor : 20;
  } catch {
    return 20;
  }
}

/** Palier de valeur d'une carte (1 à 3) d'après son coût — une carte inconnue ou masquée vaut 1. */
function tierOf(cardId: string | undefined): number {
  if (!cardId) return 1;
  try {
    const cost = getCardDefinition(cardId).cost;
    return cost <= 2 ? 1 : cost <= 4 ? 2 : 3;
  } catch {
    return 1;
  }
}

/** La carte émeut-elle la salle en tombant ? Inconnue ou masquée : oui, dans le doute. */
function isNotable(cardId: string | undefined): boolean {
  if (!cardId) return true;
  try {
    return NOTABLE_TYPES.includes(getCardDefinition(cardId).type);
  } catch {
    return true;
  }
}

/** Propriétaire et carte de chaque exemplaire connu : zones de l'état, puis journal (jetons disparus, retours en main). */
function identitiesOf(state: GameState): { owners: Map<string, PlayerId>; cards: Map<string, string> } {
  const owners = new Map<string, PlayerId>();
  const cards = new Map<string, string>();
  for (const player of state.players) {
    for (const zone of [player.board, player.graveyard, player.hand, player.deck] as const) {
      for (const card of zone ?? []) {
        owners.set(card.instanceId, player.id);
        cards.set(card.instanceId, card.cardId);
      }
    }
  }
  for (const event of state.eventLog) {
    if (event.type === "SUMMON" || event.type === "PLAY_CARD") {
      owners.set(event.instanceId, event.playerId);
      cards.set(event.instanceId, event.cardId);
    } else if (event.type === "CARD_MOVED" && event.toInstanceId && event.cardId) {
      if (event.ownerId) owners.set(event.toInstanceId, event.ownerId);
      cards.set(event.toInstanceId, event.cardId);
    }
  }
  return { owners, cards };
}

interface Exchange {
  attackerOwner: PlayerId | undefined;
  attackerId: string;
  defenderId?: string;
  attackerDied: boolean;
  defenderDied: boolean;
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const tenth = (value: number) => Math.round(value * 10) / 10;

/**
 * Relit le journal pour `playerId` : ses moments dans l'ordre, et ce que la
 * partie a fait à son Ancrage. Pur : même journal, même lecture.
 */
export function readTimeline(state: GameState, playerId: PlayerId): MatchTimeline {
  const { owners, cards } = identitiesOf(state);
  const me = state.players.find((player) => player.id === playerId);
  const opponent = state.players.find((player) => player.id !== playerId);
  const myStart = startingAnchorOf(me?.shipId);
  const theirStart = startingAnchorOf(opponent?.shipId);
  let myAnchor = myStart;
  let theirAnchor = theirStart;
  let lowestAnchor = myStart;
  let leader = 0;
  let leadChanges = 0;
  let idleTurns = 0;
  let timeouts = 0;
  let deraisons = 0;
  let activePlayer: PlayerId | undefined;
  let actedThisTurn = false;
  let timedOutThisTurn = false;
  let exchange: Exchange | null = null;
  /** Dernier joueur à avoir porté la main sur un exemplaire (dégâts, désignation), avec son tour. */
  const blame = new Map<string, { by: PlayerId; turn: number }>();
  /** Exemplaires sabordés, en attente de leur `DESTROY`. */
  const scuttled = new Set<string>();
  /** Répétitions de chaque coup dans le tour : `tour|id` → nombre déjà vu. */
  const seen = new Map<string, number>();
  const moments: AudienceMoment[] = [];

  /** L'enjeu : 1 tant que les deux Navires tiennent, jusqu'à 1,5 quand l'un touche le fond. */
  const stakes = () => {
    const lowestShare = Math.max(0, Math.min(myAnchor / myStart, theirAnchor / theirStart));
    return lowestShare >= 1 / 3 ? 1 : 1 + (1 / 3 - lowestShare) * 1.5;
  };

  function push(index: number, turn: number, id: string, label: string, weight: number, kind: MomentKind = "jeu") {
    let scaled = weight;
    if (kind === "jeu") {
      const key = `${turn}|${id}`;
      const repeats = seen.get(key) ?? 0;
      seen.set(key, repeats + 1);
      scaled = weight * HABITUATION ** repeats;
    }
    const rounded = tenth(scaled);
    if (rounded !== 0) moments.push({ index, id, label, weight: rounded, kind });
  }

  /** Fin d'un échange : une attaque où l'attaquant tombe sans rien abattre est une erreur. */
  function closeExchange(index: number, turn: number) {
    if (exchange?.defenderId && exchange.attackerDied && !exchange.defenderDied) {
      if (exchange.attackerOwner === playerId) push(index, turn, "moment.badTrade", "Une attaque mal engagée", -4);
      else push(index, turn, "moment.heldFirm", "La défense tient bon", 3);
    }
    exchange = null;
  }

  /** Qui a causé la destruction de `instanceId` ? `undefined` quand rien ne permet de le dire. */
  function culpritOf(instanceId: string, turn: number): PlayerId | undefined {
    if (scuttled.has(instanceId)) return owners.get(instanceId);
    if (exchange && instanceId === exchange.defenderId) return exchange.attackerOwner;
    if (exchange && instanceId === exchange.attackerId) return owners.get(exchange.defenderId ?? "");
    const touched = blame.get(instanceId);
    if (touched && touched.turn === turn) return touched.by;
    return activePlayer;
  }

  function trackLead(index: number, turn: number) {
    const gap = myAnchor / myStart - theirAnchor / theirStart;
    const now = gap > LEAD_GAP ? 1 : gap < -LEAD_GAP ? -1 : 0;
    if (now !== 0 && leader !== 0 && now !== leader) {
      leadChanges += 1;
      if (now === 1) push(index, turn, "moment.leadTaken", "Le vent tourne en votre faveur", 5 * stakes());
      else push(index, turn, "moment.leadLost", "L'adversaire remonte", -5 * stakes());
    }
    if (now !== 0) leader = now;
  }

  state.eventLog.forEach((event, index) => {
    const turn = event.turnNumber;
    switch (event.type) {
      case "TURN_STARTED":
        closeExchange(index, turn);
        activePlayer = event.playerId;
        break;
      case "PHASE_CHANGED":
        closeExchange(index, turn);
        break;
      case "ATTACK":
        closeExchange(index, turn);
        if (event.playerId === playerId) actedThisTurn = true;
        exchange = {
          attackerOwner: event.playerId,
          attackerId: event.attackerInstanceId,
          defenderId: event.defenderInstanceId,
          attackerDied: false,
          defenderDied: false,
        };
        break;
      case "ATTACK_INTERCEPTED": {
        const mine = owners.get(event.attackerInstanceId) === playerId;
        if (mine) push(index, turn, "moment.intercepted", "Une attaque interceptée", -1);
        else push(index, turn, "moment.interception", "Interception !", 2);
        break;
      }
      case "UNIT_TARGETED":
        blame.set(event.instanceId, { by: event.byPlayerId, turn });
        break;
      case "SABORDED":
        scuttled.add(event.instanceId);
        if (event.playerId === playerId) actedThisTurn = true;
        break;
      case "OBJECT_BROKEN":
        if (event.playerId === playerId) actedThisTurn = true;
        break;
      case "DESTROY": {
        const owner = owners.get(event.instanceId);
        const inExchange = Boolean(exchange && (event.instanceId === exchange.attackerId || event.instanceId === exchange.defenderId));
        const culprit = culpritOf(event.instanceId, turn);
        if (exchange && inExchange) {
          if (event.instanceId === exchange.attackerId) exchange.attackerDied = true;
          else exchange.defenderDied = true;
        }
        scuttled.delete(event.instanceId);
        const cardId = cards.get(event.instanceId);
        if (!owner || !culprit || !isNotable(cardId)) break;
        const tier = tierOf(cardId);
        if (owner === playerId) {
          // Mon propre fait (Sabordage, sacrifice) : un choix, pas une perte subie.
          if (culprit === playerId) break;
          // Perdue au bout d'une attaque mal engagée : l'échange le dira en entier.
          const ownBadAttack = exchange && inExchange && exchange.attackerOwner === playerId && event.instanceId === exchange.attackerId;
          if (!ownBadAttack) push(index, turn, "moment.unitLost", "Une unité perdue", -(0.5 + tier) * stakes());
        } else if (culprit === playerId) {
          if (inExchange) {
            const label = exchange!.attackerOwner === playerId ? "Une unité adverse abattue" : "Une riposte mortelle";
            push(index, turn, "moment.kill", label, (1.5 + tier) * stakes());
          } else {
            push(index, turn, "moment.spellKill", "Un sort qui balaie le plateau", (2 + tier) * stakes());
          }
        }
        // Une unité adverse tombée par le fait de son propre contrôleur : rien pour la salle.
        break;
      }
      case "DAMAGE": {
        if (event.targetInstanceId) {
          const by =
            event.sourcePlayerId ??
            event.origin?.playerId ??
            (event.combat && exchange
              ? event.combat === "strike"
                ? exchange.attackerOwner
                : owners.get(exchange.defenderId ?? "")
              : activePlayer);
          if (by) blame.set(event.targetInstanceId, { by, turn });
          break;
        }
        if (!event.targetPlayerId) break;
        if (event.targetPlayerId === playerId) {
          if (event.targetAnchorAfter !== undefined) myAnchor = event.targetAnchorAfter;
          lowestAnchor = Math.min(lowestAnchor, myAnchor);
          const share = event.amount / myStart;
          const heavy = share >= 0.2;
          push(
            index,
            turn,
            heavy ? "moment.heavyTaken" : "moment.hitTaken",
            heavy ? "Le Navire encaisse de plein fouet" : "Le Navire est touché",
            -clamp(8 * share, 0.5, 4) * stakes()
          );
        } else {
          if (event.targetAnchorAfter !== undefined) theirAnchor = event.targetAnchorAfter;
          const share = event.amount / theirStart;
          const heavy = share >= 0.2;
          push(
            index,
            turn,
            heavy ? "moment.heavyHit" : "moment.hit",
            heavy ? "Une bordée au Navire adverse" : "Le Navire adverse est touché",
            clamp(12 * share, 0.5, 5) * stakes()
          );
        }
        trackLead(index, turn);
        break;
      }
      case "HEAL":
        if (event.targetPlayerId === playerId) {
          myAnchor += event.amount;
          if (event.amount / myStart >= 0.15) push(index, turn, "moment.repair", "Le Navire se relève", 1);
          trackLead(index, turn);
        } else if (event.targetPlayerId) {
          theirAnchor += event.amount;
          trackLead(index, turn);
        }
        break;
      case "PLAY_CARD":
      case "SHIP_ABILITY_ACTIVATED":
        if (event.playerId === playerId) actedThisTurn = true;
        break;
      case "SHIP_ABILITY_FIRED":
        if (event.playerId === playerId) {
          actedThisTurn = true;
          push(index, turn, "moment.ship", "Le Navire donne de la voix", 2);
        }
        break;
      case "REACTION_ACTIVATED":
        if (event.playerId === playerId) push(index, turn, "moment.reaction", "Une réaction au bon moment", 2);
        break;
      case "END_TURN":
        closeExchange(index, turn);
        if (event.playerId === playerId) {
          // Un délai laissé filer est déjà compté comme tel : pas une seconde fois comme tour passé.
          if (!actedThisTurn && !timedOutThisTurn) {
            idleTurns += 1;
            push(index, turn, "moment.idle", "Un tour sans rien tenter", -3, "conduite");
          }
          actedThisTurn = false;
          timedOutThisTurn = false;
        }
        break;
      case "TURN_TIMED_OUT":
        if (event.playerId === playerId) {
          timeouts += 1;
          timedOutThisTurn = true;
          push(index, turn, "moment.timeout", "Une hésitation qui lasse", -6, "conduite");
        }
        break;
      case "DERAISON_SETTLED":
        // Compté, pas jugé : la Déraison est une mécanique, et ses dégâts d'Ancrage sont déjà des moments.
        if (event.playerId === playerId) deraisons += 1;
        break;
      default:
        break;
    }
  });
  closeExchange(state.eventLog.length, state.turnNumber);

  return {
    moments,
    startingAnchor: myStart,
    opponentStartingAnchor: theirStart,
    lowestAnchor: Math.min(lowestAnchor, me?.anchor ?? lowestAnchor),
    leadChanges,
    idleTurns,
    timeouts,
    deraisons,
  };
}

/** Les moments de `playerId`, dans l'ordre du journal. */
export function readMoments(state: GameState, playerId: PlayerId): AudienceMoment[] {
  return readTimeline(state, playerId).moments;
}

/**
 * Le bilan BRUT des moments de `playerId` (somme de leurs poids). Il
 * n'est plus compté en spectateurs : le compteur en partie passe par la
 * formule de fin (`projectedAudience`), dont le spectacle intègre ce
 * bilan, borné.
 */
export function momentBalance(state: GameState, playerId: PlayerId): number {
  return readMoments(state, playerId).reduce((sum, moment) => sum + moment.weight, 0);
}
