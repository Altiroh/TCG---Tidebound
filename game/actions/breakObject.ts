import { getCardDefinition } from "@/game/cards/sets/core";
import type { EffectContext } from "@/game/effects/resolveEffect";
import { resolveEffect } from "@/game/effects/resolveEffect";
import { resolveEffectSequence } from "@/game/effects/resolveSequence";
import {
  collectReactionCandidates,
  processDiscardedFromHandTriggers,
  processGraveyardRecoveryTriggers,
  processReturnedToHandTriggers,
  processSummonEnterTriggers,
  processTrigger,
} from "@/game/triggers/triggerBus";
import { isEligibleChosenUnit } from "@/game/effects/chosenTargets";
import { validateGraveyardChoice } from "@/game/effects/graveyardChoices";
import { markOncePerTurnUsed, oncePerTurnAvailable } from "@/game/state/oncePerTurn";
import type { EffectDefinition } from "@/game/effects/types";
import type { GameEvent } from "@/game/events/types";
import {
  assertCanPayCost,
  assertCardInHand,
  assertGameActive,
  assertInMainPhase,
  assertIsActivePlayer,
  assertIsObjectCard,
  assertPlayerInGame,
  combine,
} from "@/game/rules/validation";
import { isVisibleDuringTide, type CardDefinition, type CardInstance } from "@/game/cards/types";
import { payReasonCost, reasonCostAfterShield } from "@/game/state/shields";
import { getPlayer, type GameState, type PlayerId, type PlayerState } from "@/game/state/types";
import { recordGraveyardArrival } from "@/game/state/discard";
import type { ActionResult, BreakObjectAction } from "@/game/actions/types";

/**
 * Coût IMPRIMÉ du Bris depuis la main (Notion "Catalogue de cartes", règle
 * prototype "Briser un Objet depuis la main") : moitié du coût imprimé,
 * arrondie au supérieur, minimum 1 Raison. Une réduction temporaire de coût
 * ne le réduit pas ; le bouclier de perte de Raison s'applique au paiement,
 * comme pour tout coût.
 */
export function handBreakCost(def: CardDefinition): number {
  return Math.max(1, Math.ceil(def.cost / 2));
}

/**
 * Cibles qui n'existent que DANS une fenêtre de réaction : l'attaquant ou la
 * cible de l'attaque suspendue, la carte qui a déclenché la capacité.
 */
const REACTION_ONLY_TARGETS: ReadonlySet<string> = new Set(["pendingAttacker", "attackTarget", "triggerSource"]);

/**
 * Objet RÉACTIF : son effet de Bris vise ce qu'une fenêtre de réaction
 * fournit (Harpon à Ressort, « lorsqu'une unité adverse attaque […]
 * infligez-lui 2 dégâts » ; Bouclier d'Écume). Il ne se Brise que par sa
 * capacité, quand la situation se présente.
 *
 * Un Bris MANUEL — pendant sa propre Phase principale, sans attaque en
 * cours — résolvait l'effet sur une cible vide : l'Objet partait au
 * Cimetière sans rien faire (retour du 23/09). Il est donc refusé, et
 * l'invite le dit.
 */
export function breaksOnlyInReaction(def: CardDefinition): boolean {
  return (def.onBreakEffects ?? []).some((effect) => REACTION_ONLY_TARGETS.has(effect.target.kind));
}

/**
 * Un adversaire peut-il ANNULER l'effet de ce Bris (Fausse Cargaison) ?
 *
 * On ne suspend que si la réponse est oui. La question se pose en termes
 * STRUCTURELS — une capacité éligible dont l'un des effets est
 * `cancelObjectEffect` — et jamais en nommant une carte : le jour où une
 * deuxième carte annule un Bris, elle marchera sans une ligne de plus.
 */
function peutAnnulerLeBris(
  state: GameState,
  briseurId: PlayerId,
  instanceId: string,
  cardId: string,
  fromHand: boolean,
  turnNumber: number
): boolean {
  const evenement = {
    trigger: "onObjectBroken" as const,
    playerId: briseurId,
    cardId,
    sourceInstanceId: instanceId,
    fromHand,
  };
  return state.players.some((joueur) => {
    if (joueur.id === briseurId) return false;
    return collectReactionCandidates(state, [evenement], joueur.id, turnNumber).some((candidat) =>
      (getCardDefinition(candidat.cardId).abilities?.[candidat.abilityIndex]?.effects ?? []).some(
        (effet) => effet.type === "cancelObjectEffect"
      )
    );
  });
}


