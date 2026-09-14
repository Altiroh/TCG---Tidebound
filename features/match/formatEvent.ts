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

/** Carte d'une instance, où qu'elle soit (plateau, cimetière, main, deck) — `undefined` si introuvable. */
export function findInstanceCardId(state: GameState, instanceId: string): string | undefined {
  for (const player of state.players) {
    const instance = [...player.board, ...player.graveyard, ...player.hand, ...player.deck].find(
      (card) => card.instanceId === instanceId
    );
    if (instance) return instance.cardId;
  }
  return undefined;
}

/** Nom de la carte d'une instance — "Une carte" si introuvable. */
function instanceName(state: GameState, instanceId: string): string {
  const cardId = findInstanceCardId(state, instanceId);
  return cardId ? cardName(state, cardId) : "Une carte";
}

/** Variation signée de stats en toutes lettres, ex: "+1 Résistance", "-2 Puissance et -1 Résistance". */
export function formatStatDelta(attack: number, health: number): string {
  const signed = (value: number) => `${value > 0 ? "+" : ""}${value}`;
  const parts: string[] = [];
  if (attack !== 0) parts.push(`${signed(attack)} Puissance`);
  if (health !== 0) parts.push(`${signed(health)} Résistance`);
  return parts.join(" et ");
}

/** Traduit un `GameEvent` en une ligne lisible pour le journal de partie. `playerLabel` nomme les joueurs (défaut : "Joueur 1"/"Joueur 2" des parties locales ; en ligne, les ids sont des comptes). */
export function formatEvent(state: GameState, event: GameEvent, playerLabel: (playerId?: string) => string = playerName): string {
  switch (event.type) {
    case "GAME_STARTED":
      return "La partie commence.";
    case "TURN_STARTED":
      return `Tour ${event.turnNumber} — ${playerLabel(event.playerId)}.`;
    case "DRAW_CARD":
      return `${playerLabel(event.playerId)} pioche une carte.`;
    case "PLAY_CARD":
      return `${playerLabel(event.playerId)} joue ${cardName(state, event.cardId)}.`;
    case "SUMMON":
      return `${cardName(state, event.cardId)} entre en jeu (${playerLabel(event.playerId)}).`;
    case "ATTACK":
      return `${playerLabel(event.playerId)} attaque${event.defenderInstanceId ? " une cible" : " le Navire adverse"}.`;
    case "DAMAGE":
      return `${event.amount} dégât(s)${event.targetPlayerId ? ` à ${playerLabel(event.targetPlayerId)}` : ""}.`;
    case "HEAL":
      return `+${event.amount} récupéré${event.targetPlayerId ? ` par ${playerLabel(event.targetPlayerId)}` : ""}.`;
    case "BUFF_APPLIED":
    case "DEBUFF_APPLIED": {
      const delta = formatStatDelta(event.attack, event.health);
      return delta ? `${instanceName(state, event.targetInstanceId)} : ${delta}.` : `${instanceName(state, event.targetInstanceId)} est modifiée.`;
    }
    case "HAND_CARD_REVEALED":
      return `${playerLabel(event.ownerId)} révèle ${cardName(state, event.cardId)}.`;
    case "RESOURCE_CHANGED":
      return `${playerLabel(event.playerId)} : ${event.delta >= 0 ? "+" : ""}${event.delta} Raison.`;
    case "DESTROY":
      return "Un permanent est détruit.";
    case "CARD_MOVED":
      if (event.fromZone === "board" && event.toZone === "graveyard") return "Un permanent quitte le plateau.";
      if (event.fromZone === "hand" && event.toZone === "graveyard") return `${instanceName(state, event.instanceId)} part de la main au cimetière.`;
      return "Une carte change de zone.";
    case "SABORDED":
      return `${playerLabel(event.playerId)} saborde un permanent.`;
    case "OBJECT_BROKEN":
      return `${playerLabel(event.playerId)} brise ${cardName(state, event.cardId)}${event.fromHand ? " depuis sa main" : ""}.`;
    case "DERAISON_SETTLED":
      return `${playerLabel(event.playerId)} règle sa Déraison (-${event.debt}) : ${event.anchorDamage} dégât(s) d'Ancrage.`;
    case "REASON_CHANGED":
      return `${playerLabel(event.playerId)} : ${event.delta >= 0 ? "+" : ""}${event.delta} Raison.`;
    case "TIDE_ADVANCED":
      return event.stateChanged
        ? `La Marée entre en ${TIDE_STATE_LABELS[event.tideState]} (${event.tideOrientation}).`
        : `Marée : ${TIDE_STATE_LABELS[event.tideState]} (${event.remainingTurns} tour(s) restant(s)).`;
    case "TIDE_ORIENTATION_CHANGED":
      return `La Marée s'inverse : ${event.orientation}.`;
    case "OCEAN_JUDGMENT":
      return `Jugement de l'Océan déclenché par ${playerLabel(event.triggeredByPlayerId)}.`;
    case "GAME_ENDED":
      if (!event.winnerId) return "Partie terminée — match nul.";
      // L'abandon se lit du côté de celui qui l'a décidé : "l'autre a gagné"
      // ne dirait pas POURQUOI la partie s'arrête d'un coup.
      if (event.reason === "concede") {
        const loser = state.players.find((p) => p.id !== event.winnerId);
        return `${loser ? playerLabel(loser.id) : "Un joueur"} abandonne le navire — victoire de ${playerLabel(event.winnerId)}.`;
      }
      return `Partie terminée — victoire de ${playerLabel(event.winnerId)}.`;
    case "END_TURN":
      return `${playerLabel(event.playerId)} termine son tour.`;
    case "PHASE_CHANGED":
      return `${playerLabel(event.playerId)} passe en Phase de combat.`;
    case "STATUS_CHANGED":
      return event.applied ? "Une carte devient MALADE." : "Une carte n'est plus MALADE.";
    case "REACTION_WINDOW_OPENED":
      return `${playerLabel(event.playerId)} peut réagir.`;
    case "REACTION_ACTIVATED":
      return `${playerLabel(event.playerId)} active une réaction.`;
    case "REACTION_PASSED":
      return `${playerLabel(event.playerId)} passe.`;
    default:
      // Tous les types sont traités ci-dessus : filet de sécurité pour un futur type pas encore traduit.
      return (event as GameEvent).type;
  }
}
