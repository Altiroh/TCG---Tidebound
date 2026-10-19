import { boardCapacity } from "@/game/rules/slotEffects";
import { stripMarkers } from "@/game/cards/markers";
import { activeLandeRules } from "@/game/rules/lande";
import { markTurnDiscountsUsed, turnDiscounts } from "@/game/rules/costReductions";
import { boardPermanents, isAttachedCard, isOngoingEffect } from "@/game/rules/ongoing";
import { boardSlotLayout, chooseBoardSlot } from "@/game/rules/boardSlots";
import { canBeEquipTarget, getCardDefinition, hasAnyValidEquipTarget } from "@/game/cards/sets/core";
import { isLandeCard, isPermanentCard, isVisibleDuringTide, UNIT_CARD_TYPES, type CardDefinition } from "@/game/cards/types";
import { placeLande, recordUnitArrivals, unitArrivalRefusal } from "@/game/rules/lande";
import { validateGraveyardChoice, withSingleGraveyardChoice } from "@/game/effects/graveyardChoices";
import { isEligibleChosenUnit, withDieBranchEffects } from "@/game/effects/chosenTargets";
import type { EffectContext } from "@/game/effects/resolveEffect";
import { discountApplies, resolveEffect } from "@/game/effects/resolveEffect";
import { resolveEffectSequence } from "@/game/effects/resolveSequence";
import type { GameEvent } from "@/game/events/types";
import {
  processGraveyardEntryTriggers,
  processGraveyardRecoveryTriggers,
  processReturnedToHandTriggers,
  processSummonEnterTriggers,
  runEveilOnArrival,
  processTrigger,
} from "@/game/triggers/triggerBus";
import {
  assertBoardNotFull,
  assertCanPayCost,
  assertPlayableCondition,
  assertCardInHand,
  assertGameActive,
  assertInMainPhase,
  assertIsActivePlayer,
  assertPlayerInGame,
  combine,
} from "@/game/rules/validation";
import { payReasonCost, reasonCostAfterShield } from "@/game/state/shields";
import { recordGraveyardArrival } from "@/game/state/discard";
import { assemblageError, controlledChromaticColors, findAssemblage } from "@/game/rules/chromatic";
import { getPlayer, MIN_DISCOUNTED_COST, type GameState, type PlayerId, type PlayerState } from "@/game/state/types";
import type { ActionResult, PlayCardAction } from "@/game/actions/types";
import { openChainResponse, pushChainLink, runChain } from "@/game/chain/chainStack";
import { pendingDieRoll } from "@/game/rules/dice";
import {
  consumeObjectPlayTax,
  isDieChainObject,
  isReactionChainObject,
  objectPlayTax,
  objectsPlayedThisTurn,
  recordObjectPlayed,
} from "@/game/rules/objectPlay";

function isUnitCard(type: string): boolean {
  return (UNIT_CARD_TYPES as readonly string[]).includes(type);
}

/** Coût imprimé, en tenant compte d'un `costOverrideWhenTideStateIn` actif (ex: Choppe ! gratuite pendant Calme). */
function printedCost(def: CardDefinition, state: GameState): number {
  const override = def.costOverrideWhenTideStateIn;
  if (override && override.tideStateIn.includes(state.environment.tideState)) return override.cost;
  return def.cost;
}

/**
 * Coût réel à payer : coût imprimé, moins les réductions en attente du
 * joueur qui s'appliquent à cette carte (Lot 11 — « la prochaine
 * Marionnette que vous jouez ce tour coûte 1 de moins »).
 *
 * Le plancher `MIN_DISCOUNTED_COST` est appliqué ICI, une fois toutes les
 * réductions cumulées, et pas réduction par réduction : deux réductions de
 * 1 sur une carte à 2 la ramènent à 1, pas à 0. C'est la règle générale du
 * lot (« aucun effet de réduction ne peut faire descendre un coût sous 1 »),
 * tenue à un seul endroit plutôt que répétée sur chaque carte.
 *
 * Une carte dont le coût imprimé est DÉJÀ sous le plancher (une carte
 * gratuite par override de Marée) n'est pas remontée : le plancher borne
 * les réductions, il n'impose pas un coût minimum au catalogue.
 */
function effectiveCost(def: CardDefinition, state: GameState, playerId?: PlayerId, instanceId?: string): number {
  const printed = printedCost(def, state);
  if (playerId === undefined) return printed;

  const player = state.players.find((p) => p.id === playerId);
  const poseesCeTour = player?.unitsPlayedThisTurn ?? 0;
  const applicables = (player?.costDiscounts ?? []).filter((discount) =>
    discountApplies(discount, def, state.turnNumber, poseesCeTour, instanceId)
  );
  // « sans payer son coût de Raison » (Changement de rôle !) : ni le
  // plancher des réductions ni une majoration ne s'appliquent.
  if (applicables.some((discount) => discount.free)) return 0;
  // « La première … à chacun de vos tours » (Lot 17) : lues sur le jeu.
  const duTour = turnDiscounts(state, playerId, def, instanceId).reduce((sum, d) => sum + d.amount, 0);
  const reduction = applicables.reduce((sum, discount) => sum + discount.amount, 0) + duTour;
  if (reduction === 0) return printed;
  // Une MAJORATION (`amount` négatif, Pas Tous à la Fois !) n'est bornée
  // par rien : le plancher existe pour empêcher une réduction de rendre une
  // carte gratuite, pas pour empêcher une taxe de coûter cher.
  if (reduction < 0) return printed - reduction;

  return Math.max(Math.min(printed, MIN_DISCOUNTED_COST), printed - reduction);
}