/**
 * Ce qui suit un Bris une fois l'Objet parti : ses propres effets, les
 * déclenchements qu'ils réveillent, puis le fait « vous avez Brisé un
 * Objet » lui-même.
 *
 * Extrait pour être appelable aux DEUX moments où il peut se produire —
 * tout de suite, ou après une fenêtre d'annulation (`pendingObjectBreak`).
 * `sansEffetsPropres` couvre le second cas quand l'annulation a été
 * activée : l'Objet reste brisé, et tout ce qui réagit à un Bris se
 * déclenche — seul ce que SON texte allait faire est jeté.
 */
function resoudreEffetsDeBris(
  state: GameState,
  def: CardDefinition,
  context: EffectContext,
  sansEffetsPropres: boolean
): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  let nextState = state;
  const turnNumber = context.turnNumber;

  let breakEffectEvents: GameEvent[] = [];
  if (!sansEffetsPropres) {
    const broken = resolveEffectSequence(nextState, def.onBreakEffects ?? [], context);
    nextState = broken.state;
    events.push(...broken.events);
    breakEffectEvents = [...broken.events];
  }

  // Péons invoqués par le Bris (ex: Le Seau) : eux aussi arrivent en jeu.
  const summoned = processSummonEnterTriggers(nextState, breakEffectEvents, turnNumber);
  nextState = summoned.state;
  events.push(...summoned.events);

  // Marionnettes renvoyées en main par le Bris (ex: La Clochette du Rappel).
  const recalled = processReturnedToHandTriggers(nextState, breakEffectEvents, turnNumber);
  nextState = recalled.state;
  events.push(...recalled.events);

  // Cartes défaussées par le Bris (ex: Le Goûter, Lot 13).
  const discardedByBreak = processDiscardedFromHandTriggers(nextState, breakEffectEvents, turnNumber);
  nextState = discardedByBreak.state;
  events.push(...discardedByBreak.events);

  // Cartes repêchées au Cimetière par le Bris (ex: La Petite Chanson).
  const recoveredByBreak = processGraveyardRecoveryTriggers(nextState, breakEffectEvents, turnNumber);
  nextState = recoveredByBreak.state;
  events.push(...recoveredByBreak.events);

  // Le Bris lui-même est un fait auquel des cartes réagissent
  // ("la première fois à chaque tour que vous Brisez un Objet").
  const brokenTrigger = processTrigger(
    nextState,
    {
      trigger: "onObjectBroken",
      playerId: context.controllerId,
      cardId: def.id,
      sourceInstanceId: context.sourceInstanceId,
      fromHand: context.brokenFromHand === true,
    },
    turnNumber
  );
  nextState = brokenTrigger.state;
  events.push(...brokenTrigger.events);

  return { state: nextState, events };
}

/**
 * Reprend un Bris que `dispatch` avait suspendu le temps d'une fenêtre
 * d'annulation. Appelé par le moteur, jamais par une action.
 */
export function resumeObjectBreakEffects(
  state: GameState,
  suspendu: NonNullable<GameState["pendingObjectBreak"]>
): { state: GameState; events: GameEvent[] } {
  return resoudreEffetsDeBris(
    state,
    getCardDefinition(suspendu.cardId),
    {
      controllerId: suspendu.playerId,
      sourceInstanceId: suspendu.instanceId,
      chosenTargetInstanceId: suspendu.chosenTargetInstanceId,
      chosenGraveyardInstanceId: suspendu.chosenGraveyardInstanceId,
      brokenFromHand: suspendu.brokenFromHand,
      turnNumber: suspendu.turnNumber,
    },
    suspendu.cancelled === true
  );
}

/** Clé `oncePerTurnFlags` de la taxe de Bris adverse (Cloche d'Alerte). */
const OBJECT_BREAK_TAX_KEY = "objectBreakTax";

/**
 * Taxe de Bris adverse (Cloche d'Alerte, `taxOpponentObjectBreakOncePerTurnWhileVisible`)
 * que `playerId` devrait payer en Brisant un Objet maintenant : montant et
 * carte qui la porte (montant 0 si aucune carte visible et encore armée).
 */
