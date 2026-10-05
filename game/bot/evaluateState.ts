import { getShipDefinition } from "@/game/environment/shipData";
import { advanceTideState } from "@/game/environment/types";
import { computeEffectiveStats } from "@/game/cards/stats";
import { getCardDefinition } from "@/game/cards/sets/core";
import { hasResistance, UNIT_CARD_TYPES, type CardInstance } from "@/game/cards/types";
import { hasEffectiveKeyword } from "@/game/rules/validation";
import { deraisonAnchorDamage } from "@/game/state/reason";
import { isShipArmed, shipAbilityOf } from "@/game/state/shipAbility";
import type { GameState, PlayerId, PlayerState } from "@/game/state/types";
import { graveyardValue, oceanJudgmentPressure } from "@/game/bot/graveyardValue";
import { abilityValue } from "@/game/bot/abilityValue";

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

  // Emportée par cette Marée (affinité `destroyed`) : elle ne vaut plus
  // rien. Sans objet dans l'état courant — le moteur l'a déjà retirée — mais
  // décisif quand on évalue la Marée QUI VIENT (`tideOutlook`).
  if (stats.destroyedByTide) return 0;

  const def = getCardDefinition(unit.cardId);
  const isUnit = (UNIT_CARD_TYPES as readonly string[]).includes(def.type);

  // Résistance RESTANTE, pas la Résistance imprimée : `stats.health` est un
  // maximum, les dégâts déjà marqués n'en sortaient nulle part. Le bot ne
  // voyait donc aucune différence entre une Créature intacte et la même à un
  // point de la mort — et tout coup qui blesse sans tuer lui apparaissait
  // comme strictement inutile. C'est précisément ce que fait le Canon de
  // proue, mais ça valait déjà pour chaque attaque non létale.
  const remaining = Math.max(0, stats.health - unit.damageMarked);

  let value = stats.attack * 1.5 + remaining * 1.2;
  if (hasEffectiveKeyword(state, controller, unit, KEYWORD_GARDE)) value += GARDE_BONUS;
  // Le mal d'arrivée ne coûte que tant qu'une attaque reste possible ce
  // tour-ci : en Phase principale 2 le combat est passé, une unité fraîche
  // vaut autant qu'une autre. Sans cette nuance, rejouer une unité après le
  // combat (le rappel du Théâtre Englouti) paraissait lui faire perdre 15 %.
  const attackStillAhead = state.activePlayerId === controller.id && state.phase !== "mainPhase2";
  if (isUnit && unit.summoningSick && attackStillAhead) value *= SUMMONING_SICK_FACTOR;

  // Ce que ses capacités déclenchées rapporteront dans les tours à venir
  // (`abilityValue.ts`) : un moteur posé vaut plus que sa Résistance.
  value += abilityValue(state, unit, controller);

  // Inactive à cause de la Marée : elle ne fait rien MAINTENANT, mais elle
  // tient son Slot et redeviendra active. Diminuée, jamais annulée.
  if (stats.inactive) value *= 0.55;

  return Math.max(PERMANENT_FLOOR, value);
}

/**
 * LA PEUR. Ce que pèse une menace, selon qu'on la fait peser ou qu'on la
 * subit — et le point qui faisait bourriner le bot.
 *
 * Les deux comptaient pareil (1,1), alors qu'un point d'Ancrage en vaut 3.
 * Une créature adverse laissée en vie ne coûtait donc que 0,37 le point de
 * Puissance, quand elle frappe à CHAQUE tour. Le calcul tombait toujours
 * du même côté : taper le Navire pour 4 rapportait 12, tuer une 4/4 en y
 * laissant la sienne rapportait 0. Le bot allait au visage,
 * systématiquement, ne défendait jamais, et la partie se réduisait à une
 * course.
 *
 * La menace SUBIE vaut maintenant exactement ce qu'elle va coûter : un
 * point d'Ancrage par point de Puissance, puisque c'est précisément ce
 * qu'elle prendra au prochain tour. L'échange équilibré reste neutre —
 * c'est juste, une créature contre une créature n'avance personne — mais
 * l'échange FAVORABLE passe devant les dégâts directs, et un bloqueur
 * Garde vaut enfin ce qu'il retient.
 *
 * Mesuré sur 12 parties « moyen » contre « moyen » : la part des attaques
 * portées au Navire plutôt qu'à une unité tombe de 77 % à 65 %, les
 * parties durent plus longtemps, et le bot joue davantage de tout —
 * Objets brisés, Équipements, réactions. L'échelle de difficulté, elle,
 * ne bouge pas (`tests/game/botDifficultyLadder.test.ts`).
 */
const THREAT_MADE = 1.1;
const THREAT_TAKEN = ANCHOR_VITAL_VALUE;

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
        // La menace se mesure au tour où ces unités attaqueront : le leur.
        controllerIsActive: true,
      })
    )
    .filter((stats) => !stats.inactive && stats.attack > 0)
    .map((stats) => stats.attack)
    .sort((a, b) => b - a);

  // Chaque Garde absorbe l'attaque la plus forte : c'est le pire cas pour
  // l'attaquant, et donc l'estimation prudente du côté du défenseur.
  return hits.slice(gardes).reduce((sum, attack) => sum + attack, 0);
}

