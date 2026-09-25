import { getShipDefinition } from "@/game/environment/shipData";
import type { GameState, PlayerId } from "@/game/state/types";

/**
 * LES MOMENTS — le public réagit COUP PAR COUP, pendant la partie.
 *
 * Là où les analyseurs (`analyzers.ts`) jugent la partie dans son ensemble
 * (rythme, tension finale, maîtrise), les moments suivent le journal au fil
 * des coups et font monter ou baisser la salle : une unité adverse abattue,
 * un sort qui balaie, une frappe lourde au Navire, une interception la font
 * monter ; une attaque mal engagée, une unité perdue, une remontée de
 * l'adversaire, un tour passé à ne rien tenter la font baisser.
 *
 * Le compteur de spectateurs EN PARTIE défile avec eux, comme un cours de
 * bourse (`liveAudience`) ; leur bilan, borné, entre aussi dans le
 * spectacle de fin (`facts.momentsTotal`, analyseur `moments`).
 *
 * Poids PROVISOIRES, en points de spectacle — à valider puis reporter dans Notion.
 */
export interface AudienceMoment {
  /** Position de l'événement dans le journal. */
  index: number;
  id: string;
  /** Ce qu'un commentateur dirait. */
  label: string;
  /** Points de spectacle, positifs ou négatifs. */
  weight: number;
}

/** Une frappe au Navire qui compte : à partir de ce montant, le public réagit fort. */
const HEAVY_HIT = 5;

function startingAnchorOf(shipId: string | undefined): number {
  try {
    return shipId ? getShipDefinition(shipId).startingAnchor : 20;
  } catch {
    return 20;
  }
}

/** Propriétaire de chaque exemplaire connu : zones de l'état, puis invocations du journal (jetons disparus). */
function ownersOf(state: GameState): Map<string, PlayerId> {
  const owners = new Map<string, PlayerId>();
  for (const player of state.players) {
    for (const zone of [player.board, player.graveyard, player.hand, player.deck] as const) {
      for (const card of zone ?? []) owners.set(card.instanceId, player.id);
    }
  }
  for (const event of state.eventLog) {
    if (event.type === "SUMMON" || event.type === "PLAY_CARD") owners.set(event.instanceId, event.playerId);
  }
  return owners;
}

interface Exchange {
  attackerOwner: PlayerId | undefined;
  attackerId: string;
  defenderId?: string;
  attackerDied: boolean;
  defenderDied: boolean;
}

/**
 * Relit le journal pour `playerId` et rend ses moments, dans l'ordre.
 * Pur : même journal, mêmes moments.
 */
