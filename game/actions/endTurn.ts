import { annoncerMaree, applyTideTurnEffects, appliquerMareeAnnoncee } from "@/game/environment/resolveEnvironment";
import { getShipDefinition } from "@/game/environment/shipData";
import { deraisonAnchorDamage, deraisonDebt, reasonCeiling, startingReasonCap } from "@/game/state/reason";
import type { GameEvent } from "@/game/events/types";
import { processDiscardedFromHandTriggers, processTrigger } from "@/game/triggers/triggerBus";
import { discardFromHand, pruneGraveyardArrivals } from "@/game/state/discard";
import { RULES } from "@/game/rules/constants";
import { assertGameActive, assertIsActivePlayer, assertPlayerInGame, combine } from "@/game/rules/validation";
import { findAnomalyForcedChoice } from "@/game/state/anomalies";
import { ouvrirFenetrePour } from "@/game/reactions/reactionWindow";
import type { TriggerEvent } from "@/game/triggers/types";
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

  // --- Règlement de la Déraison CHOISIE, à la fin du tour de celui qui l'a
  // prise, en tout dernier (plus aucun effet de fin de tour ne peut encore
  // lui rendre de Raison) : chaque point sous 0 coûte
  // `DERAISON_ANCHOR_DAMAGE_PER_POINT` Ancrage (moins la réduction éventuelle
  // du Navire, ex: Pénitence), puis la dette est effacée. Terminer
  // exactement à 0 ne coûte rien — il faut être SOUS zéro.
  //
  // Ce qui est encore négatif ICI est forcément CHOISI : une dette subie
  // pendant le tour adverse a déjà été absorbée au début de ce tour, sans
  // dégâts (voir l'étape 3-4). La séquence sépare donc le subi du choisi
  // sans que le moteur ait à tracer l'origine de chaque point perdu.
  //
  // Seule exception assumée (arbitrage du 2026-09-21) : une réaction adverse
  // qui draine pendant SON tour compte comme du choisi. Le joueur a eu tout
  // son tour pour remonter ; s'il ne l'a pas fait, il paie.
  const playerEndingTurn = nextState.players.find((p) => p.id === action.playerId)!;
  const debt = deraisonDebt(playerEndingTurn.reason);
  if (debt > 0) {
    const anchorDamage = deraisonAnchorDamage(playerEndingTurn, playerEndingTurn.reason);
    nextState = {
      ...nextState,
      players: nextState.players.map((p) =>
        p.id === playerEndingTurn.id ? { ...p, anchor: p.anchor - anchorDamage, reason: 0 } : p
      ) as [PlayerState, PlayerState],
    };
    events.push({ ...base, type: "DERAISON_SETTLED", playerId: playerEndingTurn.id, debt, anchorDamage });
    // Pas de REASON_CHANGED pour la remise à 0 : DERAISON_SETTLED la porte déjà (évite un "+N Raison" trompeur dans le journal).
    if (anchorDamage > 0) {
      events.push({
        ...base,
        type: "DAMAGE",
        targetPlayerId: playerEndingTurn.id,
        amount: anchorDamage,
        targetAnchorAfter: playerEndingTurn.anchor - anchorDamage,
      });
    }
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

  // --- 1. ANNONCE de la Marée (décompte, progression, orientation, Anomalies) ---
  // L'état est committé, ses effets de TOUR ne sont pas encore appliqués :
  // entre les deux, la fenêtre `onTideAnnounced` (Ancre de Dérive).
  const annonce = annoncerMaree(nextState, newTurnNumber);
  nextState = annonce.state;
  events.push(...annonce.events);

  // La Marée en attente est posée AVANT la fenêtre : c'est elle que
  // l'effet `deferTideEffects` vient marquer, et c'est elle qui dit à
  // `dispatch` que l'entame n'est pas finie.
  nextState = {
    ...nextState,
    pendingTideStep: {
      playerId: nextPlayer.id,
      turnNumber: newTurnNumber,
      previousTideState: annonce.annonce.previousTideState,
      tideState: annonce.annonce.tideState,
      intensity: annonce.annonce.intensity,
      stateChanged: annonce.annonce.stateChanged,
    },
  };

  if (annonce.annonce.stateChanged) {
    // Même geste qu'à la déclaration d'une attaque : les capacités
    // AUTOMATIQUES d'abord (il n'y en a aucune à ce jour, mais la grammaire
    // les autorise), puis les facultatives, seules à pouvoir suspendre.
    const evenementDeclencheur: TriggerEvent = { trigger: "onTideAnnounced", tideState: annonce.annonce.tideState };
    const annonceTrigger = processTrigger(nextState, evenementDeclencheur, newTurnNumber);
    nextState = annonceTrigger.state;
    events.push(...annonceTrigger.events);

    // La fenêtre doit s'ouvrir ICI et pas à la fin de `dispatch` : ce qui
    // la suit — les effets de la Marée — ne doit pas avoir déjà eu lieu
    // quand le joueur répond.
    const fenetre = ouvrirFenetrePour(nextState, [evenementDeclencheur], newTurnNumber);
    if (fenetre) {
      // L'entame s'arrête ici. Ni Raison, ni pioche, ni `TURN_STARTED` tant
      // que le joueur n'a pas répondu — `dispatch` reprend `entameDeTour`
      // dès que la fenêtre se referme, comme pour une attaque suspendue.
      events.push({
        type: "REACTION_WINDOW_OPENED",
        turnNumber: newTurnNumber,
        timestamp: Date.now(),
        playerId: fenetre.awaitingPlayerId,
      });
      return { ok: true, state: { ...nextState, pendingReaction: fenetre }, events };
    }
  }

  return entameDeTour(nextState, events);
}