/** Ce que vaut une carte en main, quelle qu'elle soit. */
const CARD_IN_HAND = 0.9;
/**
 * DÉPARTAGE DES CARTES EN MAIN. Toutes valaient exactement 0,9 : face à une
 * défausse, le bot jetait donc la première venue — y compris l'unité qu'il
 * venait de rappeler pour la rejouer (Le Masque Fendu : « renvoyez… puis
 * piochez 1 carte et défaussez 1 carte », relevé du 29/09/2026). Un léger
 * supplément selon le coût fait garder la carte qui pèse le plus, sans
 * rien changer à l'arbitrage « jouer ou garder » : 0,05 par point de coût,
 * c'est dix fois moins que la Raison dépensée pour la jouer.
 */
const CARD_IN_HAND_PER_COST = 0.05;

function handValue(player: PlayerState): number {
  return player.hand.reduce((sum, card) => {
    let cost = 0;
    try {
      cost = getCardDefinition(card.cardId).cost;
    } catch {
      // Carte masquée d'une vue projetée : on n'en sait que le nombre.
    }
    return sum + CARD_IN_HAND + Math.min(cost, 8) * CARD_IN_HAND_PER_COST;
  }, 0);
}

/**
 * CANON ARMÉ. Ce que vaut une capacité de Navire déjà payée mais pas encore
 * tirée (Le Goliath — Canon de proue).
 *
 * Sans ce terme, armer serait un coup PUREMENT négatif pour une évaluation
 * à un coup : 2 Raison en moins, rien en face. Les difficultés « facile » et
 * « moyen », qui jugent le coup sur l'état qu'il produit immédiatement,
 * n'armeraient jamais — seul « difficile » verrait le tir, au bout de sa
 * recherche de tour.
 *
 * Le coefficient est délibérément BAS — en dessous de ce que le tir lui-même
 * rapporte, même sur la plus petite cible (2 dégâts ≈ 2,4 points de
 * Résistance, 6 points sur le Navire adverse). Un canon armé doit valoir
 * assez pour qu'on l'arme, jamais assez pour qu'on préfère le garder chargé
 * plutôt que de tirer — il se referme de toute façon en fin de tour.
 */
const ARMED_SHOT_VALUE = 1;

/** Dégâts forfaitaires que le tir armé infligerait, d'après ses effets. `1` par défaut : un tir qui ne fait pas de dégâts vaut quand même mieux qu'un canon vide. */
function armedShotDamage(player: PlayerState): number {
  const shot = shipAbilityOf(player)?.armedShot;
  if (!shot) return 0;
  const damage = shot.effects.reduce((sum, effect) => {
    if (effect.type !== "damage" || effect.amount?.kind !== "flat") return sum;
    return sum + effect.amount.value;
  }, 0);
  return Math.max(1, damage);
}

/** Valeur du canon actuellement armé de ce joueur — nulle s'il ne l'est pas. */
function armedShotValue(state: GameState, player: PlayerState): number {
  if (!isShipArmed(player, state.turnNumber)) return 0;
  return armedShotDamage(player) * ARMED_SHOT_VALUE;
}

function playerValue(state: GameState, player: PlayerState): number {
  const boardValue = player.board.reduce((sum, unit) => sum + permanentValue(state, unit, player), 0);

  // Déraison : la dette sera payée en Ancrage en fin de tour — comptée comme
  // de l'Ancrage déjà perdu, un peu plus lourd pour que le bot ne plonge en
  // dette que si le plateau le justifie clairement.
  //
  // Le montant est demandé au MOTEUR (`deraisonAnchorDamage`) plutôt que
  // recalculé à plat ici : c'est la seule façon pour le bot de voir la
  // réduction de son propre Navire (Pénitence), et de sentir un barème
  // progressif s'il y en a un. Un bot qui ne voit pas le prix d'un point ne
  // peut pas être dissuadé par ce prix — et le banc d'essai, alors, ne
  // mesure plus une dissuasion mais une simple taxe.
  const dette = deraisonAnchorDamage(player, player.reason);

  return (
    anchorValue(player) -
    dette * ANCHOR_VITAL_VALUE * 1.2 +
    Math.max(0, player.reason) * 0.5 +
    boardValue +
    armedShotValue(state, player) +
    handValue(player) +
    // Cimetière : ce que les cartes tenues sauront en tirer (`graveyardValue.ts`).
    graveyardValue(state, player)
  );
}

