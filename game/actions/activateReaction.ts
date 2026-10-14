import { openChainResponse, pushChainLink, runChain, withChainBase } from "@/game/chain/chainStack";
import { consumeObjectPlayTax, objectPlayTax, recordObjectPlayed } from "@/game/rules/objectPlay";
import { getCardDefinition } from "@/game/cards/sets/core";
import { isEligibleChosenUnit } from "@/game/effects/chosenTargets";
import { validateGraveyardChoice, withSingleGraveyardChoice } from "@/game/effects/graveyardChoices";
import { candidateKey, deriveReactionTriggerEvents, eligibleCandidatesFor, recomputePendingReaction } from "@/game/reactions/reactionWindow";
import {
  processGraveyardEntryTriggers,
  processGraveyardRecoveryTriggers,
  processReturnedToHandTriggers,
  processSummonEnterTriggers,
  payReactionCost,
  processTrigger,
  resolveReaction,
} from "@/game/triggers/triggerBus";
import { recordGraveyardArrival } from "@/game/state/discard";
import type { PendingReactionCandidate, TriggerEvent } from "@/game/triggers/types";
import type { GameEvent } from "@/game/events/types";
import { assertGameActive, assertPlayerInGame, combine } from "@/game/rules/validation";
import type { GameState, PlayerState } from "@/game/state/types";
import type { ActionResult, ActivateReactionAction } from "@/game/actions/types";

function validate(
  state: GameState,
  action: ActivateReactionAction
): { ok: true; candidate: PendingReactionCandidate } | { ok: false; error: string } {
  const generalChecks = combine(assertGameActive(state), assertPlayerInGame(state, action.playerId));
  if (!generalChecks.ok) return generalChecks;

  const pending = state.pendingReaction;
  if (!pending) return { ok: false, error: "Aucune fenêtre de réaction n'est ouverte." };
  if (pending.awaitingPlayerId !== action.playerId) {
    return { ok: false, error: "Ce n'est pas à ce joueur de répondre à cette fenêtre de réaction." };
  }

  // Réévalué à l'instant T (coût, cible disponible) et privé de ce qui a
  // déjà été activé pendant cette même fenêtre — jamais une liste mise en
  // cache.
  const candidates = eligibleCandidatesFor(state, pending.events, action.playerId, pending.turnNumber, pending.usedCandidateKeys);
  const candidate = candidates.find(
    (c) => c.sourceInstanceId === action.sourceInstanceId && c.abilityIndex === action.abilityIndex
  );
  if (!candidate) return { ok: false, error: "Cette capacité n'est plus éligible." };
  if (candidate.needsTarget) {
    if (!action.targetInstanceId) return { ok: false, error: "Cette réaction nécessite une cible." };
    // La cible doit respecter le filtre du texte ("choisissez un
    // Cra-Poiscail") : refusée ici plutôt que silencieusement ignorée par
    // `resolveEffect`, pour que le joueur sache pourquoi rien ne se passe.
    const effects = getCardDefinition(candidate.cardId).abilities?.[candidate.abilityIndex]?.effects ?? [];
    const legal = effects
      .filter((e) => e.target.kind === "chosenUnit")
      .every((e) =>
        isEligibleChosenUnit(
          state,
          e.target,
          action.playerId,
          action.targetInstanceId!,
          candidate.sourceInstanceId,
          candidate.triggerSourceInstanceId
        )
      );
    if (!legal) return { ok: false, error: "Cette carte n'est pas une cible valide pour cette réaction." };
  }

  // Même exigence pour le Cimetière, et le même message quand le joueur a
  // désigné une carte que le filtre refuse.
  const effects = getCardDefinition(candidate.cardId).abilities?.[candidate.abilityIndex]?.effects;
  const graveyard = validateGraveyardChoice(state, action.playerId, effects, action.chosenGraveyardInstanceId);
  if (!graveyard.ok) {
    return {
      ok: false,
      error:
        graveyard.reason === "illegal"
          ? "Cette carte du Cimetière n'est pas une cible valide."
          : "Cette réaction nécessite de choisir une carte dans le Cimetière.",
    };
  }

  return { ok: true, candidate };
}

/**
 * Carte JOUÉE en réaction depuis la main (`TriggeredAbility.playedFromHand`,
 * Propagation — Lot 16) : elle quitte la main pour le Cimetière comme une
 * Anomalie résolue — sans déplacement journalisé, une carte jouée n'est pas
 * une carte défaussée — et la pose est consignée (`PLAY_CARD`). Son coût
 * est payé par la réaction elle-même (`reasonCost` l'inclut).
 */