export function objectBreakTax(
  state: GameState,
  playerId: PlayerId,
  turnNumber: number
): { amount: number; blocksIfUnpayable: boolean; holder?: { unit: CardInstance; ownerId: PlayerId } } {
  const opponent = state.players.find((p) => p.id !== playerId);
  if (!opponent) return { amount: 0, blocksIfUnpayable: false };
  for (const unit of opponent.board) {
    const def = getCardDefinition(unit.cardId);
    const tax = def.taxOpponentObjectBreakOncePerTurnWhileVisible;
    if (tax === undefined || !isVisibleDuringTide(def, state.environment.tideState)) continue;
    if (!oncePerTurnAvailable(unit, OBJECT_BREAK_TAX_KEY, turnNumber)) continue;
    return { amount: tax.amount, blocksIfUnpayable: tax.blocksIfUnpayable === true, holder: { unit, ownerId: opponent.id } };
  }
  return { amount: 0, blocksIfUnpayable: false };
}

/**
 * Raison que coûterait réellement le Bris depuis la main de cet Objet
 * maintenant (bouclier compris) et la Raison qui en résulterait — pour
 * l'annoncer dans l'UI avant confirmation. `undefined` si la carte n'est pas
 * un Objet de la main du joueur.
 */
export function previewHandBreakReason(
  state: GameState,
  playerId: PlayerId,
  instanceId: string
): { cost: number; reasonAfter: number; allowed: boolean; reactionOnly: boolean } | undefined {
  return previewBreakReason(state, playerId, instanceId, true);
}

/**
 * Raison que coûterait ce Bris maintenant, depuis la main OU depuis le
 * plateau, bouclier et taxe adverse comprises — pour l'annoncer avant
 * confirmation. Un Bris depuis le plateau ne coûte rien en soi, mais une
 * Cloche d'Alerte adverse le taxe : sans cet aperçu, le joueur entrait en
 * Déraison sans avoir été prévenu. `undefined` si la carte n'est pas un
 * Objet du joueur dans la zone indiquée.
 */
export function previewBreakReason(
  state: GameState,
  playerId: PlayerId,
  instanceId: string,
  fromHand: boolean
): { cost: number; reasonAfter: number; allowed: boolean; reactionOnly: boolean } | undefined {
  const player = state.players.find((p) => p.id === playerId);
  const card = (fromHand ? player?.hand : player?.board)?.find((c) => c.instanceId === instanceId);
  if (!player || !card) return undefined;
  const def = getCardDefinition(card.cardId);
  if (def.type !== "objet") return undefined;
  const printed = fromHand ? handBreakCost(def) : 0;
  const tax = objectBreakTax(state, playerId, state.turnNumber);
  const cost = reasonCostAfterShield(state, playerId, printed + tax.amount, state.turnNumber);
  // Hors taxe bloquante, un coût se paie toujours : l'UI n'a qu'à annoncer
  // la dette. Une Cloche d'Alerte adverse, elle, peut rendre le Bris
  // impossible — l'aperçu doit le dire AVANT que le joueur ne tente.
  const reactionOnly = breaksOnlyInReaction(def);
  const allowed = !reactionOnly && (!tax.blocksIfUnpayable || player.reason >= cost);
  return { cost, reasonAfter: player.reason - cost, allowed, reactionOnly };
}


