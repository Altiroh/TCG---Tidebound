import { getShipDefinition } from "@/game/environment/shipData";
import { computeEffectiveStats } from "@/game/cards/stats";
import { getCardDefinition } from "@/game/cards/sets/core";
import { UNIT_CARD_TYPES, type CardInstance } from "@/game/cards/types";
import { hasEffectiveKeyword } from "@/game/rules/validation";
import { deraisonDebt } from "@/game/state/reason";
import type { GameState, PlayerId, PlayerState } from "@/game/state/types";

/**
 * Évaluation d'une position, du point de vue d'un joueur.
 *
 * Sert UNIQUEMENT à classer des coups (`chooseAction.ts`, `searchTurn.ts`),
 * jamais à en valider un. Une erreur ici ne rend pas un coup illégal : elle
 * rend le bot bête. Ce qui suit dit donc explicitement ce que « bien
 * jouer » veut dire à Tidebound.
 */

const KEYWORD_GARDE = "garde";

/**
 * ANCRAGE. Le point qui rendait le bot stupide.
 *
 * L'Ancrage était compté linéairement (× 3) et le moteur ne le PLAFONNE
 * pas : soigner 2 Ancrage à pleine santé montait donc le score de 6, pour
 * n'apporter en jeu strictement rien. Une structure à 3 de Résistance ne
 * valant que 3,6, le bot sabordait « Caisses Arrimées » (« Sabordage :
 * récupérez 2 Ancrage ») dès qu'il la posait — un gain de 2,4 au tableau,
 * une perte sèche en partie. C'est exactement le sabordage gratuit observé.
 *
 * L'Ancrage se lit donc en TROIS régimes :
 *   - au-dessus de l'Ancrage de départ du Navire : du surplus. Il ne
 *     rapproche d'aucune victoire et ne protège que d'un excédent de
 *     dégâts — il vaut peu ;
 *   - entre zéro et l'Ancrage de départ : la vraie monnaie de la partie ;
 *   - les derniers points : ils valent davantage, parce que les perdre,
 *     c'est perdre. Ce supplément rend le bot prudent quand il encaisse, et
 *     féroce quand c'est l'adversaire qui est bas.
 */
const ANCHOR_SURPLUS_VALUE = 0.5;
const ANCHOR_VITAL_VALUE = 3;
/** Nombre de points « du fond de la coque » qui valent double. */
const ANCHOR_CRITICAL_BAND = 6;
const ANCHOR_CRITICAL_BONUS = 3;

function anchorValue(player: PlayerState): number {
  const start = startingAnchorOf(player);
  const vital = Math.max(0, Math.min(player.anchor, start));
  const surplus = Math.max(0, player.anchor - start);

  // Bande critique : les `ANCHOR_CRITICAL_BAND` premiers points au-dessus de
  // zéro portent un supplément qui décroît à mesure qu'on s'en éloigne.
  const critical = Math.max(0, ANCHOR_CRITICAL_BAND - vital);
  const criticalPenalty = critical * ANCHOR_CRITICAL_BONUS;

  return vital * ANCHOR_VITAL_VALUE + surplus * ANCHOR_SURPLUS_VALUE - criticalPenalty;
}

function startingAnchorOf(player: PlayerState): number {
  try {
    return getShipDefinition(player.shipId).startingAnchor;
  } catch {
    // Navire retiré du jeu : un repli raisonnable vaut mieux qu'une
    // exception au milieu d'une recherche.
    return 20;
  }
}

/**
 * Valeur d'un permanent. Une unité vaut sa Puissance et sa Résistance ; un
 * permanent sans Puissance (Structure, Objet, Anomalie, Équipement) n'est
 * pas pour autant du décor — il occupe un Slot, encaisse, et porte souvent
 * un effet. D'où un plancher : aucun permanent posé ne vaut zéro, sans quoi
 * s'en débarrasser serait toujours gratuit.
 */
const PERMANENT_FLOOR = 2.5;
/** Ce qu'ajoute Garde : l'unité protège le Navire, c'est sa vraie fonction. */
const GARDE_BONUS = 2;
/** Une unité qui ne peut pas encore attaquer vaut un peu moins — mais elle sera là au prochain tour. */
const SUMMONING_SICK_FACTOR = 0.85;