function playReactiveCardFromHand(
  state: GameState,
  playerId: string,
  instanceId: string,
  turnNumber: number
): { state: GameState; events: GameEvent[] } {
  const player = state.players.find((p) => p.id === playerId);
  const card = player?.hand.find((c) => c.instanceId === instanceId);
  if (!player || !card) return { state, events: [] };
  const after = recordGraveyardArrival(
    { ...player, hand: player.hand.filter((c) => c.instanceId !== instanceId), graveyard: [...player.graveyard, card] },
    { cardId: card.cardId, instanceId, turnNumber, fromZone: "hand" }
  );
  return {
    state: { ...state, players: state.players.map((p) => (p.id === playerId ? after : p)) as [PlayerState, PlayerState] },
    events: [{ type: "PLAY_CARD", turnNumber, timestamp: Date.now(), playerId, instanceId, cardId: card.cardId }],
  };
}

/**
 * Active une capacité facultative éligible pendant une fenêtre de
 * réaction : paie son coût, résout ses effets, puis reconstruit la
 * fenêtre — soit elle continue (l'activation vient elle-même de rendre
 * une nouvelle réaction éligible, cadrage : "une réaction activée peut
 * déclencher de nouvelles réactions"), soit elle se ferme si plus
 * personne n'a rien à offrir. La capacité activée ne peut pas l'être une
 * seconde fois pendant cette même fenêtre (`usedCandidateKeys`).
 */
