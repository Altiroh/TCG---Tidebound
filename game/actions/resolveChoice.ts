import { getCardDefinition } from "@/game/cards/sets/core";
import { resolveEffectSequence } from "@/game/effects/resolveSequence";
import { discardFromHand } from "@/game/state/discard";
import { processDiscardedFromHandTriggers, processGraveyardRecoveryTriggers } from "@/game/triggers/triggerBus";
import type { GameEvent } from "@/game/events/types";
import { assertGameActive, assertPlayerInGame, combine } from "@/game/rules/validation";
import { reasonAfterLoss } from "@/game/state/reason";
import { consumeReasonLossShield } from "@/game/state/shields";
import { getPlayer, type GameState, type PlayerState } from "@/game/state/types";
import type { ActionResult, ResolveChoiceAction } from "@/game/actions/types";

function validate(state: GameState, action: ResolveChoiceAction) {
  const generalChecks = combine(assertGameActive(state), assertPlayerInGame(state, action.playerId));
  if (!generalChecks.ok) return generalChecks;

  if (!state.pendingChoice) {
    return { ok: false as const, error: "Aucun choix n'est en attente." };
  }
  if (state.pendingChoice.playerId !== action.playerId) {
    return { ok: false as const, error: "Ce choix n'attend pas ce joueur." };
  }

  return { ok: true as const };
}

/**
 * Résout un choix binaire forcé (ex: Le Fond Vous Regarde) : perdre de la
 * Raison (soumise aux boucliers "1ère fois par tour" comme toute autre
 * perte de Raison, `consumeReasonLossShield`), ou infliger des dégâts
 * d'Ancrage à son PROPRE Navire (jamais intercepté par un bouclier —
 * l'auto-infliction n'est ni une attaque ni un dégât de Marée).
 */
