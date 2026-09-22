import { getCardDefinition } from "@/game/cards/sets/core";
import type { CardDefinition } from "@/game/cards/types";
import {
  graveyardChoicesForAbility,
  graveyardChoicesForBreak,
  graveyardChoicesForPlay,
} from "@/game/effects/graveyardChoices";
import type { PlayerAction } from "@/game/actions/types";
import { eligibleChosenUnits } from "@/game/effects/chosenTargets";
import { eligibleCandidatesFor } from "@/game/reactions/reactionWindow";
import { canUnitAttack } from "@/game/rules/validation";
import { shipAbilityView } from "@/game/state/shipAbility";
import { isMainPhase, type GameState, type PlayerId } from "@/game/state/types";

/**
 * Variantes de Bris d'un Objet (posé ou depuis la main) : une par cible possible
 * si l'effet vise `chosenUnit`, une par carte de défausse éligible s'il faut en
 * récupérer une (ex: Grappin de Récupération) — sinon une seule action.
 */
function breakVariants(
  state: GameState,
  playerId: PlayerId,
  instanceId: string,
  def: CardDefinition,
  fromHand: boolean
): PlayerAction[] {
  const base = { type: "breakObject" as const, playerId, instanceId, ...(fromHand ? { fromHand: true } : {}) };
  const targeted = (def.onBreakEffects ?? []).find((e) => e.target.kind === "chosenUnit");
  if (targeted) {
    // Seules les cibles LÉGALES au regard du filtre de l'effet (ex: Levier
    // de Lest, "une Structure que vous contrôlez") — le moteur refuse le reste.
    return eligibleChosenUnits(state, targeted.target, playerId, instanceId).map(({ unit }) => ({ ...base, targetInstanceId: unit.instanceId }));
  }
  const choices = graveyardChoicesForBreak(state, playerId, def);
  if (choices.length > 0) return choices.map((card) => ({ ...base, chosenGraveyardInstanceId: card.instanceId }));
  return [base];
}

/**
 * Génère des actions CANDIDATES pour `playerId` — délibérément
 * sur-inclusive plutôt que d'essayer de dupliquer les règles de validation
 * du moteur : chaque candidat est ensuite simplement soumis à `dispatch`
 * par `chooseAction.ts`, qui écarte silencieusement ceux qui sont refusés.
 * Ça garantit que le bot ne peut jamais proposer un coup illégal, sans
 * jamais avoir à réimplémenter `game/rules/validation.ts`.
 *
 * Consciente des Phases (`game/actions/advancePhase.ts`) : jouer une
 * carte/Saborder/Briser n'est proposé qu'en Phase principale (la 1re comme
 * la 2de, après le combat), attaquer qu'en Phase de combat — cohérent avec ce que `dispatch` accepterait de
 * toute façon, mais évite de gonfler inutilement la liste de candidats.
 */