function validate(state: GameState, action: BreakObjectAction) {
  const generalChecks = combine(
    assertGameActive(state),
    assertPlayerInGame(state, action.playerId),
    assertIsActivePlayer(state, action.playerId),
    assertInMainPhase(state, action.playerId),
    action.fromHand
      ? assertCardInHand(state, action.playerId, action.instanceId)
      : assertIsObjectCard(state, action.playerId, action.instanceId)
  );
  if (!generalChecks.ok) return generalChecks;

  const player = getPlayer(state, action.playerId);
  const unit = (action.fromHand ? player.hand : player.board).find((u) => u.instanceId === action.instanceId)!;
  const def = getCardDefinition(unit.cardId);

  if (action.fromHand) {
    if (def.type !== "objet") return { ok: false as const, error: "Seul un Objet peut être brisé." };
    const costCheck = assertCanPayCost(
      state,
      action.playerId,
      reasonCostAfterShield(state, action.playerId, handBreakCost(def), state.turnNumber)
    );
    if (!costCheck.ok) return costCheck;
  }

  if (breaksOnlyInReaction(def)) {
    return { ok: false as const, error: "Cet Objet ne se Brise qu'en réaction, quand la situation de son texte se présente." };
  }

  if (def.requiresTideStateForBreak && !def.requiresTideStateForBreak.includes(state.environment.tideState)) {
    return { ok: false as const, error: "Cet Objet ne peut être brisé dans l'état de Marée actuel." };
  }

  // « S'il ne peut pas payer, l'Objet ne peut pas être Brisé » (Cloche
  // d'Alerte) : seule une taxe adverse `blocksIfUnpayable` peut refuser un
  // Bris faute de Raison. Hors ce cas, le coût se paie toujours, quitte à
  // entrer en Déraison — le plancher est une règle de carte, pas du moteur.
  const tax = objectBreakTax(state, action.playerId, state.turnNumber);
  if (tax.blocksIfUnpayable) {
    const printed = action.fromHand ? handBreakCost(def) : 0;
    const total = reasonCostAfterShield(state, action.playerId, printed + tax.amount, state.turnNumber);
    if (player.reason < total) {
      return { ok: false as const, error: "Raison insuffisante pour payer la taxe de Bris adverse." };
    }
  }

  const needsTarget = (def.onBreakEffects ?? []).some((e) => e.target.kind === "chosenUnit");
  if (needsTarget && !action.targetInstanceId) {
    return { ok: false as const, error: "Briser cet Objet nécessite une cible." };
  }
  if (needsTarget) {
    // La cible doit respecter le filtre du texte ("Sabordez une Structure
    // que vous contrôlez", Levier de Lest) — refusée ici plutôt que
    // silencieusement ignorée par `resolveEffect`.
    const legal = (def.onBreakEffects ?? [])
      .filter((e) => e.target.kind === "chosenUnit")
      .every((e) => isEligibleChosenUnit(state, e.target, action.playerId, action.targetInstanceId!, action.instanceId));
    if (!legal) return { ok: false as const, error: "Cette carte n'est pas une cible valide pour ce Bris." };
  }

  // "Si possible" (même convention que le ciblage d'Équipement, cf.
  // playCard.ts) : une carte de défausse n'est réclamée que s'il en existe
  // au moins une éligible — sinon l'effet se résout sans rien récupérer.
  const graveyard = validateGraveyardChoice(state, action.playerId, def.onBreakEffects, action.chosenGraveyardInstanceId);
  if (!graveyard.ok) {
    return {
      ok: false as const,
      error:
        graveyard.reason === "illegal"
          ? "Cette carte du Cimetière n'est pas une cible valide."
          : "Briser cet Objet nécessite de choisir une carte dans le Cimetière.",
    };
  }

  return { ok: true as const };
}

/**
 * Brise un Objet contrôlé par le joueur — posé sur son plateau, ou depuis sa
 * main (`fromHand`, coût `handBreakCost`) : résout `onBreakEffects` puis
 * l'envoie au cimetière. Comme jouer une carte ou Saborder, n'est pas
 * limité en nombre par tour (Notion "Moteur de partie" : pas de limite
 * artificielle d'action).
 *
 * IMPORTANT — "Briser ≠ Saborder" (règle verrouillée) : contrairement à
 * `saborder.ts`, cette action ne déclenche NI `onDeath` NI `onSaborde`.
 * Les cartes qui réagissent au bris passent par son trigger dédié,
 * `onObjectBroken` (déclenchements automatiques) et par l'événement
 * `OBJECT_BROKEN` (fenêtres de réaction facultatives).
 */