function permanentValue(state: GameState, unit: CardInstance, controller: PlayerState): number {
  const stats = computeEffectiveStats(unit, state.environment.tideState, {
    controllerBoard: controller.board,
    controllerReason: controller.reason,
  });

  const def = getCardDefinition(unit.cardId);
  const isUnit = (UNIT_CARD_TYPES as readonly string[]).includes(def.type);

  let value = stats.attack * 1.5 + stats.health * 1.2;
  if (hasEffectiveKeyword(state, controller, unit, KEYWORD_GARDE)) value += GARDE_BONUS;
  if (isUnit && unit.summoningSick) value *= SUMMONING_SICK_FACTOR;

  // Inactive à cause de la Marée : elle ne fait rien MAINTENANT, mais elle
  // tient son Slot et redeviendra active. Diminuée, jamais annulée.
  if (stats.inactive) value *= 0.55;

  return Math.max(PERMANENT_FLOOR, value);
}

/**
 * MENACE. Ce que l'adversaire peut infliger au Navire au prochain tour, une
 * fois les bloqueurs Garde déduits. Une évaluation qui ne regarde que les
 * statistiques ne voit pas la différence entre « je mène de 4 points » et
 * « je mène de 4 points et je meurs au prochain tour ».
 */
function unblockedThreat(state: GameState, attacker: PlayerState, defender: PlayerState): number {
  const gardes = defender.board.filter((unit) => hasEffectiveKeyword(state, defender, unit, KEYWORD_GARDE)).length;

  const hits = attacker.board
    .filter((unit) => (UNIT_CARD_TYPES as readonly string[]).includes(getCardDefinition(unit.cardId).type))
    .map((unit) =>
      computeEffectiveStats(unit, state.environment.tideState, {
        controllerBoard: attacker.board,
        controllerReason: attacker.reason,
      })
    )
    .filter((stats) => !stats.inactive && stats.attack > 0)
    .map((stats) => stats.attack)
    .sort((a, b) => b - a);

  // Chaque Garde absorbe l'attaque la plus forte : c'est le pire cas pour
  // l'attaquant, et donc l'estimation prudente du côté du défenseur.
  return hits.slice(gardes).reduce((sum, attack) => sum + attack, 0);
}

/** Une carte en main vaut d'autant plus qu'on a la Raison pour la jouer. */
const CARD_IN_HAND = 0.9;

function playerValue(state: GameState, player: PlayerState): number {
  const boardValue = player.board.reduce((sum, unit) => sum + permanentValue(state, unit, player), 0);

  // Déraison : chaque point sous zéro sera payé en Ancrage en fin de tour —
  // compté comme de l'Ancrage déjà perdu, un peu plus lourd pour que le bot
  // ne plonge en dette que si le plateau le justifie clairement.
  const debt = deraisonDebt(player.reason);

  return (
    anchorValue(player) -
    debt * ANCHOR_VITAL_VALUE * 1.2 +
    Math.max(0, player.reason) * 0.5 +
    boardValue +
    player.hand.length * CARD_IN_HAND
  );
}

/**
 * Score une position du point de vue de `forPlayerId` : plus c'est élevé,
 * meilleure est la position. Comparable d'un état à l'autre, jamais lu
 * comme une valeur absolue.
 */
export function evaluateState(state: GameState, forPlayerId: PlayerId): number {
  if (state.status === "finished") {
    if (state.winnerId === forPlayerId) return 100000;
    if (state.winnerId === undefined) return 0;
    return -100000;
  }

  const me = state.players.find((p) => p.id === forPlayerId);
  const opponent = state.players.find((p) => p.id !== forPlayerId);
  if (!me || !opponent) return 0;

  const material = playerValue(state, me) - playerValue(state, opponent);

  // Pression : la menace que je fais peser, moins celle que je subis. Fait
  // préférer un plateau qui MENACE à un plateau qui accumule, et rend le
  // bot attentif aux bloqueurs qu'il abandonne.
  const pressure = unblockedThreat(state, me, opponent) - unblockedThreat(state, opponent, me);

  return material + pressure * 1.1;
}