/**
 * Consomme UNE charge de chaque réduction qui vient de s'appliquer, et
 * jette celles qui n'ont plus de charge. Appelé une seule fois, au moment
 * où la carte est effectivement payée — prévisualiser un coût ne doit rien
 * consommer.
 */
function consumeCostDiscounts(state: GameState, playerId: PlayerId, def: CardDefinition, instanceId: string): GameState {
  const player = state.players.find((p) => p.id === playerId);
  if (!player?.costDiscounts?.length) return state;

  const poseesCeTour = player.unitsPlayedThisTurn ?? 0;
  const remaining = player.costDiscounts
    .map((discount) =>
      // Un modificateur PERSISTANT ne se consomme pas : « les unités
      // supplémentaires », ce n'est pas « la prochaine ».
      !discount.persistent && discountApplies(discount, def, state.turnNumber, poseesCeTour, instanceId)
        ? { ...discount, uses: discount.uses - 1 }
        : discount
    )
    .filter((discount) => (discount.persistent || discount.uses > 0) && state.turnNumber <= discount.expiresAfterTurn);

  return {
    ...state,
    players: state.players.map((p) => (p.id === playerId ? { ...p, costDiscounts: remaining } : p)) as GameState["players"],
  };
}

/**
 * Raison que coûterait réellement cette carte de la main si elle était
 * jouée maintenant (override de Marée + bouclier de perte de Raison), et
 * la Raison qui en résulterait — pour annoncer la Déraison dans l'UI AVANT
 * validation. `undefined` si la carte n'est pas dans la main du joueur.
 */
export function previewPlayCardReason(
  state: GameState,
  playerId: PlayerId,
  instanceId: string
): { cost: number; reasonAfter: number; allowed: boolean } | undefined {
  const player = state.players.find((p) => p.id === playerId);
  const card = player?.hand.find((c) => c.instanceId === instanceId);
  if (!player || !card) return undefined;
  const def = getCardDefinition(card.cardId);
  // Un Objet paie aussi la taxe adverse (Cloche d'Alerte, Seren…).
  const tax = def.type === "objet" ? objectPlayTax(state, playerId, state.turnNumber) : undefined;
  const cost = reasonCostAfterShield(state, playerId, effectiveCost(def, state, playerId, card.instanceId) + (tax?.amount ?? 0), state.turnNumber);
  // Sans plancher de Déraison, un coût se paie toujours — l'UI n'a plus
  // qu'à annoncer la dette —, sauf taxe adverse bloquante.
  return { cost, reasonAfter: player.reason - cost, allowed: !(tax?.blocksIfUnpayable && player.reason < cost) };
}

/**
 * Motif pour lequel la carte ne peut pas être jouée MAINTENANT, ou `null`
 * si elle le peut — sa cible et son choix au Cimetière restant à désigner.
 * Même validation que `playCard` : l'interface annonce le refus sur le
 * bouton « Jouer » au lieu de le découvrir au geste. Plateau plein, une
 * carte à Assemblage reste jouable si un Assemblage existe : il libère sa
 * place.
 */
export function playCardRefusal(state: GameState, playerId: PlayerId, instanceId: string): string | null {
  const action: PlayCardAction = { type: "playCard", playerId, instanceId };
  const result = validatePlayability(state, action);
  if (result.ok) return null;
  const player = state.players.find((p) => p.id === playerId);
  const card = player?.hand.find((c) => c.instanceId === instanceId);
  const sentinels = card && getCardDefinition(card.cardId).chromaticAssemblage?.sentinels;
  const assemblage = sentinels ? findAssemblage(player!.board, sentinels) : undefined;
  if (assemblage && validatePlayability(state, { ...action, assemblage }).ok) return null;
  return result.error;
}

/** Effets que résout la carte quand elle est jouée : ceux d'un Objet sont ses `onBreakEffects`. */
function playedEffects(def: CardDefinition) {
  return (def.type === "objet" ? def.onBreakEffects : def.onPlayEffects) ?? [];
}

/**
 * Quand un Objet se joue-t-il depuis la main ? Un Objet classique en Phase
 * principale, hors jet de dé ; une Chaîne de dé pendant un jet de son
 * joueur ; une Chaîne de réaction jamais par cette action — seulement dans
 * la fenêtre que décrit son texte (`activateReaction`).
 */
