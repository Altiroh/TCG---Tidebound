import type { GameEvent } from "@/game/events/types";
import { findCardInstance, type GameState } from "@/game/state/types";
import type { TriggerEvent } from "@/game/triggers/types";

/**
 * FAITS DE JOUEUR et dégâts infligés (Lot 17) : ce que les événements d'une
 * action réveillent. Une seule lecture, partagée par la résolution
 * automatique (`processPlayerFacts`, `triggerBus.ts`) et par la fenêtre de
 * réaction (`deriveReactionTriggerEvents`) : les deux voient les mêmes faits.
 */
export function playerFactTriggerEvents(state: GameState, events: readonly GameEvent[]): TriggerEvent[] {
  const derived: TriggerEvent[] = [];
  for (const event of events) {
    switch (event.type) {
      case "ARMOR_CHANGED":
        if (event.delta > 0) derived.push({ trigger: "onArmorGained", playerId: event.playerId });
        break;
      case "DIE_RESOLVED":
        derived.push({ trigger: "onDieResolved", playerId: event.playerId, dieOutcome: event.outcome, sourceInstanceId: event.sourceInstanceId, cardId: event.cardId });
        break;
      case "DRAW_CARD":
        if (!event.turnDraw && !event.viaLook) derived.push({ trigger: "onExtraCardDrawn", playerId: event.playerId });
        break;
      case "CARD_MOVED":
        if (event.toZone === "deck" && event.deckPosition === "bottom" && event.ownerId) {
          derived.push({ trigger: "onCardPutUnderDeck", playerId: event.ownerId, cardId: event.cardId });
        }
        if (event.fromZone === "graveyard" && event.toZone !== "graveyard" && event.ownerId) {
          derived.push({ trigger: "onCardLeftGraveyard", playerId: event.ownerId, cardId: event.cardId });
        }
        if (event.toZone === "lande" && event.ownerId) derived.push({ trigger: "onLandePlaced", playerId: event.ownerId, cardId: event.cardId });
        break;
      case "ABILITY_RESOLVED":
        derived.push({ trigger: "onAbilityResolved", playerId: event.playerId, cardId: event.cardId, sourceInstanceId: event.instanceId });
        break;
      case "DAMAGE": {
        if (!event.dealerInstanceId || event.amount <= 0) break;
        const dealer = findCardInstance(state, event.dealerInstanceId);
        if (!dealer || dealer.zone !== "board") break;
        derived.push({
          trigger: "onDealtDamage",
          playerId: dealer.owner.id,
          cardId: dealer.card.cardId,
          sourceInstanceId: event.dealerInstanceId,
          damageAmount: event.amount,
        });
        break;
      }
      default:
        break;
    }
  }
  return derived;
}
