import { getCardDefinition, type GameEvent, type GameState } from "@/game";
import { TIDE_STATE_LABELS } from "@/features/match/cardDisplay";

function cardName(state: GameState, cardId?: string): string {
  if (!cardId) return "?";
  try {
    return getCardDefinition(cardId).name;
  } catch {
    return cardId;
  }
}

function playerName(playerId?: string): string {
  return playerId === "p1" ? "Joueur 1" : playerId === "p2" ? "Joueur 2" : "?";
}

/** Nom de la carte d'une instance, où qu'elle soit (plateau, cimetière, main, deck) — "Une carte" si introuvable. */
function instanceName(state: GameState, instanceId: string): string {
  for (const player of state.players) {
    const instance = [...player.board, ...player.graveyard, ...player.hand, ...player.deck].find(
      (card) => card.instanceId === instanceId
    );
    if (instance) return cardName(state, instance.cardId);
  }
  return "Une carte";
}

/** Variation signée de stats en toutes lettres, ex: "+1 Résistance", "-2 Puissance et -1 Résistance". */
export function formatStatDelta(attack: number, health: number): string {
  const signed = (value: number) => `${value > 0 ? "+" : ""}${value}`;
  const parts: string[] = [];
  if (attack !== 0) parts.push(`${signed(attack)} Puissance`);
  if (health !== 0) parts.push(`${signed(health)} Résistance`);
  return parts.join(" et ");
}

/** Traduit un `GameEvent` en une ligne lisible pour le journal de partie. */
export function formatEvent(state: GameState, event: GameEvent): string {
  switch (event.type) {
    case "GAME_STARTED":
      return "La partie commence.";
    case "TURN_STARTED":
      return `Tour ${event.turnNumber} — ${playerName(event.playerId)}.`;
    case "DRAW_CARD":
      return `${playerName(event.playerId)} pioche une carte.`;
    case "PLAY_CARD":
      return `${playerName(event.playerId)} joue ${cardName(state, event.cardId)}.`;
    case "SUMMON":
      return `${cardName(state, event.cardId)} entre en jeu (${playerName(event.playerId)}).`;
    case "ATTACK":
      return `${playerName(event.playerId)} attaque${event.defenderInstanceId ? " une cible" : " le Navire adverse"}.`;
    case "DAMAGE":
      return `${event.amount} dégât(s)${event.targetPlayerId ? ` à ${playerName(event.targetPlayerId)}` : ""}.`;
    case "HEAL":
      return `+${event.amount} récupéré${event.targetPlayerId ? ` par ${playerName(event.targetPlayerId)}` : ""}.`;
    case "BUFF_APPLIED":
    case "DEBUFF_APPLIED": {
      const delta = formatStatDelta(event.attack, event.health);
      return delta ? `${instanceName(state, event.targetInstanceId)} : ${delta}.` : `${instanceName(state, event.targetInstanceId)} est modifiée.`;
    }
    case "HAND_CARD_REVEALED":
      return `${playerName(event.ownerId)} révèle ${cardName(state, event.cardId)}.`;
    case "RESOURCE_CHANGED":
      return `${playerName(event.playerId)} : ${event.delta >= 0 ? "+" : ""}${event.delta} Raison.`;
    case "DESTROY":
      return "Un permanent est détruit.";
    case "CARD_MOVED":
      if (event.fromZone === "board" && event.toZone === "graveyard") return "Un permanent quitte le plateau.";
      if (event.fromZone === "hand" && event.toZone === "graveyard") return "Une carte est défaussée.";
      return "Une carte change de zone.";
    case "SABORDED":
      return `${playerName(event.playerId)} saborde un permanent.`;
    case "DERAISON_SETTLED":
      return `${playerName(event.playerId)} règle sa Déraison (-${event.debt}) : ${event.anchorDamage} dégât(s) d'Ancrage.`;
    case "REASON_CHANGED":
      return `${playerName(event.playerId)} : ${event.delta >= 0 ? "+" : ""}${event.delta} Raison.`;
    case "TIDE_ADVANCED":
      return event.stateChanged
        ? `La Marée entre en ${TIDE_STATE_LABELS[event.tideState]} (${event.tideOrientation}).`
        : `Marée : ${TIDE_STATE_LABELS[event.tideState]} (${event.remainingTurns} tour(s) restant(s)).`;
    case "TIDE_ORIENTATION_CHANGED":
      return `La Marée s'inverse : ${event.orientation}.`;
    case "OCEAN_JUDGMENT":
      return `Jugement de l'Océan déclenché par ${playerName(event.triggeredByPlayerId)}.`;
    case "GAME_ENDED":
      return event.winnerId ? `Partie terminée — victoire de ${playerName(event.winnerId)}.` : "Partie terminée — match nul.";
    case "END_TURN":
      return `${playerName(event.playerId)} termine son tour.`;
    case "PHASE_CHANGED":
      return `${playerName(event.playerId)} passe en Phase de combat.`;
    case "STATUS_CHANGED":
      return event.applied ? "Une carte devient MALADE." : "Une carte n'est plus MALADE.";
    case "REACTION_WINDOW_OPENED":
      return `${playerName(event.playerId)} peut réagir.`;
    case "REACTION_ACTIVATED":
      return `${playerName(event.playerId)} active une réaction.`;
    case "REACTION_PASSED":
      return `${playerName(event.playerId)} passe.`;
    default:
      // Tous les types sont traités ci-dessus : filet de sécurité pour un futur type pas encore traduit.
      return (event as GameEvent).type;
  }
}