/**
 * LA MARÉE QUI VIENT.
 *
 * L'évaluation lisait les stats dans la Marée COURANTE, jamais dans la
 * suivante. Raccourcir la Marée, inverser son sens, la maintenir : pour le
 * bot, tout cela coûtait de la Raison et ne rapportait rien. Il pilotait mal,
 * et le banc d'essai ne pouvait pas juger les decks qui pilotent (Descente
 * aux Abysses, relevé du 30/09/2026 : le Sondeur posé 0,3 fois par partie).
 *
 * On compare donc, pour chaque camp, la valeur de son plateau dans l'état
 * de Marée SUIVANT (selon l'orientation) à sa valeur actuelle — stats,
 * inactivité, destructions : tout est lu dans les affinités de Marée des
 * cartes (`tideAffinity`), rien n'est nommé ici. L'écart pèse d'autant plus
 * que le changement est proche : `TIDE_LOOKAHEAD / tours restants`. Une
 * Marée maintenue (« maintain ») ne change pas au prochain décompte : son
 * écart ne pèse qu'à moitié.
 */
const TIDE_LOOKAHEAD = 0.5;

function boardValue(state: GameState, player: PlayerState): number {
  return player.board.reduce((sum, unit) => sum + permanentValue(state, unit, player), 0);
}

function tideOutlook(state: GameState, me: PlayerState, opponent: PlayerState): number {
  const env = state.environment;
  const next = advanceTideState(env.tideState, env.tideOrientation);
  if (next === env.tideState) return 0;

  const future: GameState = { ...state, environment: { ...env, tideState: next } };
  const shift = (player: PlayerState) => boardValue(future, player) - boardValue(state, player);

  const maintained = env.pendingTideModifiers.some((m) => m.kind === "maintain" && m.remainingTriggers > 0);
  const weight = (TIDE_LOOKAHEAD / Math.max(1, env.tideRemainingTurns)) * (maintained ? 0.5 : 1);
  return weight * (shift(me) - shift(opponent));
}

/**
 * LA LANDE EN JEU — ce que ses règles feront dans les tours qui restent,
 * lu dans ses données (`LandeRules`), jamais dans son nom.
 *
 *  - Retrait de mot-clé (Pluie corrosive) : rien à faire ici, la Garde
 *    passe déjà par `hasEffectiveKeyword`, qui lit la Lande.
 *  - Dégâts à chaque tour de table (Vallée de verre) : le plateau de chaque
 *    camp, relu comme s'il avait déjà encaissé les tours restants. Les
 *    corps fragiles valent ce qu'il en restera.
 *  - Limite d'arrivées (Chaîne de construction) : chaque unité en main
 *    au-delà de ce que la limite laisse passer est un tempo perdu.
 */
const LANDE_LOOKAHEAD = 0.5;
const LANDE_BLOCKED_UNIT = 0.8;

function landeOutlook(state: GameState, me: PlayerState, opponent: PlayerState): number {
  const lande = state.environment.lande;
  const rules = lande ? getCardDefinition(lande.cardId).lande : undefined;
  if (!lande || !rules) return 0;
  const tableTurns = Math.ceil(lande.remainingPlayerTurns / 2);
  let value = 0;

  if (rules.damageAllPermanentsEachTableTurn) {
    const hit = rules.damageAllPermanentsEachTableTurn * tableTurns;
    // Ce que vaudra le plateau une fois les coups encaissés : un corps qui
    // n'y survit pas ne vaut plus rien.
    const after = (player: PlayerState) =>
      player.board.reduce((sum, unit) => {
        if (!hasResistance(getCardDefinition(unit.cardId))) return sum + permanentValue(state, unit, player);
        const hurt = { ...unit, damageMarked: unit.damageMarked + hit };
        const stats = computeEffectiveStats(hurt, state.environment.tideState, { controllerBoard: player.board, controllerReason: player.reason });
        return sum + (stats.health > hurt.damageMarked ? permanentValue(state, hurt, player) : 0);
      }, 0);
    const loss = (player: PlayerState) => boardValue(state, player) - after(player);
    value += LANDE_LOOKAHEAD * (loss(opponent) - loss(me));
  }

  if (rules.unitArrivalsPerTurn !== undefined) {
    const blocked = (player: PlayerState) =>
      Math.max(0, player.hand.filter((c) => (UNIT_CARD_TYPES as readonly string[]).includes(getCardDefinition(c.cardId).type)).length - rules.unitArrivalsPerTurn! * tableTurns);
    value += LANDE_BLOCKED_UNIT * (blocked(opponent) - blocked(me));
  }
  return value;
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

  // Pression : la menace que je fais peser, moins — bien plus lourdement —
  // celle que je subis (cf. `THREAT_TAKEN`). Fait préférer un plateau qui
  // MENACE à un plateau qui accumule, et rend le bot attentif aux bloqueurs
  // qu'il abandonne comme aux corps adverses qu'il laisse debout.
  const pressure = unblockedThreat(state, me, opponent) * THREAT_MADE - unblockedThreat(state, opponent, me) * THREAT_TAKEN;

  // Pioches bientôt vides : l'avance au Jugement de l'Océan décide de la partie.
  const judgment = oceanJudgmentPressure(me, opponent);

  // La Marée qui vient : qui y gagne, qui y perd (`tideOutlook`).
  const tide = tideOutlook(state, me, opponent);

  // La Lande en jeu : ce qu'elle fera encore à chaque camp (`landeOutlook`).
  const lande = landeOutlook(state, me, opponent);

  return material + pressure + judgment + tide + lande;
}