function objectTimingRefusal(state: GameState, action: PlayCardAction, def: CardDefinition): string | null {
  // Une Chaîne INSTANTANÉE (`chaineLibre`, Lot 19) se joue AUSSI en Phase
  // principale : elle suit alors la voie d'un Objet classique, sans emplacement.
  if (isReactionChainObject(def) && !def.chaineLibre) {
    return "Chaîne : cet Objet se joue en réaction, depuis votre main, quand la situation de son texte se présente.";
  }
  const jet = pendingDieRoll(state);
  if (isDieChainObject(def)) {
    if (!(jet && jet.playerId === action.playerId)) return "Chaîne : cet Objet se joue pendant l'un de vos jets de dé, avant sa résolution.";
    if (jet.candidates !== undefined) return "Choisissez d'abord le dé à garder.";
    return null;
  }
  if (jet) return "Un jet de dé est en cours : seuls les Objets « Chaîne » peuvent s'y jouer.";
  return null;
}

/**
 * Tout ce qui empêche de jouer la carte, AVANT la question de sa cible et
 * de son choix au Cimetière : tour, phase, Marée, condition de Raison,
 * coût, place sur le plateau, Équipement sans porteur possible.
 */
function validatePlayability(state: GameState, action: PlayCardAction) {
  const player = state.players.find((p) => p.id === action.playerId);
  const enMain = player?.hand.find((c) => c.instanceId === action.instanceId);
  const objet = enMain ? getCardDefinition(enMain.cardId) : undefined;
  if (objet?.type === "objet") {
    const refus = objectTimingRefusal(state, action, objet);
    if (refus) return { ok: false as const, error: refus };
  }
  // Une Chaîne de dé se joue pendant le jet de son joueur, même hors de sa Phase principale.
  const horsPhase = objet !== undefined && isDieChainObject(objet);
  const generalChecks = combine(
    assertGameActive(state),
    assertPlayerInGame(state, action.playerId),
    ...(horsPhase ? [] : [assertIsActivePlayer(state, action.playerId), assertInMainPhase(state, action.playerId)]),
    assertCardInHand(state, action.playerId, action.instanceId)
  );
  if (!generalChecks.ok) return generalChecks;

  const instance = player!.hand.find((c) => c.instanceId === action.instanceId)!;
  const def = getCardDefinition(instance.cardId);

  // Une carte qui ne se joue qu'en RÉACTION, depuis la main (Propagation,
  // Lot 16) : la poser en phase principale ne ferait rien.
  if (def.type !== "objet" && (def.abilities ?? []).some((ability) => ability.playedFromHand)) {
    return { ok: false as const, error: "Cette carte se joue en réaction, depuis votre main, quand son déclencheur a lieu." };
  }

  if (def.requiresTideState && !def.requiresTideState.includes(state.environment.tideState)) {
    return { ok: false as const, error: "Cette carte ne peut pas être jouée dans l'état de Marée actuel." };
  }

  if (def.requiresControllerReasonAtMost !== undefined && player!.reason > def.requiresControllerReasonAtMost) {
    return { ok: false as const, error: `Cette carte ne peut être jouée qu'avec ${def.requiresControllerReasonAtMost} Raison ou moins.` };
  }
  if (def.requiresControllerReasonExactly !== undefined && player!.reason !== def.requiresControllerReasonExactly) {
    return { ok: false as const, error: `Cette carte ne peut être jouée qu'avec exactement ${def.requiresControllerReasonExactly} Raison.` };
  }

  // « Ne peut entrer en jeu que par l'effet de … » (Eidolon Opalin LVX, Lot 17).
  if (def.cannotBePlayed) {
    return { ok: false as const, error: "Cette carte ne se joue pas depuis la main : elle n'entre en jeu que par l'effet de sa lignée." };
  }

  // Lande « un seul Marin ou une seule Créature par tour » (Chaîne de
  // construction) : refusé avant le coût, comme une condition de pose.
  const arrivalRefusal = unitArrivalRefusal(state, action.playerId, def);
  if (arrivalRefusal) return { ok: false as const, error: arrivalRefusal };

  // « Jouable uniquement si… » : avant le coût, puisque la carte ne se pose
  // pas du tout — rien ne doit être dépensé pour un refus.
  const playableCheck = assertPlayableCondition(state, action.playerId, def);
  if (!playableCheck.ok) return playableCheck;

  // « Assemblage Chromatique » : un coût ALTERNATIF, qui n'existe que si la
  // carte le déclare et que les Sentinelles désignées le remplissent.
  if (action.assemblage) {
    if (!def.chromaticAssemblage) return { ok: false as const, error: "Cette carte ne se joue pas par Assemblage." };
    const erreur = assemblageError(player!.board, action.assemblage, def.chromaticAssemblage.sentinels);
    if (erreur) return { ok: false as const, error: erreur };
  }

  const costCheck = assertCanPayCost(
    state,
    action.playerId,
    reasonCostAfterShield(state, action.playerId, effectiveCost(def, state, action.playerId, action.instanceId), state.turnNumber)
  );
  if (!costCheck.ok) return costCheck;

  if (def.type === "objet") {
    // « Une seule utilisation de … par tour » (Fragment d'Éveil) : par NOM.
    if (def.playOncePerTurnByName && objectsPlayedThisTurn(player!, state.turnNumber).includes(def.name)) {
      return { ok: false as const, error: `Une seule utilisation de ${def.name} par tour.` };
    }
    // « S'il ne peut pas payer, il ne peut pas le jouer » (Cloche d'Alerte,
    // Seren) : seule une taxe adverse bloquante refuse un Objet faute de
    // Raison — hors ce cas, un coût se paie toujours, quitte à creuser la dette.
    const tax = objectPlayTax(state, action.playerId, state.turnNumber);
    const total = reasonCostAfterShield(state, action.playerId, effectiveCost(def, state, action.playerId, action.instanceId) + tax.amount, state.turnNumber);
    if (tax.blocksIfUnpayable && player!.reason < total) {
      return { ok: false as const, error: "Raison insuffisante pour payer la taxe adverse sur cet Objet." };
    }
    // Un Objet classique exige un emplacement LIBRE, sans jamais s'y poser.
    // Un Objet Chaîne se joue même plateau plein.
    if (!def.chaine) {
      const boardCheck = assertBoardNotFull(state, action.playerId);
      if (!boardCheck.ok) return { ok: false as const, error: "Il faut au moins un emplacement libre pour jouer un Objet (il n'y est pas posé)." };
    }
    return { ok: true as const };
  }

  // Un Assemblage libère au moins une place avant de poser la carte.
  // Un effet en cours (Anomalie) ne prend pas de Slot : plateau plein ou non,
  // il se joue. Un Équipement non plus : il s'attache à son porteur
  // (refonte du 13/10/2026).
  if (isPermanentCard(def) && !isOngoingEffect(def) && !isAttachedCard(def) && !action.assemblage) {
    // Slots universels : tout permanent (unité, Structure) occupe un Slot,
    // pas seulement les unités.
    const boardCheck = assertBoardNotFull(state, action.playerId);
    if (!boardCheck.ok) return boardCheck;
  }

  // « Équipez une unité Un Dead », « Équipez une Structure » : le texte
  // ORDONNE l'attache. Un Équipement qui ne trouve personne à équiper
  // ne se pose donc pas — il resterait sur le plateau à occuper un Slot
  // sans jamais rien faire. La règle vaut pour tous : chaque texte
  // d'Équipement commence par cet impératif.
  const attachEffect = (def.onPlayEffects ?? []).find((e) => e.type === "attachEquipment");
  if (attachEffect && !hasAnyValidEquipTarget(def, player!.board)) {
    return { ok: false as const, error: "Aucun permanent de votre plateau ne peut recevoir cet Équipement." };
  }

  return { ok: true as const };
}