export function breakObject(state: GameState, action: BreakObjectAction): ActionResult {
  const validation = validate(state, action);
  if (!validation.ok) return { ok: false, error: validation.error };

  const player = getPlayer(state, action.playerId);
  const fromZone = action.fromHand ? "hand" : "board";
  const unit = (action.fromHand ? player.hand : player.board).find((u) => u.instanceId === action.instanceId)!;
  const def = getCardDefinition(unit.cardId);
  const events: GameEvent[] = [];
  const base = { turnNumber: state.turnNumber, timestamp: Date.now() };

  // Depuis la main : ne prend jamais de Slot, va directement en défausse après résolution.
  const playerAfter: PlayerState = recordGraveyardArrival(
    {
      ...player,
      hand: action.fromHand ? player.hand.filter((c) => c.instanceId !== unit.instanceId) : player.hand,
      board: action.fromHand ? player.board : player.board.filter((u) => u.instanceId !== unit.instanceId),
      graveyard: [...player.graveyard, { ...unit, damageMarked: 0, modifiers: [] }],
    },
    { cardId: unit.cardId, turnNumber: state.turnNumber, fromZone }
  );

  let nextState: GameState = {
    ...state,
    players: state.players.map((p) => (p.id === player.id ? playerAfter : p)) as [
      PlayerState,
      PlayerState
    ],
  };

  // Taxe adverse (Cloche d'Alerte) : consommée pour le tour et ajoutée au
  // coût du Bris — depuis la main comme depuis le plateau (sinon gratuit).
  const tax = objectBreakTax(nextState, player.id, state.turnNumber);
  if (tax.holder) {
    const { unit: holder, ownerId } = tax.holder;
    nextState = {
      ...nextState,
      players: nextState.players.map((p) =>
        p.id === ownerId
          ? { ...p, board: p.board.map((u) => (u.instanceId === holder.instanceId ? markOncePerTurnUsed(u, OBJECT_BREAK_TAX_KEY, state.turnNumber) : u)) }
          : p
      ) as [PlayerState, PlayerState],
    };
  }
  const breakCost = (action.fromHand ? handBreakCost(def) : 0) + tax.amount;
  if (breakCost > 0) {
    const payment = payReasonCost(nextState, player.id, breakCost, state.turnNumber);
    nextState = payment.state;
    events.push({ ...base, type: "REASON_CHANGED", playerId: player.id, delta: -payment.paid });
  }

  events.push({ ...base, type: "CARD_MOVED", instanceId: unit.instanceId, fromZone, toZone: "graveyard" });
  // Le Bris est un fait distinct du simple départ vers le cimetière : il
  // porte la fenêtre de réaction "la première fois à chaque tour que vous
  // Brisez un Objet" (Le Tas de Trucs), qui ne peut s'ouvrir qu'à partir
  // d'un `GameEvent` — cf. `deriveReactionTriggerEvents`.
  events.push({ ...base, type: "OBJECT_BROKEN", playerId: player.id, instanceId: unit.instanceId, cardId: def.id, fromHand: action.fromHand === true });

  const context: EffectContext = {
    controllerId: player.id,
    sourceInstanceId: unit.instanceId,
    chosenTargetInstanceId: action.targetInstanceId,
    chosenGraveyardInstanceId: action.chosenGraveyardInstanceId,
    // Certains Objets font plus quand on les brise directement de la main
    // (ex: Le Seau) : l'info doit descendre jusqu'aux effets.
    brokenFromHand: action.fromHand === true,
    turnNumber: state.turnNumber,
  };

  // --- SUSPENSION POUR ANNULATION (Fausse Cargaison, Lot 14) -----------
  //
  // L'Objet est brisé et payé ; ce qui attend, c'est ce que son texte
  // allait faire. On ne s'arrête QUE si quelqu'un a de quoi l'annuler :
  // sans cette garde, tous les Bris du jeu changeraient de rythme pour une
  // seule carte, et le moment où « la première fois que vous Brisez un
  // Objet » se déclenche bougerait sous les pieds des cartes existantes.
  if (peutAnnulerLeBris(nextState, player.id, unit.instanceId, def.id, action.fromHand === true, state.turnNumber)) {
    return {
      ok: true,
      state: {
        ...nextState,
        pendingObjectBreak: {
          playerId: player.id,
          instanceId: unit.instanceId,
          cardId: def.id,
          brokenFromHand: action.fromHand === true,
          ...(action.targetInstanceId ? { chosenTargetInstanceId: action.targetInstanceId } : {}),
          ...(action.chosenGraveyardInstanceId ? { chosenGraveyardInstanceId: action.chosenGraveyardInstanceId } : {}),
          turnNumber: state.turnNumber,
        },
      },
      events,
    };
  }

  const suite = resoudreEffetsDeBris(nextState, def, context, false);
  return { ok: true, state: suite.state, events: [...events, ...suite.events] };
}
