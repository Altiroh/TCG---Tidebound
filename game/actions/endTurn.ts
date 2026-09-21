import { applyTideTurnEffects, resolveTideTurnStep } from "@/game/environment/resolveEnvironment";
import { getShipDefinition } from "@/game/environment/shipData";
import { deraisonAnchorDamage, deraisonDebt, reasonCeiling, startingReasonCap } from "@/game/state/reason";
import type { GameEvent } from "@/game/events/types";
import { processDiscardedFromHandTriggers, processTrigger } from "@/game/triggers/triggerBus";
import { discardFromHand, pruneGraveyardArrivals } from "@/game/state/discard";
import { RULES } from "@/game/rules/constants";
import { assertGameActive, assertIsActivePlayer, assertPlayerInGame, combine } from "@/game/rules/validation";
import { findAnomalyForcedChoice } from "@/game/state/anomalies";
import { getOpponent, STATUS_NO_REASON_GAIN, type GameState, type PlayerState } from "@/game/state/types";
import type { ActionResult, EndTurnAction } from "@/game/actions/types";

function validate(state: GameState, action: EndTurnAction) {
  return combine(
    assertGameActive(state),
    assertPlayerInGame(state, action.playerId),
    assertIsActivePlayer(state, action.playerId)
  );
}

/**
 * Termine le tour du joueur actif. Deux temps distincts (Notion "Moteur de
 * partie — déroulement, Raison & chaînes d'effets", verrouillage du
 * 2026-09-10) :
 *
 * A. Fin de tour DU JOUEUR QUI TERMINE : effets de fin de tour, défausse
 *    forcée, puis — en tout dernier — règlement de SA Déraison (dette sous
 *    0 → dégâts d'Ancrage, Raison remise à 0). Un joueur qui passe sous 0
 *    en cours de tour n'est donc pas sanctionné immédiatement : il peut
 *    encore récupérer de la Raison avant la fin de son tour pour l'éviter.
 *
 * B. Début de tour DU JOUEUR QUI DEVIENT ACTIF (structure verrouillée,
 *    resynchronisée 2026-09-10 après éviction du sous-système des Eaux) :
 *   1. Vérification de la Marée (décompte + progression + orientation + dégâts du tour)
 *   2. Effets différés — non modélisés pour le MVP, étape ignorée
 *   3. Remise à niveau de la Raison : 25 % / 50 % / 75 % de la Raison max aux 3 premiers tours du joueur, puis 100 %
 *   4. Pioche d'une carte
 *   5. Phase principale : dégel des unités (résiliation des attaques,
 *      nettoyage des modificateurs temporaires) — aucune action à
 *      réinitialiser : jouer une carte/Saborder/Briser ne sont plus
 *      limités à une fois par tour.
 */