function validate(state: GameState, action: PlayCardAction) {
  const playability = validatePlayability(state, action);
  if (!playability.ok) return playability;

  const player = state.players.find((p) => p.id === action.playerId);
  const def = getCardDefinition(player!.hand.find((c) => c.instanceId === action.instanceId)!.cardId);
  // Branches de dé comprises : une cible désignée peut ne vivre que là (`withDieBranchEffects`).
  const effets = withDieBranchEffects(playedEffects(def));
  const attachEffect = effets.find((e) => e.type === "attachEquipment");
  const needsTarget = effets.some((e) => e.target.kind === "chosenUnit");

  if (needsTarget) {
    if (attachEffect) {
      if (!action.targetInstanceId) {
        return { ok: false as const, error: "Cet Équipement nécessite une cible." };
      }
      const target = player!.board.find((u) => u.instanceId === action.targetInstanceId);
      if (!target || !canBeEquipTarget(def, player!.board, target)) {
        return { ok: false as const, error: "Cible d'Équipement invalide." };
      }
    } else if (!action.targetInstanceId) {
      return { ok: false as const, error: "Cette carte nécessite une cible." };
    } else {
      // Même filtre qu'à la résolution (`isEligibleChosenUnit`) : une cible
      // qu'aucun effet n'accepte — hors filtre, ou inciblable par vous
      // (L'Intangible) — est refusée AVANT que la carte ne soit payée et
      // jouée pour rien.
      const accepte = effets
        .filter((e) => e.target.kind === "chosenUnit")
        .some((e) => isEligibleChosenUnit(state, e.target, action.playerId, action.targetInstanceId!, action.instanceId));
      if (!accepte) return { ok: false as const, error: "Cette carte n'est pas une cible valide pour cet effet." };
    }
  }

  // « À son arrivée, choisissez une unité dans votre Cimetière » : même
  // convention « si possible » que le ciblage d'Équipement — la carte n'est
  // réclamée que s'il en existe une éligible.
  const graveyard = validateGraveyardChoice(state, action.playerId, effets, action.chosenGraveyardInstanceId);
  if (!graveyard.ok) {
    return {
      ok: false as const,
      error:
        graveyard.reason === "illegal"
          ? "Cette carte du Cimetière n'est pas une cible valide."
          : "Cette carte nécessite de choisir une carte dans le Cimetière.",
    };
  }

  return { ok: true as const };
}