/**
 * Seconde moitié de la fin de tour : l'ENTAME du tour suivant, à partir
 * d'une Marée déjà annoncée (`GameState.pendingTideStep`).
 *
 * Séparée de `endTurn` pour être REPRENABLE : la fenêtre `onTideAnnounced`
 * s'intercale entre l'annonce de la Marée et ses effets, et tout ce qui
 * suit — effets de tour de la Marée, expirations, récupération de Raison,
 * pioche, dégel, `TURN_STARTED` — doit attendre la réponse du joueur.
 * L'ordre, lui, est INCHANGÉ : la Marée frappe toujours avant la
 * récupération de Raison, jamais après.
 *
 * Appelée par `endTurn` quand aucune fenêtre ne s'ouvre, et par `dispatch`
 * quand celle-ci se referme.
 */
export function entameDeTour(state: GameState, eventsAvant: GameEvent[] = []): ActionResult {
  const pending = state.pendingTideStep;
  if (!pending) return { ok: false, error: "Aucune entame de tour en attente." };

  const events: GameEvent[] = [...eventsAvant];
  const newTurnNumber = pending.turnNumber;
  const newBase = { turnNumber: newTurnNumber, timestamp: Date.now() };
  const nextPlayer = state.players.find((p) => p.id === pending.playerId)!;

  // --- 2. Effets de la Marée annoncée, reportés ou non selon la fenêtre --
  const applique = appliquerMareeAnnoncee(
    { ...state, pendingTideStep: undefined },
    newTurnNumber,
    {
      previousTideState: pending.previousTideState,
      tideState: pending.tideState,
      intensity: pending.intensity,
      stateChanged: pending.stateChanged,
    },
    Boolean(pending.deferred)
  );
  let nextState = applique.state;
  events.push(...applique.events);

  // --- 3-4. Récupération naturelle, absorption de la dette SUBIE, pioche ---
  const playerBeforeUpkeep = nextState.players.find((p) => p.id === nextPlayer.id)!;

  // "La Gueule Sous la Mer" : verrou consommé exactement ICI — cette
  // récupération-ci est bloquée, jamais les suivantes ("jusqu'au début de
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
  // DETTE SUBIE (arbitrage du 2026-09-21). Une Raison négative présente ICI
  // vient forcément d'un effet adverse joué pendant le tour d'en face : la
  // dette CHOISIE, elle, a déjà été réglée en Ancrage à la fin du tour de
  // celui qui l'a prise. Elle ne coûte donc pas d'Ancrage — elle coûte du
  // REVENU : la récupération de ce tour est amputée du montant de la dette,
  // puis l'ardoise est effacée.
  //
  // Amputée UNE FOIS, jamais reportée : c'est ce qui empêche le verrou. Avec
  // une récupération à +1, reporter le reliquat laisserait un adversaire
  // drainé à répétition sous zéro pour toujours, sans recours. Conséquence
  // assumée : au-delà du montant de la récupération, drainer plus fort ne
  // coûte pas plus cher à qui est DÉJÀ à 0 — la valeur d'un drain vient
  // surtout de la Raison positive qu'il emporte.
  const dettesSubie = deraisonDebt(playerBeforeUpkeep.reason);
  const recuperation = Math.max(0, RULES.NATURAL_REASON_RECOVERY - dettesSubie);
  const baseApresAbsorption = Math.max(0, playerBeforeUpkeep.reason);

  let reasonCap = playerBeforeUpkeep.reasonCap;
  if (reasonCap !== undefined) {
    reasonCap = startingReasonCap(getShipDefinition(playerBeforeUpkeep.shipId).reasonMax, Math.ceil(newTurnNumber / 2));
  }
  const ceiling = reasonCeiling({ reasonMax: playerBeforeUpkeep.reasonMax, reasonCap });
  // `Math.max(base, ...)` : un joueur déjà AU-DESSUS du plafond (Abysses qui
  // viennent d'abaisser `reasonMax`, gain de carte au tour précédent) ne se
  // fait pas rogner ici — seul le plafond des GAINS mord, pas l'acquis.
  const reason = reasonGainLocked
    ? baseApresAbsorption
    : Math.max(baseApresAbsorption, Math.min(ceiling, baseApresAbsorption + recuperation));
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