export function activateReaction(state: GameState, requested: ActivateReactionAction): ActionResult {
  // Une seule carte du Cimetière éligible : elle est désignée d'office.
  const source = state.players.flatMap((p) => [...p.board, ...p.hand, ...p.graveyard]).find((c) => c.instanceId === requested.sourceInstanceId);
  const action = source
    ? withSingleGraveyardChoice(state, getCardDefinition(source.cardId).abilities?.[requested.abilityIndex]?.effects, requested)
    : requested;
  const validation = validate(state, action);
  if (!validation.ok) return { ok: false, error: validation.error };

  const pending = state.pendingReaction!;

  // --- RÉVÉLATION AVANT RÉSOLUTION (grammaire des Structures, 21/09/2026)
  //
  // Une Réaction cachée s'active depuis une Structure que l'adversaire ne
  // voit pas : il sait qu'un Slot est occupé, pas par quoi. Activer expose
  // donc la carte AVANT que ses effets ne s'appliquent — on ne se fait pas
  // frapper par une carte qu'on n'a jamais vue, et l'adversaire peut lire ce
  // qui l'atteint dans le journal, dans le bon ordre.
  //
  // La révélation est définitive par DÉFAUT (`CardInstance.revealed`) : si
  // la Marée remasque la Structure au tour suivant, elle reste connue. Une
  // carte peut en décider autrement — `afterHiddenReaction: "remasquable"`,
  // appliqué plus bas, une fois les effets résolus.
  let revealedState = state;
  const revealEvents: GameEvent[] = [];
  const activatedAbility = getCardDefinition(validation.candidate.cardId).abilities?.[action.abilityIndex];
  if (activatedAbility?.hiddenReaction) {
    const owner = revealedState.players.find((p) => p.board.some((u) => u.instanceId === action.sourceInstanceId));
    const holder = owner?.board.find((u) => u.instanceId === action.sourceInstanceId);
    if (owner && holder && !holder.revealed) {
      revealedState = {
        ...revealedState,
        players: revealedState.players.map((p) =>
          p.id === owner.id
            ? { ...p, board: p.board.map((u) => (u.instanceId === holder.instanceId ? { ...u, revealed: true } : u)) }
            : p
        ) as [PlayerState, PlayerState],
      };
      revealEvents.push({
        type: "STRUCTURE_REVEALED",
        turnNumber: pending.turnNumber,
        timestamp: Date.now(),
        playerId: owner.id,
        instanceId: holder.instanceId,
        cardId: holder.cardId,
      });
    }
  }

  // Objet CHAÎNE en main (règle du 13/10/2026) : il est JOUÉ et monte sur
  // la pile — son effet attend que chacun ait pu lui répondre.
  const fromHand = validation.candidate.fromHand === true;
  if (fromHand && getCardDefinition(validation.candidate.cardId).type === "objet") {
    return playChainObject(revealedState, action, validation.candidate, revealEvents);
  }
  // Hors Objet, une réaction depuis la main est une carte JOUÉE (Lot 16).
  const joueeDepuisLaMain = fromHand;
  if (fromHand) {
    const quitte = playReactiveCardFromHand(revealedState, action.playerId, action.sourceInstanceId, pending.turnNumber);
    revealedState = quitte.state;
    revealEvents.push(...quitte.events);
  }

  const resolution = resolveReaction(
    revealedState,
    validation.candidate,
    action.targetInstanceId,
    pending.turnNumber,
    action.chosenGraveyardInstanceId
  );
  let nextState = resolution.state;
  // La révélation précède les effets DANS LE JOURNAL aussi : c'est l'ordre
  // que lit l'adversaire.
  const events: GameEvent[] = [...revealEvents, ...resolution.events];

  // Ce que la réaction vient de faire arriver (invocation, arrivée rejouée
  // par Colombina) réveille les capacités d'arrivée AUTOMATIQUES concernées,
  // comme après une pose.
  const arrivals = processSummonEnterTriggers(nextState, resolution.events, pending.turnNumber);
  nextState = arrivals.state;
  events.push(...arrivals.events);

  // Ce qu'elle vient de renvoyer en main (Arlecchino, Le Régisseur Sans
  // Visage) : Le Théâtre Englouti et les Régisseurs doivent le voir, comme
  // un renvoi fait par un Bris ou par une capacité automatique.
  const returned = processReturnedToHandTriggers(nextState, resolution.events, pending.turnNumber);
  nextState = returned.state;
  events.push(...returned.events);

  // Et ce qu'elle vient de repêcher ou de défausser : une réaction n'est pas
  // une voie à part, ses gestes réveillent les mêmes déclencheurs.
  const recovered = processGraveyardRecoveryTriggers(nextState, resolution.events, pending.turnNumber);
  nextState = recovered.state;
  events.push(...recovered.events);
  const discarded = processGraveyardEntryTriggers(nextState, resolution.events, pending.turnNumber);
  nextState = discarded.state;
  events.push(...discarded.events);

  if (joueeDepuisLaMain) {
    // « quand une carte est jouée » : celle-ci l'a été, en réaction.
    const played = processTrigger(
      nextState,
      { trigger: "onCardPlayed", playerId: action.playerId, cardId: validation.candidate.cardId, sourceInstanceId: action.sourceInstanceId },
      pending.turnNumber
    );
    nextState = played.state;
    events.push(...played.events);
  }

  // --- REFERMETURE (grammaire des Structures-pièges, 22/09/2026) --------
  //
  // Une Réaction cachée déclarée `afterHiddenReaction: "remasquable"` ne se
  // découvre QUE le temps de sa résolution : la révélation retombe une fois
  // les effets appliqués, et la Structure redevient masquable par la Marée,
  // invisible pour l'adversaire, et de nouveau capable de tirer.
  //
  // Ici et pas avant : la carte a pu quitter le plateau entre-temps (elle
  // s'est Sabordée, un effet l'a détruite) — on ne referme que ce qui est
  // encore là.
  if (activatedAbility?.hiddenReaction && activatedAbility.afterHiddenReaction === "remasquable") {
    const owner = nextState.players.find((p) => p.board.some((u) => u.instanceId === action.sourceInstanceId));
    const holder = owner?.board.find((u) => u.instanceId === action.sourceInstanceId);
    if (owner && holder?.revealed) {
      nextState = {
        ...nextState,
        players: nextState.players.map((p) =>
          p.id === owner.id
            ? { ...p, board: p.board.map((u) => (u.instanceId === holder.instanceId ? { ...u, revealed: undefined } : u)) }
            : p
        ) as [PlayerState, PlayerState],
      };
      events.push({
        type: "STRUCTURE_REHIDDEN",
        turnNumber: pending.turnNumber,
        timestamp: Date.now(),
        playerId: owner.id,
        instanceId: holder.instanceId,
        cardId: holder.cardId,
      });
    }
  }

  const usedCandidateKeys = keysAfterActivation(pending.usedCandidateKeys, validation.candidate.cardId, action.sourceInstanceId, action.abilityIndex);

  // « Une réaction activée peut elle-même déclencher de nouvelles
  // réactions » : ce qu'elle a produit s'ajoute aux déclencheurs de la
  // fenêtre — une arrivée rejouée rouvre ainsi les choix de la carte visée.
  const triggerEvents = [...pending.events, ...deriveReactionTriggerEvents(nextState, events)];
  const nextPending = recomputePendingReaction(nextState, { ...pending, events: triggerEvents, usedCandidateKeys });
  if (nextPending) {
    events.push({
      type: "REACTION_WINDOW_OPENED",
      turnNumber: nextPending.turnNumber,
      timestamp: Date.now(),
      playerId: nextPending.awaitingPlayerId,
    });
  }

  // La fenêtre se ferme sur une pile Chaîne qui attendait : elle se résout.
  if (!nextPending && nextState.chainStack?.length) {
    const suite = runChain({ ...nextState, pendingReaction: undefined });
    return { ok: true, state: withLeftovers(suite.state, suite.leftoverTriggers), events: [...events, ...suite.events] };
  }

  return { ok: true, state: { ...nextState, pendingReaction: nextPending }, events };
}