/**
 * Joue une carte de la main : paie le coût en Raison, la retire de la
 * main, la place (plateau pour un permanent, cimetière pour une carte non
 * permanente après résolution — cf. `isPermanentCard`), résout ses
 * `onPlayEffects`, et déclenche les triggers `onCardPlayed`/`onEnterPlay`.
 *
 * Pas de limite au nombre de cartes jouées par tour (Notion "Moteur de
 * partie", "Principes déjà retenus") : un joueur peut jouer autant de
 * cartes qu'il peut en payer pendant sa Phase principale — seule la
 * Raison disponible (et l'espace sur le plateau) le limite.
 */
export function playCard(state: GameState, requested: PlayCardAction): ActionResult {
  // Une seule carte du Cimetière éligible : elle est désignée d'office.
  const posee = getPlayer(state, requested.playerId).hand.find((c) => c.instanceId === requested.instanceId);
  const action = posee ? withSingleGraveyardChoice(state, playedEffects(getCardDefinition(posee.cardId)), requested) : requested;
  const validation = validate(state, action);
  if (!validation.ok) return { ok: false, error: validation.error };

  const player = getPlayer(state, action.playerId);
  const instance = player.hand.find((c) => c.instanceId === action.instanceId)!;
  const def = getCardDefinition(instance.cardId);
  if (def.type === "objet") return playObject(state, action, instance, def);
  const events: GameEvent[] = [];
  const base = { turnNumber: state.turnNumber, timestamp: Date.now() };

  const handAfterRemoval = player.hand.filter((c) => c.instanceId !== instance.instanceId);
  let nextState: GameState = {
    ...state,
    players: state.players.map((p) => (p.id === player.id ? { ...player, hand: handAfterRemoval } : p)) as [
      PlayerState,
      PlayerState
    ],
  };

  // --- ASSEMBLAGE CHROMATIQUE (Lot 15) ---------------------------------
  // Les Sentinelles désignées sont PLACÉES au Cimetière : ni détruites, ni
  // Sabordées. Aucun `onDeath` ne s'éveille — « cela ne compte pas comme une
  // destruction » —, et leurs Équipements orphelins partent au prochain
  // passage de `processDeaths`, comme ceux de toute unité qui quitte le jeu.
  const assemblage = action.assemblage && def.chromaticAssemblage ? action.assemblage : undefined;
  // « une couleur que vous ne contrôliez pas ENCORE » (Poste Chromatique) :
  // photo AVANT l'Assemblage, qui retire des couleurs du plateau.
  const couleursAvantArrivee = controlledChromaticColors(player, state.turnNumber);
  if (assemblage) {
    const retirees = new Set(assemblage.map((part) => part.instanceId));
    const owner = getPlayer(nextState, player.id);
    const partantes = owner.board.filter((u) => retirees.has(u.instanceId));
    let apres: PlayerState = {
      ...owner,
      board: owner.board.filter((u) => !retirees.has(u.instanceId)),
      graveyard: [
        ...owner.graveyard,
        ...partantes.map((u) => ({ ...u, damageMarked: 0, modifiers: [], graveyardCause: "assembled" as const })),
      ],
    };
    for (const carte of partantes) {
      apres = recordGraveyardArrival(apres, { cardId: carte.cardId, instanceId: carte.instanceId, turnNumber: state.turnNumber, fromZone: "board" });
      events.push({ ...base, type: "CARD_MOVED", instanceId: carte.instanceId, cardId: carte.cardId, ownerId: player.id, fromZone: "board", toZone: "graveyard" });
    }
    nextState = { ...nextState, players: nextState.players.map((p) => (p.id === player.id ? apres : p)) as [PlayerState, PlayerState] };
  }

  // La Mauvaise Réputation : la réduction qui s'applique à CETTE carte dit
  // aussi ce qu'elle subit à son arrivée. Lu avant de consommer la charge.
  const degatsArrivee = assemblage
    ? []
    : (player.costDiscounts ?? []).filter(
        (discount) =>
          discount.arrivalDamage &&
          discountApplies(discount, def, state.turnNumber, player.unitsPlayedThisTurn ?? 0, instance.instanceId)
      );

  // « en payant 2 Raison au lieu de son coût » : l'Assemblage remplace le
  // coût, il ne s'y ajoute pas, et aucune réduction ne s'y applique.
  const payment = payReasonCost(
    nextState,
    player.id,
    assemblage ? def.chromaticAssemblage!.reasonCost : effectiveCost(def, state, player.id, instance.instanceId),
    state.turnNumber
  );
  // La réduction est dépensée en même temps que la Raison, jamais avant :
  // une pose refusée plus haut ne doit pas avoir consommé la charge.
  nextState = assemblage ? payment.state : consumeCostDiscounts(payment.state, player.id, def, instance.instanceId);
  if (!assemblage) nextState = markTurnDiscountsUsed(nextState, player.id, turnDiscounts(state, player.id, def, instance.instanceId).map((d) => d.key));
  // Compté APRÈS le paiement : « après la troisième unité jouée », c'est la
  // quatrième qui paie, donc la carte en cours ne doit pas s'être déjà
  // comptée quand son propre coût est calculé.
  if ((UNIT_CARD_TYPES as readonly string[]).includes(def.type)) {
    nextState = {
      ...nextState,
      players: nextState.players.map((p) =>
        p.id === player.id ? { ...p, unitsPlayedThisTurn: (p.unitsPlayedThisTurn ?? 0) + 1 } : p
      ) as GameState["players"],
    };
  }

  events.push({ ...base, type: "PLAY_CARD", playerId: player.id, instanceId: instance.instanceId, cardId: def.id });
  events.push({ ...base, type: "REASON_CHANGED", playerId: player.id, delta: -payment.paid });

  const asPermanent = isPermanentCard(def);

  if (isLandeCard(def)) {
    // Lande : l'emplacement PARTAGÉ du centre, pas le plateau du joueur.
    // Celle qui y était part au Cimetière de son propriétaire.
    const posee = placeLande(nextState, player.id, instance, state.turnNumber);
    nextState = posee.state;
    events.push(...posee.events);
  } else if (isUnitCard(def.type) || asPermanent) {
    const boardUnit = {
      // Un marqueur part avec la carte qui quitte le plateau : celle qui y
      // revient depuis la main n'en porte aucun (Lot 18).
      ...stripMarkers(instance),
      summoningSick: isUnitCard(def.type),
      hasAttackedThisTurn: false,
      damageMarked: 0,
      modifiers: [],
      turnsRemaining: def.durationTurns,
      couleursAvantArrivee,
      // « considéré comme ayant les quatre couleurs utilisées pour son
      // Assemblage. Il émet … les Signaux correspondant à ces couleurs. »
      ...(assemblage
        ? {
            chromatic: { colors: assemblage.map((part) => part.color), emits: assemblage.map((part) => part.color) },
            arrivedByAssemblage: true,
          }
        : {}),
    };
    const owner = getPlayer(nextState, player.id);
    // Emplacement dans le rang. Le joueur le désigne en lâchant sa carte
    // (`boardIndex`) ; sinon un Équipement se range, dans l'état, juste après
    // le porteur qu'il équipe (il ne prend aucune case) — et le reste prend
    // la fin du rang.
    const hostIndex =
      (def.onPlayEffects ?? []).some((e) => e.type === "attachEquipment") && action.targetInstanceId
        ? owner.board.findIndex((u) => u.instanceId === action.targetInstanceId)
        : -1;
    // Un effet en cours (Anomalie) ne prend pas de place dans le rang : toujours en fin de liste.
    const wanted = isOngoingEffect(def) ? owner.board.length : (action.boardIndex ?? (hostIndex >= 0 ? hostIndex + 1 : owner.board.length));
    const at = Math.max(0, Math.min(Math.trunc(wanted), owner.board.length));
    // CASE du rang (`boardSlot`, cases vides comprises) : celle que le
    // joueur vise ; sinon, pour un Équipement, la plus proche de son
    // porteur, pour un Assemblage celle de la première Sentinelle, et
    // sinon la première libre. Écrite à chaque pose : une carte revenue en
    // main ne garde pas son ancienne case.
    // Emplacements condamnés ou ajoutés compris (`game/rules/slotEffects.ts`).
    const capacity = boardCapacity(nextState, owner);
    const slotOfInstance = (board: typeof owner.board, instanceId: string | undefined) =>
      instanceId ? boardSlotLayout(boardPermanents(board), capacity).findIndex((u) => u?.instanceId === instanceId) : -1;
    const nearSlot = assemblage ? slotOfInstance(player.board, assemblage[0]?.instanceId) : hostIndex >= 0 ? slotOfInstance(owner.board, action.targetInstanceId) : -1;
    // Un Équipement n'a pas de case : il est attaché à son porteur.
    const slot = isOngoingEffect(def) || isAttachedCard(def)
      ? undefined
      : chooseBoardSlot(boardPermanents(owner.board), capacity, action.boardSlot, nearSlot >= 0 ? nearSlot : undefined);
    boardUnit.slot = slot;
    const board = [...owner.board.slice(0, at), boardUnit, ...owner.board.slice(at)];
    nextState = {
      ...nextState,
      players: nextState.players.map((p) => (p.id === owner.id ? { ...owner, board } : p)) as [PlayerState, PlayerState],
    };
    events.push({ ...base, type: "SUMMON", playerId: player.id, instanceId: boardUnit.instanceId, cardId: def.id, played: true });
    nextState = recordUnitArrivals(nextState, player.id, [def], state.turnNumber);
    // « La première unité coûtant N ou moins que chaque joueur joue à son
    // tour gagne +A/+B » (Calme trompeur, Lot 17).
    const calme = activeLandeRules(nextState.environment)?.firstCheapUnitEachTurnBuff;
    const joueurPose = getPlayer(nextState, player.id);
    if (calme && isUnitCard(def.type) && def.cost <= calme.maxCost && joueurPose.cheapUnitBuffTurn !== state.turnNumber && state.activePlayerId === player.id) {
      const renforce = resolveEffect(
        { ...nextState, players: nextState.players.map((p) => (p.id === player.id ? { ...p, cheapUnitBuffTurn: state.turnNumber } : p)) as [PlayerState, PlayerState] },
        { type: "buff", target: { kind: "self" }, attackAmount: { kind: "flat", value: calme.attack }, healthAmount: { kind: "flat", value: calme.health }, permanent: true },
        { controllerId: player.id, sourceInstanceId: boardUnit.instanceId, turnNumber: state.turnNumber }
      );
      nextState = renforce.state;
      events.push(...renforce.events);
    }
  } else {
    // Équipement consommable (`permanent: false`) : part directement au
    // cimetière après résolution. Aucune autre carte ne prend cette voie —
    // Action et Réaction n'existent plus comme types de carte.
    const owner = getPlayer(nextState, player.id);
    nextState = {
      ...nextState,
      players: nextState.players.map((p) =>
        p.id === owner.id
          ? recordGraveyardArrival(
              { ...owner, graveyard: [...owner.graveyard, instance] },
              { cardId: instance.cardId, instanceId: instance.instanceId, turnNumber: state.turnNumber, fromZone: "hand" }
            )
          : p
      ) as [PlayerState, PlayerState],
    };
    // Pas de cause de cimetière ici : un Équipement consommable est
    // "utilisé", pas défaussé/détruit/sabordé au sens de la traçabilité
    // (Notion "Moteur de partie", section "Défausse").
  }

  // « À son arrivée, elle subit 1 dégât » (La Mauvaise Réputation) : un
  // effet de celui qui a posé la réduction — ses propres dégâts, donc, pour
  // tout ce qui regarde « l'un de vos effets ».
  for (const discount of degatsArrivee) {
    const blessee = resolveEffect(
      nextState,
      { type: "damage", target: { kind: "self" }, amount: { kind: "flat", value: discount.arrivalDamage! } },
      { controllerId: discount.grantedBy ?? player.id, sourceInstanceId: instance.instanceId, turnNumber: state.turnNumber }
    );
    nextState = blessee.state;
    events.push(...blessee.events);
  }

  const context: EffectContext = {
    controllerId: player.id,
    sourceInstanceId: isUnitCard(def.type) || asPermanent ? instance.instanceId : undefined,
    chosenTargetInstanceId: action.targetInstanceId,
    chosenGraveyardInstanceId: action.chosenGraveyardInstanceId,
    turnNumber: state.turnNumber,
  };

  const played = resolveEffectSequence(nextState, def.onPlayEffects ?? [], context);
  nextState = played.state;
  events.push(...played.events);
  const playEffectEvents: GameEvent[] = [...played.events];

  // Les corps invoqués par la carte (ex: Fesses en Avant !) arrivent eux
  // aussi en jeu : les capacités qui guettent une arrivée doivent les voir.
  const summonedOnPlay = processSummonEnterTriggers(nextState, playEffectEvents, state.turnNumber);
  nextState = summonedOnPlay.state;
  events.push(...summonedOnPlay.events);

  // Marionnettes renvoyées en main par la pose : même raison.
  const recalledOnPlay = processReturnedToHandTriggers(nextState, playEffectEvents, state.turnNumber);
  nextState = recalledOnPlay.state;
  events.push(...recalledOnPlay.events);

  // Cartes défaussées par la pose (Lot 13) : « quand cette carte est
  // défaussée » et les observateurs du Cimetière doivent la voir partir.
  const discardedOnPlay = processGraveyardEntryTriggers(nextState, playEffectEvents, state.turnNumber);
  nextState = discardedOnPlay.state;
  events.push(...discardedOnPlay.events);

  // Cartes repêchées au Cimetière par la pose (ex: Tu viens jouer ?).
  const recoveredOnPlay = processGraveyardRecoveryTriggers(nextState, playEffectEvents, state.turnNumber);
  nextState = recoveredOnPlay.state;
  events.push(...recoveredOnPlay.events);

  const cardPlayedTrigger = processTrigger(
    nextState,
    { trigger: "onCardPlayed", playerId: player.id, cardId: def.id, sourceInstanceId: instance.instanceId },
    state.turnNumber
  );
  nextState = cardPlayedTrigger.state;
  events.push(...cardPlayedTrigger.events);

  // Tout PERMANENT qui arrive déclenche `onEnterPlay` — pas seulement les
  // unités : une Structure ou un Objet d'archétype "arrive en jeu" lui
  // aussi, et les cartes qui guettent l'arrivée d'un membre de leur
  // famille doivent le voir (Lot 10 Cra-Poiscail).
  if (isUnitCard(def.type) || asPermanent) {
    const enterPlayTrigger = processTrigger(
      nextState,
      { trigger: "onEnterPlay", playerId: player.id, cardId: def.id, sourceInstanceId: instance.instanceId },
      state.turnNumber
    );
    nextState = enterPlayTrigger.state;
    events.push(...enterPlayTrigger.events);

    // « Éveil — … » (Lot 16) se résout à l'arrivée, juste après les
    // capacités d'arrivée : c'est le premier Éveil de la carte ce tour.
    const eveil = runEveilOnArrival(nextState, instance.instanceId, state.turnNumber);
    nextState = eveil.state;
    events.push(...eveil.events);
  }

  // « Lorsqu'elle devient visible » : une Structure posée pendant un état où
  // elle est DÉJÀ visible apparaît à cet instant — sans quoi son effet
  // n'existerait qu'au prochain changement de Marée, et poser la carte au
  // bon moment la punirait. Vaut pour TOUTE Structure, y compris celle
  // « visible pendant toutes les Marées » (sans `visibleDuringTide`) : elle
  // aussi apparaît à l'adversaire en arrivant (Contremaître des Amarres).
  if ((def.visibleDuringTide || def.type === "structure") && isVisibleDuringTide(def, nextState.environment.tideState)) {
    events.push({
      ...base,
      type: "STRUCTURE_REVEALED",
      playerId: player.id,
      instanceId: instance.instanceId,
      cardId: def.id,
    });
    const revealedTrigger = processTrigger(
      nextState,
      { trigger: "onBecomeVisible", playerId: player.id, cardId: def.id, sourceInstanceId: instance.instanceId },
      state.turnNumber
    );
    nextState = revealedTrigger.state;
    events.push(...revealedTrigger.events);
  }

  return { ok: true, state: nextState, events };
}

