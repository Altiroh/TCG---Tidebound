import {
  hasResistance,
  isVisibleDuringTide,
  type CardDefinition,
  type CardInstance,
  type StatModifierDuration,
} from "@/game/cards/types";
import { canBeEquipTarget, getCardDefinition } from "@/game/cards/sets/core";
import { countArchetypeUnits } from "@/game/cards/archetypes";
import { getShipDefinition } from "@/game/environment/shipData";
import { forceTideJumpToAbysses, forceTideTransition, tickTide } from "@/game/environment/tide";
import { isEligibleChosenUnit } from "@/game/effects/chosenTargets";
import type { EffectAmount, EffectDefinition } from "@/game/effects/types";
import type { GameEvent } from "@/game/events/types";
import { nextInt, type RngState } from "@/game/rng";
import { reduceReasonGain } from "@/game/state/anomalies";
import { reasonAfterLoss, reasonCeiling } from "@/game/state/reason";
import { markOncePerTurnUsed, oncePerTurnAvailable } from "@/game/state/oncePerTurn";
import {
  consumeEquippedEffectDamageShield,
  consumeOwnDamageTakenShield,
  consumeReasonLossShield,
  consumeStructureResistanceRestoreShield,
} from "@/game/state/shields";
import {
  getOpponent,
  getPlayer,
  MIN_DISCOUNTED_COST,
  STATUS_NO_REASON_GAIN,
  type CostDiscount,
  type GameState,
  type PlayerId,
  type PlayerState,
} from "@/game/state/types";

/**
 * Renvoie un permanent du board vers la main de son propriétaire.
 *
 * L'exemplaire qui revient est NEUF : dégâts, modificateurs, durée,
 * statuts et drapeaux « une fois par tour » sont remis à zéro. C'est la
 * lecture naturelle de « renvoyez-la dans votre main » — la carte
 * redevient une carte en main, pas une unité blessée rangée de côté — et
 * c'est ce qui rend la boucle du Théâtre jouable sans accumuler d'état.
 *
 * L'`instanceId` change aussi : conserver l'ancien laisserait des
 * références pendantes (Équipements attachés, capacités qui suivent une
 * instance) pointer sur une carte qui n'est plus en jeu.
 */
function returnPermanentToHand(
  state: GameState,
  ownerId: PlayerId,
  instanceId: string
): { state: GameState; events: GameEvent[]; returned: CardInstance | null } {
  const owner = getPlayer(state, ownerId);
  const unit = owner.board.find((u) => u.instanceId === instanceId);
  if (!unit) return { state, events: [], returned: null };

  const fresh: CardInstance = {
    instanceId: `${unit.instanceId}:hand:${state.turnNumber}`,
    cardId: unit.cardId,
    ownerId: unit.ownerId,
    damageMarked: 0,
    modifiers: [],
    summoningSick: false,
    hasAttackedThisTurn: false,
    ...(unit.illustrationVariant !== undefined ? { illustrationVariant: unit.illustrationVariant } : {}),
  };

  // Un Équipement dont le porteur quitte le board n'équipe plus rien :
  // `processDeaths` le ramasse au prochain passage (`destroyOrphanedEquipment`),
  // exactement comme lorsque le porteur meurt.
  const nextState = replacePlayer(state, {
    ...owner,
    board: owner.board.filter((u) => u.instanceId !== instanceId),
    hand: [...owner.hand, fresh],
  });

  const events: GameEvent[] = [
    {
      type: "CARD_MOVED",
      instanceId,
      fromZone: "board",
      toZone: "hand",
      cardId: unit.cardId,
      toInstanceId: fresh.instanceId,
      ownerId: unit.ownerId,
      turnNumber: state.turnNumber,
      timestamp: 0,
    },
  ];

  return { state: nextState, events, returned: fresh };
}

/** Une réduction de coût s'applique-t-elle à cette carte ? */
export function discountApplies(discount: CostDiscount, def: CardDefinition, turnNumber: number): boolean {
  if (discount.uses <= 0) return false;
  if (turnNumber > discount.expiresAfterTurn) return false;
  if (discount.subtype && def.subtype !== discount.subtype) return false;
  if (discount.cardTypes && !discount.cardTypes.includes(def.type)) return false;
  return true;
}

/** Contexte de résolution : qui a causé l'effet, et quelle cible a été
 * choisie par le joueur (résolue et validée avant d'appeler ce module). */
export interface EffectContext {
  controllerId: PlayerId;
  sourceInstanceId?: string;
  chosenTargetInstanceId?: string;
  /** instanceId d'une carte de la DÉFAUSSE choisie par le joueur (`moveGraveyardCardToHand`, ex: Grappin de Récupération) — toujours dans la défausse de `controllerId`, jamais celle de l'adversaire. */
  chosenGraveyardInstanceId?: string;
  /** Résolution d'un `onBreakEffects` déclenché par un Bris DEPUIS LA MAIN (`breakObject` avec `fromHand`) — lu par `conditionBrokenFromHand` (ex: Le Seau). */
  brokenFromHand?: boolean;
  /** Carte qui a DÉCLENCHÉ la capacité en cours d'exécution (capacités d'observateur) — cible `{ kind: "triggerSource" }`. */
  triggerSourceInstanceId?: string;
  turnNumber: number;
}

/** Types acceptés par `EffectDefinition.filter` pour une carte candidate — `undefined` = aucune restriction de type. */
function matchesCardTypeFilter(filter: EffectDefinition["filter"], cardType: string): boolean {
  const allowed = filter?.cardTypes ?? (filter?.cardType ? [filter.cardType] : undefined);
  return !allowed || (allowed as readonly string[]).includes(cardType);
}

/**
 * « Une carte <sous-type> a-t-elle rejoint votre Cimetière ce tour / depuis
 * votre dernier tour ? » — lecture du journal horodaté (Lot 13). Partagée
 * par la condition de CAPACITÉ (`triggerBus`) et celle d'EFFET.
 */
export function hasGraveyardArrival(
  state: GameState,
  controllerId: PlayerId,
  condition: NonNullable<EffectDefinition["conditionGraveyardArrival"]>
): boolean {
  const controller = state.players.find((p) => p.id === controllerId);
  // « ce tour » = le tour de table courant ; « depuis votre dernier tour »
  // remonte d'un tour de plus, celui de l'adversaire.
  const since = condition.since === "thisTurn" ? state.turnNumber : state.turnNumber - 1;
  return (controller?.graveyardArrivals ?? []).some((entry) => {
    if (entry.turnNumber < since) return false;
    if (condition.fromZone && entry.fromZone !== condition.fromZone) return false;
    if (condition.cardIds && !condition.cardIds.includes(entry.cardId)) return false;
    if (condition.subtype && getCardDefinition(entry.cardId).subtype !== condition.subtype) return false;
    return true;
  });
}