/**
 * « Choisissez : A ou B » : activer l'une des capacités d'un groupe écarte
 * ses sœurs pour le reste de la fenêtre — et la capacité activée ne se
 * repropose pas dans cette même fenêtre.
 */
function keysAfterActivation(used: readonly string[], cardId: string, sourceInstanceId: string, abilityIndex: number): string[] {
  const def = getCardDefinition(cardId);
  const activated = def.abilities?.[abilityIndex];
  const siblings = activated?.choiceGroup
    ? (def.abilities ?? []).flatMap((ability, index) => (ability.choiceGroup === activated.choiceGroup ? [candidateKey(sourceInstanceId, index)] : []))
    : [];
  return Array.from(new Set([...used, candidateKey(sourceInstanceId, abilityIndex), ...siblings]));
}

/**
 * Déclencheurs produits par une pile que personne n'a encore pu voir : une
 * action de fenêtre ne voit pas ses événements redérivés par `dispatch`, ils
 * attendent donc la prochaine table libre (`reactionsEnAttente`).
 */
export function withLeftovers(state: GameState, leftovers: readonly TriggerEvent[]): GameState {
  if (leftovers.length === 0) return state;
  return { ...state, reactionsEnAttente: [...(state.reactionsEnAttente ?? []), ...leftovers] };
}

/**
 * Joue un Objet CHAÎNE depuis la main dans la fenêtre que décrit son texte
 * (Harpon à Ressort, Sabotage Discret…) : coût de la carte et taxe adverse
 * payés, la carte monte sur la pile avec la cible désignée, puis chacun peut
 * lui répondre. La fenêtre où il a été joué reprendra une fois la pile vide
 * (`chainBase`).
 */
function playChainObject(
  state: GameState,
  action: ActivateReactionAction,
  candidate: PendingReactionCandidate,
  revealEvents: GameEvent[]
): ActionResult {
  const pending = state.pendingReaction!;
  const turnNumber = pending.turnNumber;
  const base = { turnNumber, timestamp: Date.now() };
  const card = state.players.find((p) => p.id === action.playerId)!.hand.find((c) => c.instanceId === action.sourceInstanceId)!;
  const def = getCardDefinition(card.cardId);

  // La taxe adverse est comptée dans `reasonCost` au recensement : elle est consommée ici.
  const tax = objectPlayTax(state, action.playerId, turnNumber);
  const paid = payReactionCost(state, candidate, turnNumber);
  let nextState = consumeObjectPlayTax(paid.state, tax, turnNumber);
  nextState = recordObjectPlayed(nextState, action.playerId, def.name);
  const events: GameEvent[] = [
    ...revealEvents,
    ...paid.events,
    { ...base, type: "PLAY_CARD", playerId: action.playerId, instanceId: card.instanceId, cardId: card.cardId },
    { ...base, type: "REACTION_ACTIVATED", playerId: action.playerId, sourceInstanceId: card.instanceId },
  ];

  const usedCandidateKeys = keysAfterActivation(pending.usedCandidateKeys, candidate.cardId, action.sourceInstanceId, action.abilityIndex);
  nextState = withChainBase({ ...nextState, pendingReaction: undefined }, { ...pending, usedCandidateKeys });

  const pushed = pushChainLink(nextState, {
    id: card.instanceId,
    playerId: action.playerId,
    card,
    abilityIndex: action.abilityIndex,
    ...(action.targetInstanceId ? { targetInstanceId: action.targetInstanceId } : {}),
    ...(action.chosenGraveyardInstanceId ? { chosenGraveyardInstanceId: action.chosenGraveyardInstanceId } : {}),
    ...(candidate.triggerSourceInstanceId ? { triggerSourceInstanceId: candidate.triggerSourceInstanceId } : {}),
    turnNumber,
  });
  nextState = pushed.state;
  events.push(...pushed.events);

  // « Quand vous jouez un Objet » : il vient de l'être.
  const joue = processTrigger(nextState, { trigger: "onCardPlayed", playerId: action.playerId, cardId: card.cardId, sourceInstanceId: card.instanceId }, turnNumber);
  nextState = joue.state;
  events.push(...joue.events);

  const link = nextState.chainStack![nextState.chainStack!.length - 1]!;
  const reponse = openChainResponse(nextState, link);
  if (reponse.state.pendingReaction) return { ok: true, state: reponse.state, events: [...events, ...reponse.events] };
  const suite = runChain(nextState);
  return { ok: true, state: withLeftovers(suite.state, suite.leftoverTriggers), events: [...events, ...suite.events] };
}