export function endTurn(state: GameState, action: EndTurnAction): ActionResult {
  const validation = validate(state, action);
  if (!validation.ok) return { ok: false, error: validation.error };

  const events: GameEvent[] = [];
  const base = { turnNumber: state.turnNumber, timestamp: Date.now() };

  const endOfTurnTrigger = processTrigger(
    state,
    { trigger: "endOfTurn", playerId: action.playerId },
    state.turnNumber
  );
  let nextState = endOfTurnTrigger.state;
  events.push({ ...base, type: "END_TURN", playerId: action.playerId });
  events.push(...endOfTurnTrigger.events);

  // --- Effets de Marée reportés (Ancre de Dérive) : "ne s'appliquent qu'à
  // la fin du tour en cours" — c'est maintenant.
  const deferred = nextState.environment.deferredTideEffects;
  if (deferred) {
    nextState = { ...nextState, environment: { ...nextState.environment, deferredTideEffects: undefined } };
    const applied = applyTideTurnEffects(nextState, deferred.previousTideState, deferred.tideState, deferred.intensity, state.turnNumber);
    nextState = applied.state;
    events.push(...applied.events);
  }

  // Le tour se termine : les bonus "jusqu'à la fin du tour" tombent, sur
  // les DEUX plateaux (une carte peut en donner à l'adversaire) et avant
  // que le joueur suivant ne commence — un +1 Puissance donné pour une
  // attaque ne doit pas servir à défendre au tour d'après. Les bonus
  // "jusqu'à votre prochain tour", eux, sont retirés plus bas, au début du
  // tour de leur contrôleur.
  nextState = {
    ...nextState,
    players: nextState.players.map((player) => ({
      ...player,
      board: player.board.map((unit) => ({
        ...unit,
        modifiers: unit.modifiers.filter((modifier) => modifier.duration !== "endOfTurn"),
      })),
    })) as [PlayerState, PlayerState],
  };

  // --- Défausse forcée (cadrage "Règles & mécaniques verrouillées" : main
  // maximale 7) : appliquée en fin de tour, pour le joueur qui vient de
  // jouer, avant de passer la main. Aucun choix de joueur n'existe encore
  // pour sélectionner les cartes défaussées ("Choix de joueur en cours de
  // résolution" non modélisé) : on défausse déterministiquement depuis le
  // début de la main, comme pour la défausse liée aux dégâts de Marée
  // (`game/environment/resolveEnvironment.ts`).
  const endingPlayer = nextState.players.find((p) => p.id === action.playerId)!;
  if (endingPlayer.hand.length > RULES.MAX_HAND_SIZE) {
    const forced = discardFromHand(
      nextState,
      endingPlayer.id,
      { count: endingPlayer.hand.length - RULES.MAX_HAND_SIZE },
      base
    );
    nextState = forced.state;
    events.push(...forced.events);

    // Une carte qui part par la limite de main est défaussée comme une
    // autre : P'tit Bout rend sa Raison, La Marelle cogne. Le texte ne
    // distingue pas la cause de la défausse, le moteur non plus.
    const discardTriggers = processDiscardedFromHandTriggers(nextState, forced.events, state.turnNumber);
    nextState = discardTriggers.state;
    events.push(...discardTriggers.events);
  }

  const nextPlayer = getOpponent(nextState, action.playerId);
  const newTurnNumber = state.turnNumber + 1;
  const newBase = { turnNumber: newTurnNumber, timestamp: Date.now() };

  nextState = {
    ...nextState,
    turnNumber: newTurnNumber,
    activePlayerId: nextPlayer.id,
    priorityPlayerId: nextPlayer.id,
    // Chaque tour recommence en Phase principale, quelle que soit la phase
    // où le joueur précédent a terminé le sien (il peut passer directement
    // en Fin de tour depuis la Phase principale s'il n'a rien à attaquer).
    phase: "mainPhase",
  };

  // --- 0. Règlement de la Déraison du joueur qui PREND la main -----------
  //
  // Déplacé ici depuis la fin de son propre tour (passe de stabilisation du
  // 2026-09-21). La dette se voit donc pendant TOUT le tour adverse avant de
  // tomber : celui qui a plongé en Déraison l'affiche, et son adversaire
  // joue en le sachant. Ordre imposé par le design : les dégâts d'Ancrage
  // d'abord, PUIS la remise à 0, PUIS la récupération naturelle (plus bas) —
  // sans quoi la dette serait effacée par la récupération avant d'avoir coûté
  // quoi que ce soit.
  //
  // AVANT la Marée, à dessein : une perte de Raison infligée par la Marée de
  // CE tour n'est pas une dette que le joueur a choisie, et elle ne doit pas
  // être punie dans la seconde. Elle devient la dette de son prochain tour,
  // qu'il a un tour entier pour rembourser.
  const playerStartingTurn = nextState.players.find((p) => p.id === nextPlayer.id)!;
  const debt = deraisonDebt(playerStartingTurn.reason);
  if (debt > 0) {
    const anchorDamage = deraisonAnchorDamage(playerStartingTurn, playerStartingTurn.reason);
    nextState = {
      ...nextState,
      players: nextState.players.map((p) =>
        p.id === playerStartingTurn.id ? { ...p, anchor: p.anchor - anchorDamage, reason: 0 } : p
      ) as [PlayerState, PlayerState],
    };
    events.push({ ...newBase, type: "DERAISON_SETTLED", playerId: playerStartingTurn.id, debt, anchorDamage });
    // Pas de REASON_CHANGED pour la remise à 0 : DERAISON_SETTLED la porte déjà (évite un "+N Raison" trompeur dans le journal).
    if (anchorDamage > 0) {
      events.push({
        ...newBase,
        type: "DAMAGE",
        targetPlayerId: playerStartingTurn.id,
        amount: anchorDamage,
        targetAnchorAfter: playerStartingTurn.anchor - anchorDamage,
      });
    }
  }

  // --- 1. Vérification de la Marée (décompte, progression, orientation, dégâts) ---
  const tideStep = resolveTideTurnStep(nextState, newTurnNumber);
  nextState = tideStep.state;
  events.push(...tideStep.events);

  // --- 2. Effets différés : non modélisés pour le MVP, étape ignorée -----

  // --- 3-4. Remise à niveau de la Raison (courbe de début de partie), pioche
  const playerBeforeUpkeep = nextState.players.find((p) => p.id === nextPlayer.id)!;

  // "La Gueule Sous la Mer" : verrou consommé exactement ICI — cette remise
  // à niveau-ci est bloquée, jamais les suivantes ("jusqu'au début de
  // votre prochain tour" = jusqu'à ce moment précis, pas après).
  const reasonGainLocked = playerBeforeUpkeep.statusFlags.includes(STATUS_NO_REASON_GAIN);
  const statusFlagsAfterUpkeep = playerBeforeUpkeep.statusFlags.filter((f) => f !== STATUS_NO_REASON_GAIN);

  // La Raison PERSISTE d'un tour à l'autre et ne remonte que de
  // `RULES.NATURAL_REASON_RECOVERY` (passe de stabilisation du 2026-09-21).
  // Ce qui n'a pas été dépensé reste acquis ; ce qui l'a été n'est PAS rendu.
  // Remplace la remise à niveau au plafond, qui rendait la Raison gratuite
  // et permettait de remplir son plateau dès le 2e tour.
  //
  // Le plafond, lui, reste — mais comme BORNE HAUTE seulement : la courbe
  // (`STARTING_REASON_CURVE`) ne fait plus rien monter, elle empêche un deck
  // de rampe de sauter les paliers. p1 joue les tours impairs, p2 les pairs :
  // ceil(n / 2) = numéro de CE tour pour lui.
  //
  // La dette éventuelle a déjà été réglée à l'étape 0, donc la Raison est ici
  // toujours ≥ 0 : la récupération s'applique sur une base saine, jamais pour
  // combler un trou.
  let reasonCap = playerBeforeUpkeep.reasonCap;
  if (reasonCap !== undefined) {
    reasonCap = startingReasonCap(getShipDefinition(playerBeforeUpkeep.shipId).reasonMax, Math.ceil(newTurnNumber / 2));
  }
  const ceiling = reasonCeiling({ reasonMax: playerBeforeUpkeep.reasonMax, reasonCap });
  // `Math.max(reason, ...)` : un joueur déjà AU-DESSUS du plafond (Abysses
  // qui viennent d'abaisser `reasonMax`, gain de carte au tour précédent) ne
  // se fait pas rogner ici — seul le plafond des GAINS mord, pas l'acquis.
  const reason = reasonGainLocked
    ? playerBeforeUpkeep.reason
    : Math.max(playerBeforeUpkeep.reason, Math.min(ceiling, playerBeforeUpkeep.reason + RULES.NATURAL_REASON_RECOVERY));
  if (reason !== playerBeforeUpkeep.reason) {
    events.push({ ...newBase, type: "REASON_CHANGED", playerId: nextPlayer.id, delta: reason - playerBeforeUpkeep.reason });
  }

  let deck = playerBeforeUpkeep.deck;
  let hand = playerBeforeUpkeep.hand;
  let pendingOceanJudgment = nextState.pendingOceanJudgment;
  const drawnCard = deck[0];
  if (drawnCard) {
    deck = deck.slice(1);
    hand = [...hand, drawnCard];
    events.push({ ...newBase, type: "DRAW_CARD", playerId: nextPlayer.id, instanceId: drawnCard.instanceId });
  } else {
    // Deck vide : "Jugement de l'Océan" plutôt qu'une défaite instantanée
    // (résolu en fin d'action par `game/engine.ts`).
    pendingOceanJudgment = pendingOceanJudgment ?? { playerId: nextPlayer.id };
  }

  // --- 5. Phase principale : dégel et nettoyage -----------------------------
  const refreshedBoard = playerBeforeUpkeep.board.map((u) => ({
    ...u,
    summoningSick: false,
    hasAttackedThisTurn: false,
    // Début du tour de ce joueur : ses bonus "jusqu'à votre prochain tour"
    // ont fait leur office (ils l'ont couvert pendant le tour adverse).
    modifiers: u.modifiers.filter((m) => m.duration === "permanent"),
  }));

  const refreshedPlayer: PlayerState = {
    ...playerBeforeUpkeep,
    reason,
    reasonCap,
    deck,
    hand,
    board: refreshedBoard,
    statusFlags: statusFlagsAfterUpkeep,
  };

  nextState = {
    ...nextState,
    players: nextState.players.map((p) => (p.id === refreshedPlayer.id ? refreshedPlayer : p)) as [
      PlayerState,
      PlayerState
    ],
    pendingOceanJudgment,
  };

  // Élagage du journal des arrivées au Cimetière, au tour qui COMMENCE et
  // non à celui qui finit : « depuis votre dernier tour » doit encore voir
  // le tour adverse qui vient de s'écouler quand les capacités de début de
  // tour se déclenchent, juste en dessous.
  nextState = {
    ...nextState,
    players: nextState.players.map((p) => pruneGraveyardArrivals(p, newTurnNumber)) as [PlayerState, PlayerState],
  };

  events.push({ ...newBase, type: "TURN_STARTED", playerId: refreshedPlayer.id });

  const startOfTurnTrigger = processTrigger(
    nextState,
    { trigger: "startOfTurn", playerId: refreshedPlayer.id },
    newTurnNumber
  );
  nextState = startOfTurnTrigger.state;
  events.push(...startOfTurnTrigger.events);

  // "Le Fond Vous Regarde" : choix forcé pour le joueur qui DEVIENT actif,
  // au début de CHAQUE tour tant que l'Anomalie reste en jeu (n'importe
  // quel contrôleur — cf. `game/state/anomalies.ts`). Bloque toute autre
  // action jusqu'à sa résolution (`resolveChoice`, vérifié dans `dispatch`).
  const forcedChoice = findAnomalyForcedChoice(nextState, refreshedPlayer.id, newTurnNumber);
  if (forcedChoice) {
    nextState = { ...nextState, pendingChoice: forcedChoice };
  }

  return { ok: true, state: nextState, events };
}