export interface EffectResolution {
  state: GameState;
  events: GameEvent[];
}

/**
 * Valeur numérique d'un montant d'effet. `state` n'est requis que pour les
 * montants CONTEXTUELS — aujourd'hui `incomingAttackDamage`, qui lit
 * l'attaque suspendue. Un montant plat n'en a pas besoin, d'où l'argument
 * optionnel plutôt qu'une signature imposée aux vingt autres appels.
 */
function amountValue(amount: EffectAmount | undefined, state?: GameState): number {
  if (amount === undefined) return 0;
  if (amount.kind === "incomingAttackDamage") return state?.pendingAttack?.attackerPower ?? 0;
  return amount.value;
}

/**
 * Révèle jusqu'à `amount` cartes aléatoires DISTINCTES de la main de
 * `targetPlayerId` (moins si sa main en contient moins) : émet un
 * `HAND_CARD_REVEALED` par carte, sans autre effet sur l'état (ex: Guetteur
 * de Brume, La Bouée qui Regardait). Factorisé pour être appelable aussi
 * bien depuis `case "revealRandomHandCards"` que directement depuis
 * `game/triggers/triggerBus.ts` (Guetteur de Brume, hors du pipeline
 * d'effets habituel — cf. commentaire sur place).
 */
export function revealRandomHandCards(
  state: GameState,
  targetPlayerId: PlayerId,
  amount: number,
  turnNumber: number
): EffectResolution {
  const events: GameEvent[] = [];
  const base = { turnNumber, timestamp: Date.now() };
  const player = getPlayer(state, targetPlayerId);
  const pool = [...player.hand];
  const count = Math.min(amount, pool.length);
  let rngState = state.rngState;

  for (let i = 0; i < count; i++) {
    const draw = nextInt(rngState, pool.length);
    rngState = draw.nextState;
    const [card] = pool.splice(draw.value, 1);
    events.push({ ...base, type: "HAND_CARD_REVEALED", ownerId: player.id, instanceId: card!.instanceId, cardId: card!.cardId });
  }

  return { state: { ...state, rngState }, events };
}

function replacePlayer(state: GameState, updated: PlayerState): GameState {
  return {
    ...state,
    players: state.players.map((p) => (p.id === updated.id ? updated : p)) as [
      PlayerState,
      PlayerState
    ],
  };
}

function replaceUnit(
  state: GameState,
  ownerId: PlayerId,
  instanceId: string,
  updater: (unit: CardInstance) => CardInstance
): GameState {
  const owner = getPlayer(state, ownerId);
  const board = owner.board.map((u) => (u.instanceId === instanceId ? updater(u) : u));
  return replacePlayer(state, { ...owner, board });
}

/** `getCardDefinition` sans lever : un cardId inconnu ne casse pas une résolution. */
function safeCardDefinition(cardId: string): CardDefinition | undefined {
  try {
    return getCardDefinition(cardId);
  } catch {
    return undefined;
  }
}

function findUnitOwner(state: GameState, instanceId: string): PlayerState | undefined {
  return state.players.find((p) => p.board.some((u) => u.instanceId === instanceId));
}

/**
 * Résout les unités ciblées par un sélecteur, en tant que paires (unité,
 * propriétaire) — ET l'état du RNG résultant. Retourne toujours
 * `state.rngState` inchangé pour un sélecteur non aléatoire : renvoyer
 * cette valeur systématiquement (plutôt que `undefined`/optionnel) évite
 * à chaque appelant de devoir distinguer "a tiré au hasard" de "non",
 * puisqu'il doit de toute façon reporter CE `rngState` dans l'état qu'il
 * retourne pour que le tirage suivant reparte d'une graine différente
 * (corrige un bug où `randomAllyUnit`/`randomEnemyUnit` tiraient
 * toujours la même unité "aléatoire" tant que rien d'autre ne faisait
 * avancer la graine).
 */