export function readMoments(state: GameState, playerId: PlayerId): AudienceMoment[] {
  const owners = ownersOf(state);
  const me = state.players.find((player) => player.id === playerId);
  const opponent = state.players.find((player) => player.id !== playerId);
  const myStart = startingAnchorOf(me?.shipId);
  const theirStart = startingAnchorOf(opponent?.shipId);
  let myAnchor = myStart;
  let theirAnchor = theirStart;
  let leader = 0;
  let actedThisTurn = false;
  let exchange: Exchange | null = null;
  const moments: AudienceMoment[] = [];
  const push = (index: number, id: string, label: string, weight: number) => moments.push({ index, id, label, weight });

  /** Fin d'un échange : une attaque où l'attaquant tombe sans rien abattre est une erreur. */
  function closeExchange(index: number) {
    if (exchange?.defenderId && exchange.attackerDied && !exchange.defenderDied) {
      if (exchange.attackerOwner === playerId) push(index, "moment.badTrade", "Une attaque mal engagée", -4);
      else push(index, "moment.heldFirm", "La défense tient bon", 3);
    }
    exchange = null;
  }

  state.eventLog.forEach((event, index) => {
    switch (event.type) {
      case "ATTACK":
        closeExchange(index);
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
        if (mine) push(index, "moment.intercepted", "Une attaque interceptée", -1);
        else push(index, "moment.interception", "Interception !", 2);
        break;
      }
      case "DESTROY": {
        const owner = owners.get(event.instanceId);
        if (!owner) break;
        const inExchange = exchange && (event.instanceId === exchange.attackerId || event.instanceId === exchange.defenderId);
        if (exchange && inExchange) {
          if (event.instanceId === exchange.attackerId) exchange.attackerDied = true;
          else exchange.defenderDied = true;
        }
        if (owner === playerId) {
          // Perdue au bout d'une attaque mal engagée : l'échange le dira en entier.
          const ownBadAttack = exchange && inExchange && exchange.attackerOwner === playerId && event.instanceId === exchange.attackerId;
          if (!ownBadAttack) push(index, "moment.unitLost", "Une unité perdue", -2);
        } else if (inExchange) {
          push(index, "moment.kill", exchange!.attackerOwner === playerId ? "Une unité adverse abattue" : "Une riposte mortelle", 3);
        } else {
          push(index, "moment.spellKill", "Un sort qui balaie le plateau", 4);
        }
        break;
      }
      case "DAMAGE": {
        if (!event.targetPlayerId) break;
        const heavy = event.amount >= HEAVY_HIT;
        if (event.targetPlayerId === playerId) {
          if (event.targetAnchorAfter !== undefined) myAnchor = event.targetAnchorAfter;
          push(index, heavy ? "moment.heavyTaken" : "moment.hitTaken", heavy ? "Le Navire encaisse de plein fouet" : "Le Navire est touché", heavy ? -3 : -1);
        } else {
          if (event.targetAnchorAfter !== undefined) theirAnchor = event.targetAnchorAfter;
          push(index, heavy ? "moment.heavyHit" : "moment.hit", heavy ? "Une bordée au Navire adverse" : "Le Navire adverse est touché", heavy ? 4 : 1);
        }
        // Qui mène, en part de son Ancrage de départ ? Un écart de moins de 10 % n'est pas une avance.
        const gap = myAnchor / myStart - theirAnchor / theirStart;
        const now = gap > 0.1 ? 1 : gap < -0.1 ? -1 : 0;
        if (now !== 0 && leader !== 0 && now !== leader) {
          if (now === 1) push(index, "moment.leadTaken", "Le vent tourne en votre faveur", 5);
          else push(index, "moment.leadLost", "L'adversaire remonte", -5);
        }
        if (now !== 0) leader = now;
        break;
      }
      case "HEAL":
        if (event.targetPlayerId === playerId && event.amount >= 3) push(index, "moment.repair", "Le Navire se relève", 1);
        break;
      case "PLAY_CARD":
      case "SHIP_ABILITY_ACTIVATED":
        if (event.playerId === playerId) actedThisTurn = true;
        break;
      case "SHIP_ABILITY_FIRED":
        if (event.playerId === playerId) {
          actedThisTurn = true;
          push(index, "moment.ship", "Le Navire donne de la voix", 2);
        }
        break;
      case "REACTION_ACTIVATED":
        if (event.playerId === playerId) push(index, "moment.reaction", "Une réaction au bon moment", 2);
        break;
      case "END_TURN":
        closeExchange(index);
        if (event.playerId !== playerId) break;
        if (!actedThisTurn) push(index, "moment.idle", "Un tour sans rien tenter", -3);
        actedThisTurn = false;
        break;
      case "PHASE_CHANGED":
      case "TURN_STARTED":
        closeExchange(index);
        break;
      case "TURN_TIMED_OUT":
        if (event.playerId === playerId) push(index, "moment.timeout", "Une hésitation qui lasse", -6);
        break;
      case "DERAISON_SETTLED":
        if (event.playerId === playerId) push(index, "moment.deraison", "La Raison déborde", -2);
        break;
      default:
        break;
    }
  });
  closeExchange(state.eventLog.length);
  return moments;
}

/** Spectateurs gagnés ou perdus par point de moment, en direct. */
export const LIVE_SPECTATORS_PER_POINT = 5;

/**
 * Le compteur EN PARTIE : l'audience du joueur, qui défile au fil des
 * moments — elle part de ce qu'elle était et bouge à chaque coup.
 */
export function liveAudience(base: number, state: GameState, playerId: PlayerId): number {
  const total = readMoments(state, playerId).reduce((sum, moment) => sum + moment.weight, 0);
  return Math.max(0, Math.round(base + total * LIVE_SPECTATORS_PER_POINT));
}
