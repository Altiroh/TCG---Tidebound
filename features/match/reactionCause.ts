import { findCardInstance, getCardDefinition, HIDDEN_CARD_ID, type GameState, type TriggerEvent } from "@/game";
import { TIDE_STATE_LABELS } from "@/features/match/cardDisplay";

/**
 * CE À QUOI L'ON RÉAGIT, en une phrase (retour joueur du 27/10/2026 : « la
 * fenêtre de réaction ne dit pas à quelle action on répond »).
 *
 * Lit l'événement qui a rendu la capacité éligible
 * (`PendingReactionCandidate.cause`) et le situe dans l'état : quelle carte,
 * à qui. `null` quand l'événement ne se raconte pas (option d'une carte,
 * condition abstraite) — la fenêtre n'affiche alors rien de plus.
 */
export function describeReactionCause(state: GameState, event: TriggerEvent | undefined, viewerId: string): string | null {
  if (!event) return null;

  const located = event.sourceInstanceId ? findCardInstance(state, event.sourceInstanceId) : undefined;
  const chained = event.sourceInstanceId ? state.chainStack?.find((link) => link.card.instanceId === event.sourceInstanceId) : undefined;
  const cardId = event.cardId ?? located?.card.cardId ?? chained?.card.cardId;
  const card = cardId && cardId !== HIDDEN_CARD_ID ? safeName(cardId) : null;
  const carte = card ?? "une carte";
  const ownerId = event.playerId ?? located?.owner.id ?? chained?.playerId;
  const mine = ownerId === viewerId;
  const qui = ownerId ? (mine ? "Vous" : "L'adversaire") : null;
  const sienne = ownerId ? (mine ? " (à vous)" : " (adverse)") : "";

  switch (event.trigger) {
    case "onPlay":
    case "onCardPlayed":
    case "onObjectPlayed":
      return qui ? `${qui} ${mine ? "jouez" : "joue"} ${carte}` : `${carte} est jouée`;
    case "onEnterPlay":
      return `${carte}${sienne} arrive en jeu`;
    case "onDeath":
      return `${carte}${sienne} est détruite`;
    case "onSaborde":
      return `${carte}${sienne} est sabordée`;
    case "onPermanentWouldBeDestroyed":
      return `${carte}${sienne} va être détruite`;
    case "onAttack":
    case "onOwnAttackDeclared":
    case "onUnitAttackDeclared":
    case "onIncomingDirectAttack":
    case "onCombatVsGarde":
      return describeAttack(state, viewerId) ?? `${carte}${sienne} attaque`;
    case "onDamaged":
    case "onSurvivedDamage":
      return `${carte}${sienne} subit des dégâts`;
    case "onDealtDamage":
      return `${carte}${sienne} inflige des dégâts`;
    case "startOfTurn":
      return "Début du tour";
    case "endOfTurn":
      return "Fin du tour";
    case "onTideAnnounced":
      return event.tideState ? `La Marée s'annonce : ${TIDE_STATE_LABELS[event.tideState]}` : "La Marée s'annonce";
    case "onTideStateEntered":
      return event.tideState ? `La Marée passe en ${TIDE_STATE_LABELS[event.tideState]}` : "La Marée change";
    case "onTideStateExited":
      return "La Marée change";
    case "onBecomeVisible":
      return `${carte}${sienne} devient visible`;
    case "onExpire":
      return `${carte}${sienne} arrive au bout de sa Durée`;
    case "onObjectBroken":
      return `${carte}${sienne} est Brisé`;
    case "onPowerGained":
      return `${carte}${sienne} gagne de la Puissance`;
    case "onReturnedToHand":
      return `${carte}${sienne} revient en main`;
    case "onDiscarded":
    case "onCardDiscardedFromHand":
      return `${carte}${sienne} est défaussée`;
    case "onCardPutIntoGraveyard":
      return `${carte}${sienne} rejoint le Cimetière`;
    case "onCardRecoveredFromGraveyard":
    case "onCardLeftGraveyard":
      return `${carte}${sienne} quitte le Cimetière`;
    case "onBecomeOnlyCreature":
      return `${carte}${sienne} se retrouve seule Créature`;
    case "onChromaticColorChosen":
      return `${carte}${sienne} reçoit sa couleur`;
    case "onEveil":
      return `Éveil de ${carte}${sienne}`;
    case "onUnitTargeted":
      return `${carte}${sienne} est ciblée par un effet adverse`;
    case "onLandeStrike":
      return "La Lande va frapper";
    case "onLandePlaced":
      return qui ? `${qui} ${mine ? "posez" : "pose"} une Lande` : "Une Lande est posée";
    case "onReasonGained":
      return qui ? `${qui} ${mine ? "récupérez" : "récupère"} de la Raison` : "De la Raison est récupérée";
    case "onShipHealed":
      return qui ? `${mine ? "Votre" : "Le"} Navire${mine ? "" : " adverse"} récupère de l'Ancrage` : "Un Navire récupère de l'Ancrage";
    case "onArmorGained":
      return qui ? `${mine ? "Votre" : "Le"} Navire${mine ? "" : " adverse"} gagne de l'Armure` : "Un Navire gagne de l'Armure";
    case "onDieResolved":
      return event.dieOutcome ? `Jet de dé : ${DIE_LABELS[event.dieOutcome]}` : "Un jet de dé se résout";
    case "onCardPutUnderDeck":
      return "Une carte passe sous la pioche";
    case "onExtraCardDrawn":
      return qui ? `${qui} ${mine ? "piochez" : "pioche"} une carte` : "Une carte est piochée";
    case "onAbilityResolved":
      return `${carte}${sienne} résout sa capacité`;
    case "onVeilLost":
      return `${carte}${sienne} perd son Voile`;
    case "onVeilGained":
      return `${carte}${sienne} gagne Voile`;
    case "onMarkerAdded":
      return event.marker === "souillure"
        ? `${carte}${sienne} reçoit un marqueur Souillure`
        : event.marker === "plus-un"
          ? `${carte}${sienne} reçoit un marqueur +1/+1`
          : `${carte}${sienne} reçoit un marqueur`;
    case "onDestructionPrevented":
      return `${carte}${sienne} échappe à sa destruction`;
    case "onChosenOption":
    case "onCondition":
      return null;
  }
}