function resolveUnitTargets(
  state: GameState,
  effect: EffectDefinition,
  context: EffectContext
): { targets: Array<{ unit: CardInstance; ownerId: PlayerId }>; rngState: RngState } {
  const controller = getPlayer(state, context.controllerId);
  const opponent = getOpponent(state, context.controllerId);
  const noDraw = (targets: Array<{ unit: CardInstance; ownerId: PlayerId }>) => ({ targets, rngState: state.rngState });

  switch (effect.target.kind) {
    case "self": {
      if (!context.sourceInstanceId) return noDraw([]);
      const owner = findUnitOwner(state, context.sourceInstanceId);
      const unit = owner?.board.find((u) => u.instanceId === context.sourceInstanceId);
      return noDraw(unit && owner ? [{ unit, ownerId: owner.id }] : []);
    }
    case "allyUnitsWithCardIds": {
      const controller = getPlayer(state, context.controllerId);
      const wanted = effect.target.kind === "allyUnitsWithCardIds" ? effect.target.cardIds : [];
      return noDraw(
        controller.board.filter((u) => wanted.includes(u.cardId)).map((unit) => ({ unit, ownerId: controller.id }))
      );
    }
    case "triggerSource": {
      if (!context.triggerSourceInstanceId) return noDraw([]);
      const owner = findUnitOwner(state, context.triggerSourceInstanceId);
      const unit = owner?.board.find((u) => u.instanceId === context.triggerSourceInstanceId);
      return noDraw(unit && owner ? [{ unit, ownerId: owner.id }] : []);
    }
    case "equippedUnit": {
      // L'Équipement source porte la référence : on remonte vers le
      // permanent qu'il équipe, sur le plateau de son contrôleur.
      if (!context.sourceInstanceId) return noDraw([]);
      const owner = findUnitOwner(state, context.sourceInstanceId);
      const equipment = owner?.board.find((u) => u.instanceId === context.sourceInstanceId);
      const carried = equipment?.attachedToInstanceId
        ? owner?.board.find((u) => u.instanceId === equipment.attachedToInstanceId)
        : undefined;
      return noDraw(carried && owner ? [{ unit: carried, ownerId: owner.id }] : []);
    }
    case "chosenUnit": {
      if (!context.chosenTargetInstanceId) return noDraw([]);
      // Le choix du joueur passe par le MÊME filtre que celui qui a servi
      // à proposer la capacité : un "choisissez un Cra-Poiscail" ne se
      // résout pas sur une carte hors famille, même si l'action arrive
      // d'un client qui l'aurait proposée à tort.
      if (
        !isEligibleChosenUnit(
          state,
          effect.target,
          context.controllerId,
          context.chosenTargetInstanceId,
          context.sourceInstanceId
        )
      ) {
        return noDraw([]);
      }
      const owner = findUnitOwner(state, context.chosenTargetInstanceId);
      const unit = owner?.board.find((u) => u.instanceId === context.chosenTargetInstanceId);
      return noDraw(unit && owner ? [{ unit, ownerId: owner.id }] : []);
    }
    case "shotTarget": {
      // Aucun permanent désigné : le tir visait le Navire adverse, il n'y a
      // donc pas d'unité à toucher (cf. `resolvePlayerTargets`).
      if (!context.chosenTargetInstanceId) return noDraw([]);
      const owner = findUnitOwner(state, context.chosenTargetInstanceId);
      const unit = owner?.board.find((u) => u.instanceId === context.chosenTargetInstanceId);
      return noDraw(unit && owner ? [{ unit, ownerId: owner.id }] : []);
    }
    case "allAllyUnits":
      return noDraw(controller.board.map((unit) => ({ unit, ownerId: controller.id })));
    case "allEnemyUnits":
      return noDraw(opponent.board.map((unit) => ({ unit, ownerId: opponent.id })));
    case "allUnits":
      return noDraw([
        ...controller.board.map((unit) => ({ unit, ownerId: controller.id })),
        ...opponent.board.map((unit) => ({ unit, ownerId: opponent.id })),
      ]);
    case "randomAllyUnit": {
      if (controller.board.length === 0) return noDraw([]);
      const draw = nextInt(state.rngState, controller.board.length);
      const unit = controller.board[draw.value]!;
      return { targets: [{ unit, ownerId: controller.id }], rngState: draw.nextState };
    }
    case "randomEnemyUnit": {
      if (opponent.board.length === 0) return noDraw([]);
      const draw = nextInt(state.rngState, opponent.board.length);
      const unit = opponent.board[draw.value]!;
      return { targets: [{ unit, ownerId: opponent.id }], rngState: draw.nextState };
    }
    default:
      return noDraw([]);
  }
}

function resolvePlayerTargets(
  state: GameState,
  effect: EffectDefinition,
  context: EffectContext
): PlayerState[] {
  switch (effect.target.kind) {
    case "controllerPlayer":
      return [getPlayer(state, context.controllerId)];
    case "opponentPlayer":
      return [getOpponent(state, context.controllerId)];
    // Tir sans permanent désigné = tir sur le Navire adverse, exactement
    // comme une attaque directe. Un permanent désigné rend la main à
    // `resolveUnitTargets` : le même effet frappe l'un OU l'autre.
    case "shotTarget":
      return context.chosenTargetInstanceId ? [] : [getOpponent(state, context.controllerId)];
    case "allPlayers":
      return [...state.players];
    default:
      return [];
  }
}

function resolveSinglePlayerTarget(
  state: GameState,
  effect: EffectDefinition,
  context: EffectContext
): PlayerState | undefined {
  return resolvePlayerTargets(state, effect, context)[0];
}

/** Clé `oncePerTurnFlags` de l'amplification de réduction de Marée (`amplifyTideReductionOncePerTurnWhileVisible`). */
const AMPLIFY_TIDE_REDUCTION_KEY = "amplifyTideReduction";

