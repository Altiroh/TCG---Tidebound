import { getCardDefinition } from "@/game/cards/sets/core";
import type { CardType } from "@/game/cards/types";
import type { GameState, PlayerId } from "@/game/state/types";
import type { MatchQuestProgress, QuestObjectiveKey } from "@/game/quests/types";

/** Ancrage restant minimal pour l'objectif « Remporter une partie PvP avec au moins 5 Ancrage restant ». */
export const HIGH_ANCHOR_WIN_THRESHOLD = 5;

export interface MatchQuestProgressInput {
  /** État FINAL, complet (jamais une vue projetée), tel que persisté par le serveur. */
  state: GameState;
  playerId: PlayerId;
  /** `true` pour une partie contre bot : les objectifs PvP n'y avancent jamais. */
  vsBot: boolean;
  won: boolean;
}

/**
 * Contribution d'une partie terminée aux objectifs de quête d'UN joueur.
 *
 * Tout est dérivé du journal d'événements et de l'état final : le client
 * n'envoie jamais de compteur. Le filtrage par `bot_progress_allowed` n'est
 * PAS fait ici mais à l'écriture (`record_match_quest_progress`), qui
 * connaît chaque quête ; ce calcul se contente de ne rien produire pour les
 * objectifs PvP d'une partie contre bot, par cohérence.
 */
export function computeMatchQuestProgress({ state, playerId, vsBot, won }: MatchQuestProgressInput): MatchQuestProgress {
  const progress: Record<QuestObjectiveKey, number> = {
    play_matches: 1,
    play_creatures: 0,
    play_marins: 0,
    play_structures: 0,
    break_objects: 0,
    scuttle_structures: 0,
    reach_abysses: 0,
    win_pvp_matches: 0,
    pvp_ship_damage: 0,
    pvp_win_high_anchor: 0,
  };

  const cardTypeByInstance = new Map<string, CardType>();
  const ownerByInstance = new Map<string, PlayerId>();
  const expiredInstances = new Set<string>();
  const safeType = (cardId: string): CardType | undefined => {
    try {
      return getCardDefinition(cardId).type;
    } catch {
      return undefined;
    }
  };

  for (const player of state.players) {
    for (const card of [...player.deck, ...player.hand, ...player.board, ...player.graveyard]) {
      const type = safeType(card.cardId);
      if (type) cardTypeByInstance.set(card.instanceId, type);
      ownerByInstance.set(card.instanceId, player.id);
      if (card.graveyardCause === "expired") expiredInstances.add(card.instanceId);
    }
  }

  const opponentId = state.players.find((p) => p.id !== playerId)?.id;
  // Une attaque directe émet ATTACK (sans défenseur) puis le DAMAGE infligé
  // au Navire adverse : on attend ce DAMAGE-là, et lui seul.
  let awaitingDirectDamage = false;

  for (const event of state.eventLog) {
    switch (event.type) {
      case "PLAY_CARD": {
        if (event.playerId !== playerId) break;
        const type = safeType(event.cardId);
        if (type === "creature") progress.play_creatures += 1;
        else if (type === "marin") progress.play_marins += 1;
        else if (type === "structure") progress.play_structures += 1;
        break;
      }
      case "CARD_MOVED":
        // Seuls le bris d'Objet et l'expiration déplacent une carte du plateau au cimetière par ce biais
        // (une destruction émet DESTROY) : on écarte l'expiration.
        if (
          event.fromZone === "board" &&
          event.toZone === "graveyard" &&
          ownerByInstance.get(event.instanceId) === playerId &&
          cardTypeByInstance.get(event.instanceId) === "objet" &&
          !expiredInstances.has(event.instanceId)
        ) {
          progress.break_objects += 1;
        }
        break;
      case "SABORDED":
        if (event.playerId === playerId && cardTypeByInstance.get(event.instanceId) === "structure") {
          progress.scuttle_structures += 1;
        }
        break;
      case "TIDE_ADVANCED":
        if (event.stateChanged && event.tideState === "abysses") progress.reach_abysses += 1;
        break;
      case "ATTACK":
        awaitingDirectDamage = event.playerId === playerId && !event.defenderInstanceId;
        break;
      case "DAMAGE":
        if (awaitingDirectDamage && event.targetPlayerId === opponentId) {
          progress.pvp_ship_damage += event.amount;
          awaitingDirectDamage = false;
        }
        break;
      case "END_TURN":
      case "PHASE_CHANGED":
        awaitingDirectDamage = false;
        break;
      default:
        break;
    }
  }

  if (vsBot) {
    progress.pvp_ship_damage = 0;
  } else if (won) {
    progress.win_pvp_matches = 1;
    const anchor = state.players.find((p) => p.id === playerId)?.anchor ?? 0;
    if (anchor >= HIGH_ANCHOR_WIN_THRESHOLD) progress.pvp_win_high_anchor = 1;
  }

  // Seules les contributions non nulles sont transmises à la base.
  return Object.fromEntries(Object.entries(progress).filter(([, value]) => value > 0)) as MatchQuestProgress;
}