export function resolveChoice(state: GameState, action: ResolveChoiceAction): ActionResult {
  const validation = validate(state, action);
  if (!validation.ok) return { ok: false, error: validation.error };

  const choice = state.pendingChoice!;
  const events: GameEvent[] = [];
  const base = { turnNumber: choice.turnNumber, timestamp: Date.now() };
  let nextState: GameState = { ...state, pendingChoice: undefined };

  // Option d'une capacité (« choisissez : A ou B », ex: Horloge de Marée) :
  // seule la capacité désignée se résout, avec le contexte de la carte source.
  if (choice.kind === "abilityOption") {
    // Refus : la capacité ne se résout pas, et le choix se referme.
    if (action.choice === "pass") return { ok: true, state: nextState, events };
    if (typeof action.choice !== "object" || !("abilityIndex" in action.choice)) {
      return { ok: false, error: "Ce choix attend une option de capacité." };
    }
    const { abilityIndex } = action.choice;
    if (!choice.abilityIndexes.includes(abilityIndex)) return { ok: false, error: "Cette option n'est pas proposée." };
    const ability = getCardDefinition(choice.cardId).abilities?.[abilityIndex];
    if (!ability) return { ok: false, error: "Capacité introuvable." };
    const context = { controllerId: choice.playerId, sourceInstanceId: choice.sourceInstanceId, turnNumber: choice.turnNumber };
    const applied = resolveEffectSequence(nextState, ability.effects, context);
    nextState = applied.state;
    events.push(...applied.events);

    // L'option choisie peut défausser ou repêcher : ses déclencheurs se
    // réveillent comme partout ailleurs.
    const discarded = processDiscardedFromHandTriggers(nextState, applied.events, choice.turnNumber);
    nextState = discarded.state;
    events.push(...discarded.events);
    const recovered = processGraveyardRecoveryTriggers(nextState, applied.events, choice.turnNumber);
    nextState = recovered.state;
    events.push(...recovered.events);
    return { ok: true, state: nextState, events };
  }
  // « Regardez les N premières cartes de votre pioche » : le joueur dit
  // lesquelles il prend. Les cartes regardées sont déjà SORTIES de la
  // pioche (cf. `lookAtDeckTop`) — quoi qu'il réponde, il faut les y
  // remettre, sous peine de les perdre.
  if (choice.kind === "deckLook") {
    const prises =
      action.choice === "pass"
        ? []
        : typeof action.choice === "object" && "takeInstanceIds" in action.choice
          ? action.choice.takeInstanceIds
          : undefined;
    if (prises === undefined) return { ok: false, error: "Ce choix attend les cartes à prendre en main." };
    if (prises.length === 0 && !choice.refusable && choice.revealed.length > 0) {
      return { ok: false, error: "Ce choix n'est pas refusable : le texte dit d'en prendre une." };
    }
    if (new Set(prises).size !== prises.length) return { ok: false, error: "Une même carte ne peut être prise deux fois." };
    if (prises.length > choice.take) return { ok: false, error: `Ce choix permet d'en prendre au plus ${choice.take}.` };

    const regardees = choice.revealed;
    for (const id of prises) {
      const carte = regardees.find((c) => c.instanceId === id);
      if (!carte) return { ok: false, error: "Cette carte ne fait pas partie de celles que vous regardez." };
      if (choice.takeableCardTypes && !choice.takeableCardTypes.includes(getCardDefinition(carte.cardId).type)) {
        return { ok: false, error: "Ce texte ne permet pas de prendre une carte de ce type." };
      }
    }

    const player = getPlayer(nextState, choice.playerId);
    const gardees = regardees.filter((c) => prises.includes(c.instanceId));
    // « Placez les autres SOUS votre pioche », dans l'ordre où elles
    // étaient : le joueur a vu cet ordre, il doit le retrouver.
    const rendues = regardees.filter((c) => !prises.includes(c.instanceId));
    nextState = {
      ...nextState,
      players: nextState.players.map((p) =>
        p.id === choice.playerId ? { ...player, hand: [...player.hand, ...gardees], deck: [...player.deck, ...rendues] } : p
      ) as [PlayerState, PlayerState],
    };
    for (const carte of gardees) {
      events.push({ ...base, type: "DRAW_CARD", playerId: choice.playerId, instanceId: carte.instanceId });
    }
    return { ok: true, state: nextState, events };
  }

  // « Défaussez N cartes » : le joueur a désigné lesquelles. Le moteur
  // vérifie seulement qu'elles sont bien dans SA main et qu'il en a nommé
  // le bon nombre — il ne choisit toujours pas à sa place.
  if (choice.kind === "handDiscard") {
    if (action.choice === "pass") {
      if (!choice.refusable) return { ok: false, error: "Cette défausse n'est pas refusable : le texte dit combien, pas si." };
      return { ok: true, state: nextState, events };
    }
    if (typeof action.choice !== "object" || !("discardInstanceIds" in action.choice)) {
      return { ok: false, error: "Ce choix attend les cartes à défausser." };
    }
    const chosen = action.choice.discardInstanceIds;
    if (new Set(chosen).size !== chosen.length) return { ok: false, error: "Une même carte ne peut être défaussée deux fois." };
    // « jusqu'à N » : le compte est un maximum, pas une exigence.
    if (choice.atMost ? chosen.length > choice.count : chosen.length !== choice.count) {
      return {
        ok: false,
        error: choice.atMost
          ? `Ce choix permet d'en désigner au plus ${choice.count}.`
          : `Ce choix attend exactement ${choice.count} carte${choice.count > 1 ? "s" : ""}.`,
      };
    }
    const hand = getPlayer(nextState, choice.playerId).hand;
    if (chosen.some((id) => !hand.some((card) => card.instanceId === id))) {
      return { ok: false, error: "Cette carte n'est pas dans votre main." };
    }

    // SOUS LA PIOCHE plutôt qu'au Cimetière (Mauvaise Main) : ce n'est pas
    // une défausse, donc `processDiscardedFromHandTriggers` n'a rien à y
    // réveiller et rien ne les repêchera.
    if (choice.destination === "deckBottom") {
      const player = getPlayer(nextState, choice.playerId);
      const rendues = chosen
        .map((id) => player.hand.find((c) => c.instanceId === id))
        .filter((c): c is NonNullable<typeof c> => c !== undefined);
      const restante = player.hand.filter((c) => !chosen.includes(c.instanceId));
      let apres: PlayerState = { ...player, hand: restante, deck: [...player.deck, ...rendues] };
      for (const carte of rendues) {
        events.push({ ...base, type: "CARD_MOVED", ownerId: choice.playerId, instanceId: carte.instanceId, cardId: carte.cardId, fromZone: "hand", toZone: "deck" });
      }
      // « puis piochez-en autant » : exactement ce qui vient d'être rendu.
      if (choice.drawBackAfterwards) {
        const piochees = apres.deck.slice(0, rendues.length);
        apres = { ...apres, deck: apres.deck.slice(piochees.length), hand: [...apres.hand, ...piochees] };
        for (const carte of piochees) {
          events.push({ ...base, type: "DRAW_CARD", playerId: choice.playerId, instanceId: carte.instanceId });
        }
      }
      nextState = {
        ...nextState,
        players: nextState.players.map((p) => (p.id === choice.playerId ? apres : p)) as [PlayerState, PlayerState],
      };
      if (choice.continuation) {
        const rest = resolveEffectSequence(nextState, choice.continuation.effects, choice.continuation.context);
        nextState = rest.state;
        events.push(...rest.events);
      }
      return { ok: true, state: nextState, events };
    }

    const discarded = discardFromHand(nextState, choice.playerId, { instanceIds: chosen }, base);
    nextState = discarded.state;
    events.push(...discarded.events);

    // La défausse est un fait du jeu : elle réveille ses déclencheurs, où
    // qu'elle ait été décidée (`game/state/discard.ts`).
    const triggered = processDiscardedFromHandTriggers(nextState, discarded.events, choice.turnNumber);
    nextState = triggered.state;
    events.push(...triggered.events);

    // Et seulement ensuite, la suite du texte — « si vous le faites… »,
    // « si une carte Un Dead a rejoint votre Cimetière ce tour… ».
    if (choice.continuation) {
      const rest = resolveEffectSequence(nextState, choice.continuation.effects, choice.continuation.context);
      nextState = rest.state;
      events.push(...rest.events);
      const recovered = processGraveyardRecoveryTriggers(nextState, rest.events, choice.turnNumber);
      nextState = recovered.state;
      events.push(...recovered.events);
    }
    return { ok: true, state: nextState, events };
  }

  if (typeof action.choice !== "string" || action.choice === "pass") {
    return { ok: false, error: "Ce choix attend « reasonLoss » ou « anchorDamage » : il n'est pas refusable." };
  }

  if (action.choice === "reasonLoss") {
    const shield = consumeReasonLossShield(nextState, action.playerId, choice.turnNumber);
    nextState = shield.state;
    const finalAmount = Math.max(0, choice.reasonLossAmount - shield.reduction);
    if (finalAmount > 0) {
      const player = getPlayer(nextState, action.playerId);
      events.push({ ...base, type: "REASON_CHANGED", playerId: action.playerId, delta: -finalAmount });
      nextState = {
        ...nextState,
        players: nextState.players.map((p) =>
          p.id === action.playerId ? { ...player, reason: reasonAfterLoss(player, finalAmount) } : p
        ) as [PlayerState, PlayerState],
      };
    }
  } else {
    const player = getPlayer(nextState, action.playerId);
    events.push({
      ...base,
      type: "DAMAGE",
      targetPlayerId: action.playerId,
      amount: choice.anchorDamageAmount,
      targetAnchorAfter: player.anchor - choice.anchorDamageAmount,
    });
    nextState = {
      ...nextState,
      players: nextState.players.map((p) =>
        p.id === action.playerId ? { ...player, anchor: player.anchor - choice.anchorDamageAmount } : p
      ) as [PlayerState, PlayerState],
    };
  }

  return { ok: true, state: nextState, events };
}