/**
 * Joue un Objet (règle du 13/10/2026) : il est payé — coût imprimé moins
 * réductions, plus la taxe adverse —, quitte la main et monte sur la pile
 * Chaîne sans jamais occuper d'emplacement. L'adversaire peut y répondre
 * (Sabotage Discret) ; sinon il se résout aussitôt et, s'il aboutit, il est
 * Brisé (`game/chain/chainStack.ts`).
 */
function playObject(state: GameState, action: PlayCardAction, instance: PlayerState["hand"][number], def: CardDefinition): ActionResult {
  const turnNumber = state.turnNumber;
  const base = { turnNumber, timestamp: Date.now() };
  const events: GameEvent[] = [];

  const tax = objectPlayTax(state, action.playerId, turnNumber);
  const payment = payReasonCost(state, action.playerId, effectiveCost(def, state, action.playerId, instance.instanceId) + tax.amount, turnNumber);
  let nextState = consumeCostDiscounts(payment.state, action.playerId, def, instance.instanceId);
  nextState = markTurnDiscountsUsed(nextState, action.playerId, turnDiscounts(state, action.playerId, def, instance.instanceId).map((d) => d.key));
  nextState = consumeObjectPlayTax(nextState, tax, turnNumber);
  nextState = recordObjectPlayed(nextState, action.playerId, def.name);
  events.push({ ...base, type: "PLAY_CARD", playerId: action.playerId, instanceId: instance.instanceId, cardId: def.id });
  events.push({ ...base, type: "REASON_CHANGED", playerId: action.playerId, delta: -payment.paid });

  const pushed = pushChainLink(nextState, {
    id: instance.instanceId,
    playerId: action.playerId,
    card: instance,
    ...(action.targetInstanceId ? { targetInstanceId: action.targetInstanceId } : {}),
    ...(action.chosenGraveyardInstanceId ? { chosenGraveyardInstanceId: action.chosenGraveyardInstanceId } : {}),
    ...(action.dieDelta !== undefined ? { dieDelta: action.dieDelta } : {}),
    turnNumber,
  });
  nextState = pushed.state;
  events.push(...pushed.events);

  // « Quand vous jouez un Objet » (L'Aventurière en retard) : il vient de l'être.
  const joue = processTrigger(nextState, { trigger: "onCardPlayed", playerId: action.playerId, cardId: def.id, sourceInstanceId: instance.instanceId }, turnNumber);
  nextState = joue.state;
  events.push(...joue.events);

  // Quelqu'un peut répondre : la pile attend. Sinon, elle se résout.
  const link = nextState.chainStack![nextState.chainStack!.length - 1]!;
  const reponse = openChainResponse(nextState, link);
  if (reponse.state.pendingReaction) return { ok: true, state: reponse.state, events: [...events, ...reponse.events] };
  const resolue = runChain(nextState);
  return { ok: true, state: resolue.state, events: [...events, ...resolue.events] };
}