const DIE_LABELS: Record<NonNullable<TriggerEvent["dieOutcome"]>, string> = {
  criticalSuccess: "réussite critique",
  success: "réussite",
  failure: "échec",
  criticalFailure: "échec critique",
};

/** L'attaque suspendue (`pendingAttack`), racontée du point de vue de `viewerId`. */
function describeAttack(state: GameState, viewerId: string): string | null {
  const attack = state.pendingAttack;
  if (!attack) return null;
  const mine = attack.playerId === viewerId;
  const attacker =
    attack.kind === "tirDeNavire" ? (mine ? "Votre Navire" : "Le Navire adverse") : nameOf(state, attack.attackerInstanceId) ?? "Une unité";
  const target = attack.defenderInstanceId
    ? nameOf(state, attack.defenderInstanceId) ?? "une unité"
    : mine
      ? "le Navire adverse"
      : "votre Navire";
  return `${attacker}${attack.kind === "tirDeNavire" ? "" : mine ? " (à vous)" : " (adverse)"} attaque ${target}`;
}

function nameOf(state: GameState, instanceId: string): string | null {
  const cardId = findCardInstance(state, instanceId)?.card.cardId;
  return cardId && cardId !== HIDDEN_CARD_ID ? safeName(cardId) : null;
}

function safeName(cardId: string): string | null {
  try {
    return getCardDefinition(cardId).name;
  } catch {
    return null;
  }
}