export function enumerateCandidateActions(state: GameState, playerId: PlayerId): PlayerAction[] {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return [{ type: "endTurn", playerId }];

  const opponent = state.players.find((p) => p.id !== playerId);
  const allBoardUnits = [...player.board, ...(opponent?.board ?? [])];
  const actions: PlayerAction[] = [];

  // Choix forcé en attente, pour CE joueur (ex: Le Fond Vous Regarde) :
  // seule `resolveChoice` est légale tant qu'il reste ouvert
  // (`game/engine.ts`) — `evaluateState` départagera naturellement les deux
  // branches (perte d'Ancrage pondérée bien plus lourdement que la Raison),
  // aucune heuristique dédiée n'est nécessaire ici.
  if (state.pendingChoice && state.pendingChoice.playerId === playerId) {
    if (state.pendingChoice.kind === "abilityOption") {
      return [
        ...state.pendingChoice.abilityIndexes.map((abilityIndex) => ({ type: "resolveChoice" as const, playerId, choice: { abilityIndex } })),
        // Refuser est une option comme une autre : `evaluateState` la
        // départagera si aucune branche n'est bonne à prendre.
        { type: "resolveChoice" as const, playerId, choice: "pass" as const },
      ];
    }
    // Regard de pioche : chaque carte prenable est un coup distinct, plus
    // « ne rien prendre ». `evaluateState` tranche, comme partout ailleurs.
    if (state.pendingChoice.kind === "deckLook") {
      const choice = state.pendingChoice;
      const prenables = choice.revealed.filter(
        (carte) => !choice.takeableCardTypes || choice.takeableCardTypes.includes(getCardDefinition(carte.cardId).type)
      );
      return [
        ...prenables.map((carte) => ({
          type: "resolveChoice" as const,
          playerId,
          choice: { takeInstanceIds: [carte.instanceId] },
        })),
        { type: "resolveChoice" as const, playerId, choice: { takeInstanceIds: [] as string[] } },
      ];
    }
    if (state.pendingChoice.kind === "handDiscard") {
      const choice = state.pendingChoice;
      const hand = player.hand;
      // Une carte à défausser : chaque carte de la main est un coup
      // distinct, et `evaluateState` tranche. Plusieurs : on se contente de
      // fenêtres glissantes — énumérer toutes les combinaisons ferait
      // exploser la recherche pour un gain nul, la main étant bornée à 7.
      const selections: string[][] =
        choice.count === 1
          ? hand.map((card) => [card.instanceId])
          : hand
              .slice(0, Math.max(1, hand.length - choice.count + 1))
              .map((_, start) => hand.slice(start, start + choice.count).map((card) => card.instanceId))
              .filter((ids) => ids.length === choice.count);
      const actions: PlayerAction[] = selections.map((discardInstanceIds) => ({
        type: "resolveChoice" as const,
        playerId,
        choice: { discardInstanceIds },
      }));
      // « Vous pouvez défausser » : ne rien faire est un coup comme un autre.
      if (choice.refusable) actions.push({ type: "resolveChoice", playerId, choice: "pass" });
      return actions;
    }
    return [
      { type: "resolveChoice", playerId, choice: "reasonLoss" },
      { type: "resolveChoice", playerId, choice: "anchorDamage" },
    ];
  }

  // Fenêtre de réaction ouverte, en attente de CE joueur : seules
  // `activateReaction`/`passReaction` sont légales tant qu'elle reste
  // ouverte (`game/engine.ts`) — ne pas proposer d'action normale.
  if (state.pendingReaction && state.pendingReaction.awaitingPlayerId === playerId) {
    const candidates = eligibleCandidatesFor(
      state,
      state.pendingReaction.events,
      playerId,
      state.pendingReaction.turnNumber,
      state.pendingReaction.usedCandidateKeys
    );
    for (const candidate of candidates) {
      if (candidate.needsTarget) {
        // Cibles réellement légales pour CETTE capacité ("choisissez un
        // Cra-Poiscail") : pas une duplication de la validation, c'est la
        // fonction du moteur elle-même — proposer le reste ne ferait que
        // brûler des `dispatch` refusés.
        const abilityEffects = getCardDefinition(candidate.cardId).abilities?.[candidate.abilityIndex]?.effects ?? [];
        const targeting = abilityEffects.find((e) => e.target.kind === "chosenUnit");
        const legalTargets = targeting
          ? eligibleChosenUnits(state, targeting.target, playerId, candidate.sourceInstanceId).map((c) => c.unit)
          : allBoardUnits;
        for (const target of legalTargets) {
          actions.push({
            type: "activateReaction",
            playerId,
            sourceInstanceId: candidate.sourceInstanceId,
            abilityIndex: candidate.abilityIndex,
            targetInstanceId: target.instanceId,
          });
        }
      } else if (candidate.needsGraveyardTarget) {
        // « choisissez une unité Un Dead dans votre Cimetière » : chaque
        // carte éligible est un coup distinct, `evaluateState` tranche.
        for (const card of graveyardChoicesForAbility(state, playerId, candidate.cardId, candidate.abilityIndex)) {
          actions.push({
            type: "activateReaction",
            playerId,
            sourceInstanceId: candidate.sourceInstanceId,
            abilityIndex: candidate.abilityIndex,
            chosenGraveyardInstanceId: card.instanceId,
          });
        }
      } else {
        actions.push({
          type: "activateReaction",
          playerId,
          sourceInstanceId: candidate.sourceInstanceId,
          abilityIndex: candidate.abilityIndex,
        });
      }
    }
    // Capacité de NAVIRE qui déclare cette fenêtre pour terrain
    // (`activationWindow` — Changer de cap, Virage court) : elle s'active
    // là et nulle part ailleurs, donc elle doit être proposée ICI, avant
    // le retour anticipé. `shipAbilityView` sait déjà si la fenêtre est la
    // sienne.
    const windowShipAbility = shipAbilityView(state, playerId);
    if (windowShipAbility?.ability.activationWindow && windowShipAbility.canActivate) {
      actions.push({ type: "activateShipAbility", playerId });
    }

    actions.push({ type: "passReaction", playerId });
    return actions;
  }

  // Capacité activable du NAVIRE (Le Goliath — Canon de proue). Ni les
  // phases ni la fréquence ne sont décidées ici : c'est la capacité qui les
  // déclare, et `shipAbilityView` — la même lecture que celle qui allume le
  // panneau côté interface — dit si le geste est possible maintenant. Le
  // bot ne peut donc pas proposer un canon que le joueur, lui, ne pourrait
  // pas armer.
  const shipAbility = shipAbilityView(state, playerId);
  if (shipAbility?.canActivate) actions.push({ type: "activateShipAbility", playerId });
  if (shipAbility?.canFire) {
    // Sans cible : le Navire adverse, comme une attaque directe. Garde peut
    // le refuser — `dispatch` écartera le candidat, et les cibles ci-dessous
    // restent.
    actions.push({ type: "fireShipAbility", playerId });
    for (const target of opponent?.board ?? []) {
      actions.push({ type: "fireShipAbility", playerId, targetInstanceId: target.instanceId });
    }
  }

  if (isMainPhase(state.phase)) {
    // Pas de limite au nombre d'actions principales par tour (Notion
    // "Moteur de partie" : jouer/Saborder/Briser ne sont plus réservés à
    // une fois par tour) — toutes les cartes/permanents jouables sont
    // proposés, `dispatch` écarte de toute façon ce que la Raison ou le
    // plateau ne permettent plus.
    for (const card of player.hand) {
      const def = getCardDefinition(card.cardId);
      const needsTarget = (def.onPlayEffects ?? []).some((e) => e.target.kind === "chosenUnit");
      if (needsTarget) {
        for (const target of allBoardUnits) {
          actions.push({
            type: "playCard",
            playerId,
            instanceId: card.instanceId,
            targetInstanceId: target.instanceId,
          });
        }
      } else {
        // « À son arrivée, choisissez une unité dans votre Cimetière » : la
        // pose se décline par carte repêchable, comme le Bris.
        const graveyard = graveyardChoicesForPlay(state, playerId, def);
        if (graveyard.length > 0) {
          for (const pick of graveyard) {
            actions.push({
              type: "playCard",
              playerId,
              instanceId: card.instanceId,
              chosenGraveyardInstanceId: pick.instanceId,
            });
          }
        } else {
          actions.push({ type: "playCard", playerId, instanceId: card.instanceId });
        }
      }
      // Bris depuis la main (coût réduit, sans Slot) : même variantes de cible/défausse qu'un Objet posé.
      if (def.type === "objet") actions.push(...breakVariants(state, playerId, card.instanceId, def, true));
    }

    for (const unit of player.board) {
      const def = getCardDefinition(unit.cardId);
      if (def.type === "objet") actions.push(...breakVariants(state, playerId, unit.instanceId, def, false));
      actions.push({ type: "saborder", playerId, instanceId: unit.instanceId });

      // Capacité activable de la carte elle-même (`activatableOncePerTurn`,
      // ex: Sondeur des Mauvaises Eaux). Sans ça, le bot ignorait purement
      // et simplement une action que le moteur lui accorde : ses cartes à
      // capacité discrétionnaire n'étaient, pour lui, que des statistiques.
      if (def.activatableOncePerTurn) {
        const targeted = def.activatableOncePerTurn.effects.find((e) => e.target.kind === "chosenUnit");
        if (targeted) {
          for (const { unit: target } of eligibleChosenUnits(state, targeted.target, playerId, unit.instanceId)) {
            actions.push({ type: "activateAbility", playerId, sourceInstanceId: unit.instanceId, targetInstanceId: target.instanceId });
          }
        } else {
          actions.push({ type: "activateAbility", playerId, sourceInstanceId: unit.instanceId });
        }
      }
    }

    if (state.phase === "mainPhase") {
      actions.push({ type: "advancePhase", playerId });
      // N'offre "passer directement" que s'il n'y a rien à attaquer derrière —
      // sinon `chooseAction.ts` favorise de toute façon `advancePhase` via son
      // bonus heuristique, mais autant ne pas tenter le sort avec un
      // choix aléatoire (difficulté "facile") qui zapperait une attaque gratuite.
      if (!player.board.some((unit) => canUnitAttack(state, playerId, unit.instanceId))) {
        actions.push({ type: "endTurn", playerId });
      }
    } else {
      // Phase principale 2 : le combat est derrière, la seule sortie est la fin du tour.
      actions.push({ type: "endTurn", playerId });
    }
  } else if (state.phase === "combatPhase") {
    actions.push({ type: "endTurn", playerId });
    for (const unit of player.board) {
      if (!canUnitAttack(state, playerId, unit.instanceId)) continue;
      actions.push({ type: "attack", playerId, attackerInstanceId: unit.instanceId });
      for (const defender of opponent?.board ?? []) {
        actions.push({
          type: "attack",
          playerId,
          attackerInstanceId: unit.instanceId,
          defenderInstanceId: defender.instanceId,
        });
      }
    }
  } else {
    actions.push({ type: "endTurn", playerId });
  }

  return actions;
}