/** Résout un effet unique et retourne le nouvel état + les événements produits. */
export function resolveEffect(
  state: GameState,
  effect: EffectDefinition,
  context: EffectContext
): EffectResolution {
  const events: GameEvent[] = [];
  const base = { turnNumber: context.turnNumber, timestamp: Date.now() };

  if (effect.conditionTideStateIn && !effect.conditionTideStateIn.includes(state.environment.tideState)) {
    return { state, events };
  }
  if (effect.conditionOrientationIs && state.environment.tideOrientation !== effect.conditionOrientationIs) {
    return { state, events };
  }
  if (effect.conditionControllerReasonBelowOpponent) {
    const controller = getPlayer(state, context.controllerId);
    const opponent = getOpponent(state, context.controllerId);
    if (!(controller.reason < opponent.reason)) return { state, events };
  }
  if (effect.conditionControllerReasonAtMost !== undefined) {
    const controller = getPlayer(state, context.controllerId);
    if (controller.reason > effect.conditionControllerReasonAtMost) return { state, events };
  }
  if (effect.conditionBrokenFromHand !== undefined && effect.conditionBrokenFromHand !== Boolean(context.brokenFromHand)) {
    return { state, events };
  }
  if (effect.conditionControlsAllCardIds) {
    const controller = getPlayer(state, context.controllerId);
    const owned = new Set(controller.board.map((u) => u.cardId));
    // Chaque entrée doit être satisfaite ; une entrée en LISTE accepte
    // n'importe laquelle de ses cartes — « un Chevalier », standard ou
    // Abyssal, reste un Chevalier (décision du 17/09/2026).
    const satisfied = effect.conditionControlsAllCardIds.every((entry) =>
      Array.isArray(entry) ? entry.some((cardId) => owned.has(cardId)) : owned.has(entry)
    );
    if (!satisfied) return { state, events };
  }
  if (effect.conditionControlsAnyCardIds) {
    const controller = getPlayer(state, context.controllerId);
    if (!controller.board.some((u) => effect.conditionControlsAnyCardIds!.includes(u.cardId))) return { state, events };
  }
  if (effect.conditionControlledArchetypeAtLeast) {
    const { archetype, count, excludeSelf } = effect.conditionControlledArchetypeAtLeast;
    const controller = getPlayer(state, context.controllerId);
    const owned = countArchetypeUnits(controller.board, archetype, {
      excludeInstanceId: excludeSelf ? context.sourceInstanceId : undefined,
    });
    if (owned < count) return { state, events };
  }
  if (effect.conditionSelfVisible) {
    const owner = context.sourceInstanceId ? findUnitOwner(state, context.sourceInstanceId) : undefined;
    const source = owner?.board.find((u) => u.instanceId === context.sourceInstanceId);
    if (!source || !isVisibleDuringTide(getCardDefinition(source.cardId), state.environment.tideState)) {
      return { state, events };
    }
  }
  if (effect.conditionEquippedUnitVisible || effect.conditionEquippedUnitAttackedThisTurn) {
    // Le porteur d'un Équipement : introuvable (Équipement jamais attaché,
    // porteur déjà parti) = condition non remplie.
    const owner = context.sourceInstanceId ? findUnitOwner(state, context.sourceInstanceId) : undefined;
    const source = owner?.board.find((u) => u.instanceId === context.sourceInstanceId);
    const holder = source?.attachedToInstanceId ? owner?.board.find((u) => u.instanceId === source.attachedToInstanceId) : undefined;
    if (!holder) return { state, events };
    if (effect.conditionEquippedUnitVisible && !isVisibleDuringTide(getCardDefinition(holder.cardId), state.environment.tideState)) {
      return { state, events };
    }
    if (effect.conditionEquippedUnitAttackedThisTurn && !holder.hasAttackedThisTurn) return { state, events };
  }
  if (effect.conditionGraveyardArrival) {
    if (!hasGraveyardArrival(state, context.controllerId, effect.conditionGraveyardArrival)) return { state, events };
  }
  if (effect.conditionControllerHandAtLeast !== undefined) {
    if (getPlayer(state, context.controllerId).hand.length < effect.conditionControllerHandAtLeast) return { state, events };
  }

  switch (effect.type) {
    case "damage": {
      // NOTE : ne déclenche PAS `onDamaged` (contrairement aux dégâts de
      // combat, `game/actions/attack.ts`) — `resolveEffect` est appelé
      // par `triggerBus.ts`, qui l'appellerait en retour : cycle de
      // dépendance à éviter. Pas encore nécessaire : aucune carte actuelle
      // ne réagit aux dégâts infligés par un effet plutôt qu'un combat.
      //
      // Seul appel à passer l'état : « autant de dégâts » (Cylindre
      // flottant) lit la Puissance de l'attaque qui vient d'être
      // interceptée.
      const amount = amountValue(effect.amount, state);
      const damageTargets = resolveUnitTargets(state, effect, context);
      let nextState = { ...state, rngState: damageTargets.rngState };

      for (const { unit, ownerId } of damageTargets.targets) {
        // Sans Résistance (un Objet), il n'y a rien à marquer : les
        // sélecteurs de masse (`allEnemyUnits`, `allUnits`, `random*Unit`)
        // balaient tout le board, Objets compris.
        if (!hasResistance(getCardDefinition(unit.cardId))) continue;
        // Boucliers "1ère fois par tour" (Baleine aux Cicatrices Blanches :
        // réduction directe ; Wood Vy : restauration après coup sur une
        // Structure alliée — équivalent net à une réduction supplémentaire,
        // cf. commentaire de `consumeStructureResistanceRestoreShield`).
        const selfShield = consumeOwnDamageTakenShield(nextState, ownerId, unit.instanceId, context.turnNumber);
        nextState = selfShield.state;
        let reduction = selfShield.reduction;
        // Casque-Coquille : ces dégâts-ci viennent bien d'un effet de
        // carte, pas d'un combat — l'Équipement les absorbe une fois puis
        // se détruit.
        const effectShield = consumeEquippedEffectDamageShield(nextState, ownerId, unit.instanceId, context.turnNumber);
        nextState = effectShield.state;
        reduction += effectShield.reduction;
        events.push(...effectShield.events);
        if (getCardDefinition(unit.cardId).type === "structure") {
          const restoreShield = consumeStructureResistanceRestoreShield(nextState, ownerId, context.turnNumber);
          nextState = restoreShield.state;
          reduction += restoreShield.restore;
        }
        const finalAmount = Math.max(0, amount - reduction);
        if (finalAmount <= 0) continue;

        nextState = replaceUnit(nextState, ownerId, unit.instanceId, (u) => ({
          ...u,
          damageMarked: u.damageMarked + finalAmount,
          // Retenue pour la mort : une unité qui meurt n'a plus de source à
          // interroger (cf. `DestructionCause`).
          lastDamageCause: "effect" as const,
        }));
        events.push({ ...base, type: "DAMAGE", targetInstanceId: unit.instanceId, amount: finalAmount });
      }

      for (const player of resolvePlayerTargets(state, effect, context)) {
        const current = getPlayer(nextState, player.id);
        nextState = replacePlayer(nextState, { ...current, anchor: current.anchor - amount });
        events.push({ ...base, type: "DAMAGE", targetPlayerId: player.id, amount, targetAnchorAfter: current.anchor - amount });
      }

      return { state: nextState, events };
    }

    case "heal": {
      const amount = amountValue(effect.amount);
      const healTargets = resolveUnitTargets(state, effect, context);
      let nextState = { ...state, rngState: healTargets.rngState };

      for (const { unit, ownerId } of healTargets.targets) {
        nextState = replaceUnit(nextState, ownerId, unit.instanceId, (u) => ({
          ...u,
          damageMarked: Math.max(0, u.damageMarked - amount),
        }));
        events.push({ ...base, type: "HEAL", targetInstanceId: unit.instanceId, amount });
      }

      for (const player of resolvePlayerTargets(state, effect, context)) {
        const current = getPlayer(nextState, player.id);
        nextState = replacePlayer(nextState, { ...current, anchor: current.anchor + amount });
        events.push({ ...base, type: "HEAL", targetPlayerId: player.id, amount });
      }

      return { state: nextState, events };
    }

    case "draw": {
      const amount = amountValue(effect.amount);
      const player = resolveSinglePlayerTarget(state, effect, context) ?? getPlayer(state, context.controllerId);
      let deck = [...player.deck];
      const hand = [...player.hand];
      let pendingOceanJudgment = state.pendingOceanJudgment;

      for (let i = 0; i < amount; i++) {
        const card = deck.shift();
        if (!card) {
          // Deck vide : pas de perte instantanée — déclenche le "Jugement de
          // l'Océan" (résolu en fin d'action par le moteur, voir game/engine.ts).
          pendingOceanJudgment = pendingOceanJudgment ?? { playerId: player.id };
          break;
        }
        hand.push(card);
        events.push({ ...base, type: "DRAW_CARD", playerId: player.id, instanceId: card.instanceId });
      }

      return {
        state: { ...replacePlayer(state, { ...player, deck, hand }), pendingOceanJudgment },
        events,
      };
    }

    case "discard": {
      const amount = amountValue(effect.amount);
      const player = resolveSinglePlayerTarget(state, effect, context) ?? getPlayer(state, context.controllerId);
      // Rien à défausser : le texte est déjà satisfait, on n'ouvre pas une
      // question sans réponse possible.
      if (amount <= 0 || player.hand.length === 0) return { state, events };

      // « Défaussez 1 carte » ne dit pas LAQUELLE : c'est au joueur de le
      // dire. L'effet ne défausse donc rien lui-même — il pose la question
      // (`pendingChoice`), et `resolveChoice` fait partir les cartes
      // désignées par la voie unique (`game/state/discard.ts`). La suite de
      // la séquence est accrochée au choix par `resolveEffectSequence` :
      // un « si vous le faites… » ne peut pas se résoudre avant la réponse.
      return {
        state: {
          ...state,
          pendingChoice: {
            kind: "handDiscard",
            playerId: player.id,
            count: Math.min(amount, player.hand.length),
            refusable: effect.refusable === true,
            sourceInstanceId: context.sourceInstanceId,
            turnNumber: context.turnNumber,
          },
        },
        events,
      };
    }

    // Détruire et Saborder ne RETIRENT pas la carte ici : ils la marquent, et
    // `processDeaths` — la voie unique de sortie, exécutée après chaque action
    // par `dispatch` — envoie au cimetière, émet les événements, applique les
    // substitutions et réveille `onSaborde`/`onDeath`.
    case "destroy":
    case "saborde": {
      const removalTargets = resolveUnitTargets(state, effect, context);
      let nextState = { ...state, rngState: removalTargets.rngState };
      const removal = effect.type === "saborde" ? ("scuttled" as const) : ("destroyed" as const);
      for (const { unit, ownerId } of removalTargets.targets) {
        nextState = replaceUnit(nextState, ownerId, unit.instanceId, (u) => ({ ...u, pendingRemoval: removal }));
      }
      return { state: nextState, events };
    }

    case "summon": {
      if (!effect.cardId) return { state, events };
      const player = resolveSinglePlayerTarget(state, effect, context) ?? getPlayer(state, context.controllerId);
      const summonedDef = getCardDefinition(effect.cardId); // valide l'existence de la carte à invoquer

      // Les Slots du Navire s'appliquent à l'invocation comme à la pose :
      // on remplit les places libres et on s'arrête là ("on n'invoque pas
      // plus qu'il n'en tient", décision du 2026-09-14). Une invocation qui
      // ne tient pas du tout n'est pas une erreur — elle ne produit
      // simplement aucun corps.
      const freeSlots = Math.max(0, getShipDefinition(player.shipId).slotCount - player.board.length);
      const wanted = Math.max(0, effect.count ?? 1);
      const toSummon = Math.min(wanted, freeSlots);
      if (toSummon === 0) return { state, events };

      let rngState = state.rngState;
      const summoned: CardInstance[] = [];

      for (let i = 0; i < toSummon; i++) {
        // Identifiant ET variante visuelle tirés du RNG de la partie, jamais
        // de `Math.random()` : l'état doit être rejouable à l'identique, et
        // en ligne les deux joueurs doivent voir le même jeton.
        const idDraw = nextInt(rngState, 0xffffff);
        rngState = idDraw.nextState;

        let illustrationVariant: number | undefined;
        if (summonedDef.illustrationVariants && summonedDef.illustrationVariants > 1) {
          const variantDraw = nextInt(rngState, summonedDef.illustrationVariants);
          rngState = variantDraw.nextState;
          illustrationVariant = variantDraw.value + 1;
        }

        summoned.push({
          instanceId: `inst_summon_${idDraw.value.toString(36)}_${i}`,
          cardId: effect.cardId,
          ownerId: player.id,
          damageMarked: 0,
          modifiers: [],
          // Ruée (`rush`) : le corps invoqué peut attaquer le tour même.
          summoningSick: !effect.rush,
          hasAttackedThisTurn: false,
          ...(illustrationVariant !== undefined ? { illustrationVariant } : {}),
        });
      }

      for (const token of summoned) {
        events.push({ ...base, type: "SUMMON", playerId: player.id, instanceId: token.instanceId, cardId: token.cardId });
      }

      // Bonus accordé aux corps qui viennent d'arriver (ex: Le Grand Saut).
      const buffed = effect.summonBuff
        ? summoned.map((token) => ({
            ...token,
            modifiers: [
              ...token.modifiers,
              {
                id: `mod_summon_${token.instanceId}`,
                source: effect.cardId ?? "summon",
                attack: effect.summonBuff?.attackAmount ?? 0,
                health: effect.summonBuff?.healthAmount ?? 0,
                duration: (effect.duration ?? "endOfTurn") as StatModifierDuration,
              },
            ],
          }))
        : summoned;

      const board = [...player.board, ...buffed];
      return { state: { ...replacePlayer(state, { ...player, board }), rngState }, events };
    }

    case "buff": {
      const fallback = amountValue(effect.amount);
      const attackDelta = effect.attackAmount ? amountValue(effect.attackAmount) : fallback;
      const healthDelta = effect.healthAmount ? amountValue(effect.healthAmount) : fallback;
      const duration = effect.duration ?? (effect.permanent ? "permanent" : "endOfTurn");
      const buffTargets = resolveUnitTargets(state, effect, context);
      let nextState = { ...state, rngState: buffTargets.rngState };
      for (const { unit, ownerId } of buffTargets.targets) {
        nextState = replaceUnit(nextState, ownerId, unit.instanceId, (u) => ({
          ...u,
          modifiers: [
            ...u.modifiers,
            {
              id: `mod_${Math.random().toString(36).slice(2, 8)}`,
              source: effect.cardId ?? "unknown",
              attack: attackDelta,
              health: healthDelta,
              duration,
              ...(effect.grantKeywords ? { keywords: effect.grantKeywords } : {}),
            },
          ],
        }));
        events.push({ ...base, type: "BUFF_APPLIED", targetInstanceId: unit.instanceId, attack: attackDelta, health: healthDelta });
      }
      return { state: nextState, events };
    }

    case "debuff": {
      const fallback = amountValue(effect.amount);
      const attackDelta = effect.attackAmount ? amountValue(effect.attackAmount) : fallback;
      const healthDelta = effect.healthAmount ? amountValue(effect.healthAmount) : 0;
      const duration = effect.duration ?? (effect.permanent ? "permanent" : "endOfTurn");
      const debuffTargets = resolveUnitTargets(state, effect, context);
      let nextState = { ...state, rngState: debuffTargets.rngState };
      for (const { unit, ownerId } of debuffTargets.targets) {
        nextState = replaceUnit(nextState, ownerId, unit.instanceId, (u) => ({
          ...u,
          modifiers: [
            ...u.modifiers,
            {
              id: `mod_${Math.random().toString(36).slice(2, 8)}`,
              source: effect.cardId ?? "unknown",
              attack: -attackDelta,
              health: -healthDelta,
              duration,
            },
          ],
        }));
        events.push({ ...base, type: "DEBUFF_APPLIED", targetInstanceId: unit.instanceId, attack: -attackDelta, health: -healthDelta });
      }
      return { state: nextState, events };
    }

    case "reasonGain": {
      const rawAmount = amountValue(effect.amount);
      const targets = resolvePlayerTargets(state, effect, context);
      const players = targets.length > 0 ? targets : [getPlayer(state, context.controllerId)];
      let nextState = state;
      for (const target of players) {
        const player = getPlayer(nextState, target.id);
        // "La Gueule Sous la Mer" : verrou total, prioritaire sur toute réduction.
        if (player.statusFlags.includes(STATUS_NO_REASON_GAIN)) continue;
        // "Le Chant Sous la Ligne" : réduit TOUT gain de Raison tant qu'elle est en jeu.
        const amount = reduceReasonGain(nextState, rawAmount);
        if (amount <= 0) continue;
        events.push({ ...base, type: "REASON_CHANGED", playerId: player.id, delta: amount });
        nextState = replacePlayer(nextState, { ...player, reason: Math.min(reasonCeiling(player), player.reason + amount) });
      }
      return { state: nextState, events };
    }

    case "reasonLoss": {
      const amount = amountValue(effect.amount);
      const targets = resolvePlayerTargets(state, effect, context);
      const players = targets.length > 0 ? targets : [getPlayer(state, context.controllerId)];
      let nextState = state;
      for (const target of players) {
        const shield = consumeReasonLossShield(nextState, target.id, context.turnNumber);
        nextState = shield.state;
        const finalAmount = Math.max(0, amount - shield.reduction);
        if (finalAmount <= 0) continue;
        const player = getPlayer(nextState, target.id);
        events.push({ ...base, type: "REASON_CHANGED", playerId: player.id, delta: -finalAmount });
        nextState = replacePlayer(nextState, { ...player, reason: reasonAfterLoss(player, finalAmount) });
      }
      return { state: nextState, events };
    }

    case "cancelIncomingAttack": {
      // Hors fenêtre d'interception, il n'y a rien à annuler — l'effet est
      // silencieusement sans objet plutôt qu'une erreur : une carte mal
      // écrite ne doit pas casser une partie.
      if (!state.pendingAttack) return { state, events };
      return {
        state: { ...state, pendingAttack: { ...state.pendingAttack, intercepted: true } },
        events: [...events, { ...base, type: "ATTACK_INTERCEPTED", attackerInstanceId: state.pendingAttack.attackerInstanceId }],
      };
    }

    case "durationLoss": {
      const amount = amountValue(effect.amount);
      const durationTargets = resolveUnitTargets(state, effect, context);
      let nextState = { ...state, rngState: durationTargets.rngState };

      for (const { unit, ownerId } of durationTargets.targets) {
        // Un permanent SANS durée n'a rien à perdre : ni erreur, ni
        // événement — l'effet passe simplement à côté.
        if (unit.turnsRemaining === undefined) continue;
        const after = Math.max(0, unit.turnsRemaining - amount);
        if (after === unit.turnsRemaining) continue;
        nextState = replaceUnit(nextState, ownerId, unit.instanceId, (u) => ({ ...u, turnsRemaining: after }));
        events.push({
          ...base,
          type: "DURATION_CHANGED",
          instanceId: unit.instanceId,
          delta: after - unit.turnsRemaining,
          turnsRemaining: after,
        });
      }

      return { state: nextState, events };
    }

    case "attachEquipment": {
      if (!context.sourceInstanceId || !context.chosenTargetInstanceId) return { state, events };

      const sourceOwner = findUnitOwner(state, context.sourceInstanceId);
      const sourceInstance = sourceOwner?.board.find((u) => u.instanceId === context.sourceInstanceId);
      if (!sourceOwner || !sourceInstance) return { state, events };
      const sourceDef = getCardDefinition(sourceInstance.cardId);

      const targetOwner = findUnitOwner(state, context.chosenTargetInstanceId);
      const target = targetOwner?.board.find((u) => u.instanceId === context.chosenTargetInstanceId);
      if (!target || !targetOwner || !canBeEquipTarget(sourceDef, targetOwner.board, target)) return { state, events };

      const nextState = replaceUnit(state, sourceOwner.id, context.sourceInstanceId, (u) => ({
        ...u,
        attachedToInstanceId: target.instanceId,
      }));
      return { state: nextState, events };
    }

    case "tideReduceDuration":
    case "tideExtendDuration": {
      let amount = amountValue(effect.amount) || 1;
      let nextState = state;
      if (effect.type === "tideReduceDuration") {
        // "La première réduction de durée que vous provoquez chaque tour est
        // augmentée de N" (Ancre de Tempête, visible) : lue sur le plateau du
        // contrôleur de l'effet, consommée pour le tour.
        const controller = getPlayer(state, context.controllerId);
        const amplifier = controller.board.find((u) => {
          const def = getCardDefinition(u.cardId);
          return (
            def.amplifyTideReductionOncePerTurnWhileVisible !== undefined &&
            isVisibleDuringTide(def, state.environment.tideState) &&
            oncePerTurnAvailable(u, AMPLIFY_TIDE_REDUCTION_KEY, context.turnNumber)
          );
        });
        if (amplifier) {
          amount += getCardDefinition(amplifier.cardId).amplifyTideReductionOncePerTurnWhileVisible ?? 0;
          nextState = replaceUnit(nextState, controller.id, amplifier.instanceId, (u) =>
            markOncePerTurnUsed(u, AMPLIFY_TIDE_REDUCTION_KEY, context.turnNumber)
          );
        }
      }
      const delta = effect.type === "tideReduceDuration" ? -amount : amount;
      const rawRemaining = nextState.environment.tideRemainingTurns + delta;
      // Régulateur de Courant (`advanceTideOnZero`) : la réduction qui fait
      // tomber la durée à 0 fait passer la Marée IMMÉDIATEMENT à l'état
      // suivant — même convention que `tideForceAdvance` (état, durée et
      // orientation changent ; les effets du nouvel état s'appliquent au
      // prochain tick de début de tour).
      if (effect.type === "tideReduceDuration" && effect.advanceTideOnZero && rawRemaining <= 0) {
        const tick = tickTide({ ...nextState.environment, tideRemainingTurns: 1 });
        events.push({
          ...base,
          type: "TIDE_ADVANCED",
          remainingTurns: tick.tideRemainingTurns,
          tideState: tick.tideState,
          tideOrientation: tick.tideOrientation,
          stateChanged: tick.stateChanged,
        });
        return {
          state: {
            ...nextState,
            environment: {
              ...nextState.environment,
              tideState: tick.tideState,
              tideRemainingTurns: tick.tideRemainingTurns,
              tideOrientation: tick.tideOrientation,
              tideIntensity: tick.tideIntensity,
              pendingTideModifiers: tick.pendingTideModifiers,
            },
          },
          events,
        };
      }
      // Sinon, un état ne progresse jamais "immédiatement" via cet effet : la
      // durée reste au minimum à 1, l'avancée réelle se fait via le tick de
      // début de tour (`resolveTideTurnStep`), pas ici.
      const tideRemainingTurns = Math.max(1, rawRemaining);
      // `TIDE_MODIFIED` : la Marée ne change pas d'état, mais elle vient
      // bien d'être manipulée — le journal doit le dire, et les quêtes
      // « Modifier la Marée » n'ont pas d'autre trace à observer.
      events.push({ ...base, type: "TIDE_MODIFIED", change: "duration", value: tideRemainingTurns });
      return {
        state: { ...nextState, environment: { ...nextState.environment, tideRemainingTurns } },
        events,
      };
    }

    case "tideSetIntensity": {
      const value = Math.max(1, amountValue(effect.amount));
      events.push({ ...base, type: "TIDE_MODIFIED", change: "intensity", value });
      return {
        state: { ...state, environment: { ...state.environment, tideIntensity: value } },
        events,
      };
    }

    case "tideModifyIntensity": {
      const delta = amountValue(effect.amount);
      const tideIntensity = Math.max(1, state.environment.tideIntensity + delta);
      events.push({ ...base, type: "TIDE_MODIFIED", change: "intensity", value: tideIntensity });
      return {
        state: { ...state, environment: { ...state.environment, tideIntensity } },
        events,
      };
    }

    case "tideMaintain":
    case "tideAmplifyNext": {
      const kind = effect.type === "tideMaintain" ? "maintain" : "amplify";
      const remainingTriggers = amountValue(effect.amount) || 1;
      events.push({ ...base, type: "TIDE_MODIFIED", change: kind, value: remainingTriggers });
      return {
        state: {
          ...state,
          environment: {
            ...state.environment,
            pendingTideModifiers: [...state.environment.pendingTideModifiers, { kind, remainingTriggers }],
          },
        },
        events,
      };
    }

    case "tideForceAdvance":
    case "tideForceRetreat": {
      // Simplification assumée : contrairement au tick de début de tour
      // (`resolveTideTurnStep`), cette transition forcée ne déclenche pas
      // `onTideStateEntered` ni les vérifications "devient visible" — seuls
      // l'état/la durée/l'orientation changent. À étendre si une carte
      // future combine forçage ET réaction à l'entrée dans le nouvel état.
      const tick = forceTideTransition(state.environment, effect.type === "tideForceAdvance" ? "avancer" : "reculer");
      events.push({
        ...base,
        type: "TIDE_ADVANCED",
        remainingTurns: tick.tideRemainingTurns,
        tideState: tick.tideState,
        tideOrientation: tick.tideOrientation,
        stateChanged: tick.stateChanged,
      });
      return {
        state: {
          ...state,
          environment: {
            ...state.environment,
            tideState: tick.tideState,
            tideRemainingTurns: tick.tideRemainingTurns,
            tideOrientation: tick.tideOrientation,
            tideIntensity: tick.tideIntensity,
            pendingTideModifiers: tick.pendingTideModifiers,
          },
        },
        events,
      };
    }

    case "tideInvertOrientation": {
      const tideOrientation = state.environment.tideOrientation === "montante" ? "descendante" : "montante";
      events.push({ ...base, type: "TIDE_ORIENTATION_CHANGED", orientation: tideOrientation });
      return {
        state: { ...state, environment: { ...state.environment, tideOrientation } },
        events,
      };
    }

    case "tideSetOrientation": {
      const tideOrientation = effect.forceTideOrientation;
      if (!tideOrientation || state.environment.tideOrientation === tideOrientation) return { state, events };
      events.push({ ...base, type: "TIDE_ORIENTATION_CHANGED", orientation: tideOrientation });
      return {
        state: { ...state, environment: { ...state.environment, tideOrientation } },
        events,
      };
    }

    case "ignoreNextTideDamage": {
      if (!effect.tideState) return { state, events };
      const targets = resolvePlayerTargets(state, effect, context);
      const targetIds = targets.length > 0 ? targets.map((p) => p.id) : [context.controllerId];
      const flag = `ignoreNextTideDamage:${effect.tideState}`;
      const players = state.players.map((p) =>
        targetIds.includes(p.id) && !p.statusFlags.includes(flag)
          ? { ...p, statusFlags: [...p.statusFlags, flag] }
          : p
      ) as [PlayerState, PlayerState];
      return { state: { ...state, players }, events };
    }

    case "revealRandomHandCards": {
      const amount = amountValue(effect.amount) || 1;
      let nextState = state;
      for (const target of resolvePlayerTargets(state, effect, context)) {
        const result = revealRandomHandCards(nextState, target.id, amount, context.turnNumber);
        nextState = result.state;
        events.push(...result.events);
      }
      return { state: nextState, events };
    }

    case "reasonLossToHigherRevealedHandCard": {
      const amount = amountValue(effect.amount) || 1;
      let nextState = state;
      let rngState = nextState.rngState;
      const revealed: Array<{ playerId: PlayerId; cost: number }> = [];

      for (const player of nextState.players) {
        if (player.hand.length === 0) continue;
        const draw = nextInt(rngState, player.hand.length);
        rngState = draw.nextState;
        const card = player.hand[draw.value]!;
        events.push({ ...base, type: "HAND_CARD_REVEALED", ownerId: player.id, instanceId: card.instanceId, cardId: card.cardId });
        revealed.push({ playerId: player.id, cost: getCardDefinition(card.cardId).cost });
      }
      nextState = { ...nextState, rngState };

      if (revealed.length === 2 && revealed[0]!.cost !== revealed[1]!.cost) {
        const loser = revealed[0]!.cost > revealed[1]!.cost ? revealed[0]! : revealed[1]!;
        const shield = consumeReasonLossShield(nextState, loser.playerId, context.turnNumber);
        nextState = shield.state;
        const finalAmount = Math.max(0, amount - shield.reduction);
        if (finalAmount > 0) {
          const loserPlayer = getPlayer(nextState, loser.playerId);
          events.push({ ...base, type: "REASON_CHANGED", playerId: loserPlayer.id, delta: -finalAmount });
          nextState = replacePlayer(nextState, { ...loserPlayer, reason: reasonAfterLoss(loserPlayer, finalAmount) });
        }
      }
      return { state: nextState, events };
    }

    case "tideForceJumpToAbysses": {
      const extraDurationTurns = amountValue(effect.amount) || 0;
      const tick = forceTideJumpToAbysses(state.environment, {
        extraDurationTurns,
        forceOrientation: effect.forceTideOrientation,
      });
      events.push({
        ...base,
        type: "TIDE_ADVANCED",
        remainingTurns: tick.tideRemainingTurns,
        tideState: tick.tideState,
        tideOrientation: tick.tideOrientation,
        stateChanged: tick.stateChanged,
      });
      return {
        state: {
          ...state,
          environment: {
            ...state.environment,
            tideState: tick.tideState,
            tideRemainingTurns: tick.tideRemainingTurns,
            tideOrientation: tick.tideOrientation,
            tideIntensity: tick.tideIntensity,
            pendingTideModifiers: tick.pendingTideModifiers,
          },
        },
        events,
      };
    }

    case "lockReasonGainUntilNextTurn": {
      let nextState = state;
      for (const target of resolvePlayerTargets(state, effect, context)) {
        const player = getPlayer(nextState, target.id);
        if (player.statusFlags.includes(STATUS_NO_REASON_GAIN)) continue;
        nextState = replacePlayer(nextState, { ...player, statusFlags: [...player.statusFlags, STATUS_NO_REASON_GAIN] });
      }
      return { state: nextState, events };
    }

    case "moveGraveyardCardToHand": {
      const player = resolveSinglePlayerTarget(state, effect, context) ?? getPlayer(state, context.controllerId);
      const chosenId = context.chosenGraveyardInstanceId;
      if (!chosenId) return { state, events };
      const card = player.graveyard.find((c) => c.instanceId === chosenId);
      if (!card) return { state, events };
      if (!matchesCardTypeFilter(effect.filter, getCardDefinition(card.cardId).type)) return { state, events };
      if (effect.filter?.subtype && getCardDefinition(card.cardId).subtype !== effect.filter.subtype) return { state, events };
      if (effect.filter?.maxCost !== undefined && getCardDefinition(card.cardId).cost > effect.filter.maxCost) {
        return { state, events };
      }

      const graveyard = player.graveyard.filter((c) => c.instanceId !== chosenId);
      const hand = [...player.hand, card];
      // `cardId`/`ownerId` : la carte a quitté le Cimetière, c'est
      // l'événement qui porte son identité pour les déclencheurs de
      // récupération (Lot 13 — Maman revient).
      events.push({
        ...base,
        type: "CARD_MOVED",
        instanceId: card.instanceId,
        cardId: card.cardId,
        ownerId: player.id,
        fromZone: "graveyard",
        toZone: "hand",
      });
      return { state: replacePlayer(state, { ...player, graveyard, hand }), events };
    }

    case "moveZone": {
      // Seule la destination « main » est implémentée : c'est la seule que
      // le catalogue demande (Lot 11 — « renvoyez une Marionnette alliée
      // dans votre main »). Les autres destinations restent prévues par le
      // modèle de données sans consommateur.
      if (effect.toZone !== "hand") return { state, events };

      const { targets, rngState } = resolveUnitTargets(state, effect, context);
      let nextState: GameState = { ...state, rngState };

      for (const { unit, ownerId } of targets) {
        // Un permanent ne rentre en main que chez SON contrôleur : aucun
        // texte du pool ne renvoie une carte adverse, et le faire mettrait
        // une carte adverse dans la mauvaise main.
        if (ownerId !== context.controllerId) continue;
        const moved = returnPermanentToHand(nextState, ownerId, unit.instanceId);
        nextState = moved.state;
        events.push(...moved.events);
      }

      return { state: nextState, events };
    }

    case "repeatEnterEffects": {
      /*
       * On ne rejoue pas les effets ICI : on annonce que l'arrivée de la
       * cible se rallume (`ENTER_EFFECTS_REPEATED`), et c'est le circuit
       * normal des déclencheurs qui prend le relais — `processSummonEnterTriggers`
       * pour ses capacités automatiques, la fenêtre de réaction pour ses
       * capacités facultatives (Il Dottore, Arlecchino…), cibles à choisir
       * comprises. Une première version rejouait les effets à la main, en
       * sautant tout ce qui était facultatif ou ciblé : sur la troupe du
       * Théâtre, c'était TOUT — Colombina ne faisait jamais rien.
       */
      const { targets, rngState } = resolveUnitTargets(state, effect, context);
      const nextState: GameState = { ...state, rngState };
      for (const { unit, ownerId } of targets) {
        const def = safeCardDefinition(unit.cardId);
        if (!def) continue;
        events.push({ ...base, type: "ENTER_EFFECTS_REPEATED", playerId: ownerId, instanceId: unit.instanceId, cardId: def.id });
      }
      return { state: nextState, events };
    }

    case "discountNextCards": {
      const reduction = amountValue(effect.amount);
      if (reduction <= 0) return { state, events };

      const player = getPlayer(state, context.controllerId);
      const discount: CostDiscount = {
        amount: reduction,
        uses: Math.max(1, effect.uses ?? 1),
        // « ce tour » : la réduction meurt avec le tour où elle est posée.
        expiresAfterTurn: state.turnNumber,
        ...(effect.filter?.subtype ? { subtype: effect.filter.subtype } : {}),
        ...(effect.filter?.cardTypes ? { cardTypes: [...effect.filter.cardTypes] } : {}),
      };

      return {
        state: replacePlayer(state, { ...player, costDiscounts: [...(player.costDiscounts ?? []), discount] }),
        events,
      };
    }

    case "transform":
    case "searchDeck":
      // Prévus par le modèle de données pour de futures extensions ;
      // pas encore nécessaires pour le catalogue actuel.
      return { state, events };

    default:
      return { state, events };
  }
}
