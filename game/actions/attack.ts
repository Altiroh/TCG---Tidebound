import type { CardInstance } from "@/game/cards/types";
import { getCardDefinition } from "@/game/cards/sets/core";
import { computeEffectiveStats } from "@/game/cards/stats";
import { getShipDefinition } from "@/game/environment/shipData";
import { isVisibleDuringTide } from "@/game/cards/types";
import { collectReactionCandidates } from "@/game/triggers/triggerBus";
import type { TriggerEvent } from "@/game/triggers/types";
import { reasonAfterLoss } from "@/game/state/reason";
import type { GameEvent } from "@/game/events/types";
import { processTrigger } from "@/game/triggers/triggerBus";
import {
  assertGameActive,
  assertInPhase,
  assertIsActivePlayer,
  assertPlayerInGame,
  assertUnitCanAttack,
  assertValidDefender,
  combine,
} from "@/game/rules/validation";
import {
  consumeDirectShipDamageShield,
  consumeOwnDamageTakenShield,
  consumeStructureResistanceRestoreShield,
} from "@/game/state/shields";
import { getOpponent, getPlayer, type GameState, type PlayerState } from "@/game/state/types";
import type { ActionResult, AttackAction } from "@/game/actions/types";

function effectiveAttack(unit: CardInstance, state: GameState): number {
  const controller = getPlayer(state, unit.ownerId);
  return computeEffectiveStats(unit, state.environment.tideState, {
    controllerBoard: controller.board,
    controllerReason: controller.reason,
    tideOrientation: state.environment.tideOrientation,
  }).attack;
}

/**
 * Bonus de dégâts (attaquant lui-même + un Équipement qui lui serait
 * attaché) quand la cible de l'attaque est du type visé — ex: Barracuda/
 * Poisson-Scie Gris "+1 contre une Structure", Corde de Remorquage "+1 à
 * l'unité équipée contre une Structure". Ne s'applique qu'aux attaques
 * ciblant une unité (pas une attaque directe du Navire, qui n'a pas de
 * carte-cible) et n'entre jamais dans le calcul de la riposte.
 */
function bonusDamageAgainst(attacker: CardInstance, defenderType: string, state: GameState): number {
  let bonus = 0;
  const attackerDef = getCardDefinition(attacker.cardId);
  if (attackerDef.bonusDamageVsTargetType?.type === defenderType) {
    bonus += attackerDef.bonusDamageVsTargetType.amount;
  }
  for (const unit of [...state.players[0].board, ...state.players[1].board]) {
    if (unit.attachedToInstanceId !== attacker.instanceId) continue;
    const equipDef = getCardDefinition(unit.cardId);
    if (equipDef.bonusDamageVsTargetType?.type === defenderType) {
      bonus += equipDef.bonusDamageVsTargetType.amount;
    }
  }
  return bonus;
}

/** Somme `selfDamageOnDirectAttack` de l'attaquant et de tout Équipement qui lui serait attaché (ex: Requin Balafré, Harpon de Pont). */
function selfDamageOnDirectAttack(attacker: CardInstance, state: GameState): number {
  let total = getCardDefinition(attacker.cardId).selfDamageOnDirectAttack ?? 0;
  for (const unit of [...state.players[0].board, ...state.players[1].board]) {
    if (unit.attachedToInstanceId !== attacker.instanceId) continue;
    total += getCardDefinition(unit.cardId).selfDamageOnDirectAttack ?? 0;
  }
  return total;
}

/** Somme `opponentReasonLossOnDirectAttack` (filtré par `tideStateIn` si présent) de l'attaquant et de tout Équipement attaché (ex: Anguille des Profondeurs, Bat-Marin Abyssal). */
function opponentReasonLossOnDirectAttack(attacker: CardInstance, state: GameState): number {
  const applies = (def: ReturnType<typeof getCardDefinition>) => {
    const effect = def.opponentReasonLossOnDirectAttack;
    if (!effect) return 0;
    if (effect.tideStateIn && !effect.tideStateIn.includes(state.environment.tideState)) return 0;
    return effect.amount;
  };
  let total = applies(getCardDefinition(attacker.cardId));
  for (const unit of [...state.players[0].board, ...state.players[1].board]) {
    if (unit.attachedToInstanceId !== attacker.instanceId) continue;
    total += applies(getCardDefinition(unit.cardId));
  }
  return total;
}

/** Somme `bonusDamageInTideState` (attaquant + Équipement attaché) actif pour la Marée courante — s'applique à TOUTE attaque, directe ou contre une unité (ex: Harponneur du Dernier Quai). */
function bonusDamageInTideState(attacker: CardInstance, state: GameState): number {
  const applies = (def: ReturnType<typeof getCardDefinition>) => {
    const effect = def.bonusDamageInTideState;
    if (!effect || !effect.tideStateIn.includes(state.environment.tideState)) return 0;
    return effect.amount;
  };
  let total = applies(getCardDefinition(attacker.cardId));
  for (const unit of [...state.players[0].board, ...state.players[1].board]) {
    if (unit.attachedToInstanceId !== attacker.instanceId) continue;
    total += applies(getCardDefinition(unit.cardId));
  }
  return total;
}

/** Somme `controllerReasonLossAfterAttack` (attaquant + Équipement attaché) — s'applique après TOUTE attaque, directe ou contre une unité (ex: Harponneur du Dernier Quai, Treuil à Chair non câblé). */
function controllerReasonLossAfterAttack(attacker: CardInstance, state: GameState): number {
  let total = getCardDefinition(attacker.cardId).controllerReasonLossAfterAttack ?? 0;
  for (const unit of [...state.players[0].board, ...state.players[1].board]) {
    if (unit.attachedToInstanceId !== attacker.instanceId) continue;
    total += getCardDefinition(unit.cardId).controllerReasonLossAfterAttack ?? 0;
  }
  return total;
}

/** Applique des dégâts de COMBAT à une unité, en respectant son propre bouclier "1ère fois par tour" (Baleine aux Cicatrices Blanches) et, si c'est une Structure, la restauration de Wood Vy — retourne le montant réellement marqué (peut être 0 si totalement absorbé). Utilisé aussi bien pour les dégâts au défenseur que pour la riposte à l'attaquant : "elle subit des dégâts" ne distingue pas les deux rôles. */
function applyCombatDamageToUnit(
  state: GameState,
  ownerId: string,
  unit: CardInstance,
  amount: number,
  turnNumber: number
): { state: GameState; amountApplied: number } {
  if (amount <= 0) return { state, amountApplied: 0 };
  const selfShield = consumeOwnDamageTakenShield(state, ownerId, unit.instanceId, turnNumber);
  let nextState = selfShield.state;
  let reduction = selfShield.reduction;
  if (getCardDefinition(unit.cardId).type === "structure") {
    const restoreShield = consumeStructureResistanceRestoreShield(nextState, ownerId, turnNumber);
    nextState = restoreShield.state;
    reduction += restoreShield.restore;
  }
  const finalAmount = Math.max(0, amount - reduction);
  if (finalAmount <= 0) return { state: nextState, amountApplied: 0 };
  nextState = {
    ...nextState,
    players: nextState.players.map((p) =>
      p.id === ownerId
        ? {
            ...p,
            board: p.board.map((u) =>
              u.instanceId === unit.instanceId
                ? { ...u, damageMarked: u.damageMarked + finalAmount, lastDamageCause: "combat" as const }
                : u
            ),
          }
        : p
    ) as [PlayerState, PlayerState],
  };
  return { state: nextState, amountApplied: finalAmount };
}

function validate(state: GameState, action: AttackAction) {
  return combine(
    assertGameActive(state),
    assertPlayerInGame(state, action.playerId),
    assertIsActivePlayer(state, action.playerId),
    assertInPhase(state, action.playerId, "combatPhase"),
    assertUnitCanAttack(state, action.playerId, action.attackerInstanceId),
    assertValidDefender(state, action.playerId, action.attackerInstanceId, action.defenderInstanceId)
  );
}

/**
 * Résout une attaque : soit une unité contre une autre, soit une unité
 * contre le joueur adverse directement.
 *
 * Combat MUTUEL (changement d'équilibrage confirmé) : quand l'attaque vise
 * une unité (pas le Navire directement), le défenseur riposte — l'attaquant
 * encaisse la Puissance effective du défenseur, exactement symétrique aux
 * dégâts qu'il inflige lui-même. Un permanent sans Puissance (Structure/
 * Objet, `attack` absent → 0 via `computeEffectiveStats`) ne riposte pas.
 * Une attaque directe contre le Navire adverse, elle, ne fait toujours
 * subir aucun dégât en retour (rien à riposter).
 *
 * Les morts éventuelles (attaquant ET défenseur) sont traitées par
 * l'appelant (`engine.ts`) via `processDeaths`, pas ici : cette fonction ne
 * fait que marquer les dégâts.
 */
/**
 * Ouvre la fenêtre d'interception si le DÉFENSEUR a au moins un piège
 * éligible, et suspend l'attaque. Retourne `undefined` quand il n'y a rien
 * à proposer — cas normal, et l'attaque se résout sans détour.
 *
 * `hasAttackedThisTurn` n'est PAS posé ici mais à la résolution, comme pour
 * une attaque ordinaire : le poser à la déclaration ferait échouer la
 * reprise, que la validation rejetterait au motif que l'attaquant a déjà
 * attaqué. Aucun risque de double attaque pour autant — tant que la fenêtre
 * est ouverte, `dispatch` n'accepte aucune autre action que la réponse du
 * défenseur, et la résolution suit immédiatement.
 */
function suspendrePourInterception(
  state: GameState,
  action: AttackAction
): { suspendu: ActionResult } | { poursuivre: GameState; events: GameEvent[] } {
  const defenderId = getOpponent(state, action.playerId).id;
  // Deux déclencheurs pour une seule fenêtre : « une unité adverse attaque »
  // couvre AUSSI un combat entre unités (Filet à la Dérive), là où « votre
  // Navire devrait subir des dégâts directs » ne concerne que la coque.
  const triggerEvents: TriggerEvent[] = [
    { trigger: "onUnitAttackDeclared", playerId: defenderId, sourceInstanceId: action.attackerInstanceId },
    ...(action.defenderInstanceId
      ? []
      : ([{ trigger: "onIncomingDirectAttack", playerId: defenderId, sourceInstanceId: action.attackerInstanceId }] as TriggerEvent[])),
  ];
  const base = { turnNumber: state.turnNumber, timestamp: Date.now() };
  const attackerPlayer = getPlayer(state, action.playerId);
  const attaquant = attackerPlayer.board.find((u) => u.instanceId === action.attackerInstanceId)!;

  // L'attaque devient « déclarée » AVANT toute réponse : c'est `pendingAttack`
  // qui porte la Puissance sur laquelle les pièges mordent, qu'ils soient
  // automatiques ou choisis.
  let declaree: GameState = {
    ...state,
    pendingAttack: {
      playerId: action.playerId,
      attackerInstanceId: action.attackerInstanceId,
      defenderInstanceId: action.defenderInstanceId,
      attackerPower: effectiveAttack(attaquant, state) + bonusDamageInTideState(attaquant, state),
    },
  };

  // 1. Les défenses AUTOMATIQUES du défenseur s'appliquent d'abord : un texte
  //    sans « vous pouvez » ne se propose pas, il agit (Filet à la Dérive
  //    visible, Le Filet qui Respire visible).
  const evenements: GameEvent[] = [];
  for (const triggerEvent of triggerEvents) {
    const auto = processTrigger(declaree, triggerEvent, state.turnNumber);
    declaree = auto.state;
    evenements.push(...auto.events);
  }

  // 2. Puis les pièges FACULTATIFS, s'il y en a : c'est eux seuls qui
  //    suspendent l'attaque et rendent la main au défenseur.
  const candidats = collectReactionCandidates(declaree, triggerEvents, defenderId, state.turnNumber);
  if (candidats.length === 0) {
    // Rien à proposer : l'attaque se poursuit dans la foulée, avec les
    // éventuelles réductions automatiques déjà posées.
    return { poursuivre: declaree, events: evenements };
  }

  const suspended: GameState = {
    ...declaree,
    pendingReaction: {
      events: triggerEvents,
      awaitingPlayerId: defenderId,
      priorityQueue: [],
      usedCandidateKeys: [],
      turnNumber: state.turnNumber,
    },
  };

  return {
    suspendu: {
      ok: true,
      state: suspended,
      events: [
        { ...base, type: "ATTACK", playerId: action.playerId, attackerInstanceId: action.attackerInstanceId, defenderInstanceId: action.defenderInstanceId },
        ...evenements,
        { ...base, type: "REACTION_WINDOW_OPENED", playerId: defenderId },
      ],
    },
  };
}

export function attack(state: GameState, action: AttackAction): ActionResult {
  const validation = validate(state, action);
  if (!validation.ok) return { ok: false, error: validation.error };

  // --- FENÊTRE D'INTERCEPTION (grammaire des pièges, 21/09/2026) --------
  //
  // Avant de calculer quoi que ce soit, on demande au défenseur s'il
  // intercepte. La fenêtre s'ouvre à la DÉCLARATION, pas au milieu de la
  // résolution : rien n'a encore été consommé, donc il n'y a pas d'attaque
  // coupée en deux à recoller — seulement une attaque pas encore commencée.
  //
  // Seules les attaques DIRECTES au Navire ouvrent cette fenêtre : un
  // combat entre deux unités n'a pas de piège à proposer aujourd'hui.
  //
  // `state.pendingAttack` déjà posé = on est dans la REPRISE, la fenêtre a
  // été posée puis refermée ; on résout pour de bon.
  let etat = state;
  const evenementsDeclaration: GameEvent[] = [];
  if (!state.pendingAttack) {
    const declaration = suspendrePourInterception(state, action);
    if ("suspendu" in declaration) return declaration.suspendu;
    etat = declaration.poursuivre;
    evenementsDeclaration.push(...declaration.events);
  }

  const attackerPlayer = getPlayer(etat, action.playerId);
  const declaredAttacker = attackerPlayer.board.find((u) => u.instanceId === action.attackerInstanceId)!;
  // À la REPRISE, la Puissance déclarée fait foi : c'est elle qu'un piège a
  // pu amputer (`modifyAttackerPower`), et la recalculer ici effacerait sa
  // réduction. Hors interception, elle se calcule normalement.
  const declaredPower =
    etat.pendingAttack?.attackerPower ?? effectiveAttack(declaredAttacker, etat) + bonusDamageInTideState(declaredAttacker, etat);
  const powerBeforeAttackTriggers = effectiveAttack(declaredAttacker, etat);
  const events: GameEvent[] = [...evenementsDeclaration];
  const base = { turnNumber: etat.turnNumber, timestamp: Date.now() };

  events.push({
    ...base,
    type: "ATTACK",
    playerId: action.playerId,
    attackerInstanceId: action.attackerInstanceId,
    defenderInstanceId: action.defenderInstanceId,
  });

  const markAttacked = (unit: CardInstance): CardInstance =>
    unit.instanceId === action.attackerInstanceId ? { ...unit, hasAttackedThisTurn: true } : unit;

  let nextState: GameState = {
    ...etat,
    players: etat.players.map((p) =>
      p.id === attackerPlayer.id ? { ...p, board: p.board.map(markAttacked) } : p
    ) as [PlayerState, PlayerState],
  };

  // « Lorsqu'il attaque » se résout AVANT les dégâts : un « +1 Puissance
  // jusqu'à la fin du tour » (Sterne des Embruns, Cra-Poiscail Messager)
  // compte dans CE coup, pas seulement au suivant. Les capacités
  // facultatives, elles, passent par la fenêtre de réaction ouverte après
  // l'action (`deriveReactionTriggerEvents`).
  const attackTrigger = processTrigger(
    nextState,
    // `cardId` de l'attaquant : sans lui, les capacités d'observateur
    // filtrées par identité ou par famille ("votre Chevalier attaque",
    // "un Cra-Poiscail attaque") ne peuvent pas reconnaître l'attaquant.
    { trigger: "onAttack", playerId: action.playerId, sourceInstanceId: action.attackerInstanceId, cardId: declaredAttacker.cardId },
    etat.turnNumber
  );
  nextState = attackTrigger.state;
  events.push(...attackTrigger.events);

  // Relu APRÈS les déclencheurs : ses modificateurs ont pu changer. S'il a
  // quitté le plateau entre-temps, l'attaque ne porte plus.
  const attackerUnit = getPlayer(nextState, action.playerId).board.find((u) => u.instanceId === action.attackerInstanceId);
  if (!attackerUnit) return { ok: true, state: nextState, events };
  // La Puissance déclarée (réduction de piège comprise), plus ce que les
  // « Lorsqu'il attaque » viennent de lui ajouter — l'un n'efface pas l'autre.
  const attackerDamage = Math.max(0, declaredPower + effectiveAttack(attackerUnit, nextState) - powerBeforeAttackTriggers);

  if (!action.defenderInstanceId) {
    const opponent = getOpponent(nextState, action.playerId);

    // La réduction de Puissance de l'attaquant passe désormais par une
    // CAPACITÉ (`modifyAttackerPower`, Filet à la Dérive et Le Filet qui
    // Respire), appliquée à la déclaration : elle est déjà dans
    // `attackerDamage`. L'ancien bouclier de données n'avait plus de porteur.
    const attackerCardType = getCardDefinition(attackerUnit.cardId).type;
    const shieldedAttackerDamage = attackerDamage;

    // Faiblesse "Coque légère" (Le Courlis) : +1 dégât sur une attaque
    // directe contre le Navire, propre à la faiblesse du DÉFENSEUR.
    const directWeakness = getShipDefinition(opponent.shipId).directAttackWeakness ?? 0;
    const baseDirectDamage = shieldedAttackerDamage + directWeakness;

    // Bouclier "1ère fois par tour" du DÉFENSEUR réduisant les dégâts directs
    // au Navire (Cage de Flottaison).
    const directShipDamageShield = consumeDirectShipDamageShield(nextState, opponent.id, etat.turnNumber, attackerCardType);
    nextState = directShipDamageShield.state;
    const shieldedDirectDamage = Math.max(0, baseDirectDamage - directShipDamageShield.reduction);

    // Plafond du DÉFENSEUR "pas plus de N dégâts d'une même attaque" tant
    // que la carte est visible (Carcasse Renversée) — le plus bas l'emporte.
    const directDamageCap = getPlayer(nextState, opponent.id).board.reduce<number | undefined>((cap, unit) => {
      const def = getCardDefinition(unit.cardId);
      const value = def.capDirectShipDamageWhileVisible;
      if (value === undefined || !isVisibleDuringTide(def, nextState.environment.tideState)) return cap;
      return cap === undefined ? value : Math.min(cap, value);
    }, undefined);
    let directDamage = directDamageCap === undefined ? shieldedDirectDamage : Math.min(shieldedDirectDamage, directDamageCap);

    // Un piège a intercepté : les dégâts directs sont annulés, et RIEN
    // d'autre. Le coup a bien été porté — l'attaquant a dépensé son
    // attaque, son propre contrecoup s'applique, les pertes de Raison
    // qu'il inflige aussi. Il n'a simplement pas touché la coque.
    // Réduction posée par un piège (Cage de Flottaison, Caisses Arrimées),
    // appliquée APRÈS les boucliers automatiques et le plafond : elle est le
    // dernier rempart, celui que le joueur a choisi de dépenser.
    const reductionPiege = etat.pendingAttack?.damageReduction ?? 0;
    if (reductionPiege > 0) directDamage = Math.max(0, directDamage - reductionPiege);

    const intercepte = etat.pendingAttack?.intercepted === true;
    if (intercepte) directDamage = 0;

    // Contrecoup (Cylindre flottant, visible) : le DÉFENSEUR annule ces
    // dégâts, en renvoie une fraction (arrondie au supérieur) au Navire de
    // l'attaquant, puis la carte se brise et quitte le board.
    const contrecoup =
      directDamage > 0
        ? getPlayer(nextState, opponent.id).board.find((unit) => {
            const def = getCardDefinition(unit.cardId);
            return def.contrecoupOnDirectShipDamageWhileVisible !== undefined && isVisibleDuringTide(def, nextState.environment.tideState);
          })
        : undefined;
    if (contrecoup) {
      const fraction = getCardDefinition(contrecoup.cardId).contrecoupOnDirectShipDamageWhileVisible!.reflectedFraction;
      const reflected = Math.ceil(directDamage * fraction);
      directDamage = 0;
      nextState = {
        ...nextState,
        players: nextState.players.map((p) => {
          if (p.id === attackerPlayer.id) return { ...p, anchor: p.anchor - reflected };
          if (p.id === opponent.id) {
            return {
              ...p,
              board: p.board.filter((u) => u.instanceId !== contrecoup.instanceId),
              // « Après résolution, elle SE BRISE et quitte le board » : ce
              // n'est pas une destruction (Briser ≠ Détruire), donc ni
              // `onDeath` ni les observateurs « Structure détruite ».
              graveyard: [...p.graveyard, { ...contrecoup, damageMarked: 0, modifiers: [], graveyardCause: "expired" as const }],
            };
          }
          return p;
        }) as [PlayerState, PlayerState],
      };
      events.push({ ...base, type: "DAMAGE", targetPlayerId: attackerPlayer.id, amount: reflected, targetAnchorAfter: getPlayer(nextState, attackerPlayer.id).anchor });
      events.push({ ...base, type: "CARD_MOVED", instanceId: contrecoup.instanceId, fromZone: "board", toZone: "graveyard" });

      // Elle quitte le board sans être détruite : `onExpire`, comme une durée
      // qui s'achève (Radeau de Fortune lit le même déclencheur).
      const contrecoupTrigger = processTrigger(
        nextState,
        { trigger: "onExpire", playerId: opponent.id, cardId: contrecoup.cardId, sourceInstanceId: contrecoup.instanceId },
        etat.turnNumber
      );
      nextState = contrecoupTrigger.state;
      events.push(...contrecoupTrigger.events);
    }

    nextState = {
      ...nextState,
      players: nextState.players.map((p) =>
        p.id === opponent.id ? { ...p, anchor: p.anchor - directDamage } : p
      ) as [PlayerState, PlayerState],
    };
    // Le Contrecoup a tout annulé : pas de « coup porté » de 0 dans le
    // journal ni dans l'animation.
    if (!contrecoup && !intercepte) {
      events.push({
        ...base,
        type: "DAMAGE",
        targetPlayerId: opponent.id,
        amount: directDamage,
        targetAnchorAfter: getPlayer(nextState, opponent.id).anchor,
        combat: "strike",
      });
    }

    const reasonLoss = opponentReasonLossOnDirectAttack(attackerUnit, nextState);
    if (reasonLoss > 0) {
      const opponentAfterDamage = getPlayer(nextState, opponent.id);
      events.push({ ...base, type: "REASON_CHANGED", playerId: opponent.id, delta: -reasonLoss });
      nextState = {
        ...nextState,
        players: nextState.players.map((p) =>
          p.id === opponent.id ? { ...p, reason: reasonAfterLoss(opponentAfterDamage, reasonLoss) } : p
        ) as [PlayerState, PlayerState],
      };
    }

    const recoil = selfDamageOnDirectAttack(attackerUnit, nextState);
    if (recoil > 0) {
      nextState = {
        ...nextState,
        players: nextState.players.map((p) =>
          p.id === attackerPlayer.id
            ? {
                ...p,
                board: p.board.map((u) =>
                  // Le contrecoup EST du combat : l'attaquant le prend en
                  // frappant, pas par un effet tiers.
                  u.instanceId === attackerUnit.instanceId
                    ? { ...u, damageMarked: u.damageMarked + recoil, lastDamageCause: "combat" as const }
                    : u
                ),
              }
            : p
        ) as [PlayerState, PlayerState],
      };
      events.push({ ...base, type: "DAMAGE", targetInstanceId: attackerUnit.instanceId, amount: recoil });

      const recoilDamagedTrigger = processTrigger(
        nextState,
        { trigger: "onDamaged", playerId: attackerPlayer.id, sourceInstanceId: attackerUnit.instanceId },
        etat.turnNumber
      );
      nextState = recoilDamagedTrigger.state;
      events.push(...recoilDamagedTrigger.events);
    }
  } else {
    const opponent = getOpponent(nextState, action.playerId);
    const defenderUnit = opponent.board.find((u) => u.instanceId === action.defenderInstanceId);
    // Cible partie pendant les déclencheurs « Lorsqu'il attaque » : pas de coup.
    if (!defenderUnit) return { ok: true, state: nextState, events };
    const defenderType = getCardDefinition(defenderUnit.cardId).type;
    const totalAttackerDamage = attackerDamage + bonusDamageAgainst(attackerUnit, defenderType, nextState);

    // Dégâts au défenseur, réduits par son propre bouclier "1ère fois par
    // tour" (Baleine aux Cicatrices Blanches) et, si c'est une Structure,
    // par la restauration de Résistance de Wood Vy.
    const defenderDamageResult = applyCombatDamageToUnit(nextState, opponent.id, defenderUnit, totalAttackerDamage, etat.turnNumber);
    nextState = defenderDamageResult.state;
    if (defenderDamageResult.amountApplied > 0) {
      events.push({ ...base, type: "DAMAGE", targetInstanceId: defenderUnit.instanceId, amount: defenderDamageResult.amountApplied, combat: "strike" });

      const damagedTrigger = processTrigger(
        nextState,
        { trigger: "onDamaged", playerId: opponent.id, sourceInstanceId: defenderUnit.instanceId },
        etat.turnNumber
      );
      nextState = damagedTrigger.state;
      events.push(...damagedTrigger.events);
    }

    // Riposte : la Puissance effective du défenseur (0 pour un permanent
    // sans Puissance) blesse l'attaquant en retour, symétriquement — soumise
    // au même bouclier "1ère fois par tour" côté attaquant, cette fois.
    const retaliationDamage = effectiveAttack(defenderUnit, nextState);
    if (retaliationDamage > 0) {
      const attackerDamageResult = applyCombatDamageToUnit(nextState, attackerPlayer.id, attackerUnit, retaliationDamage, etat.turnNumber);
      nextState = attackerDamageResult.state;
      if (attackerDamageResult.amountApplied > 0) {
        events.push({ ...base, type: "DAMAGE", targetInstanceId: attackerUnit.instanceId, amount: attackerDamageResult.amountApplied, combat: "retaliation" });

        const attackerDamagedTrigger = processTrigger(
          nextState,
          { trigger: "onDamaged", playerId: attackerPlayer.id, sourceInstanceId: attackerUnit.instanceId },
          etat.turnNumber
        );
        nextState = attackerDamagedTrigger.state;
        events.push(...attackerDamagedTrigger.events);
      }
    }
  }

  const postAttackReasonLoss = controllerReasonLossAfterAttack(attackerUnit, nextState);
  if (postAttackReasonLoss > 0) {
    const attackerControllerAfter = getPlayer(nextState, attackerPlayer.id);
    events.push({ ...base, type: "REASON_CHANGED", playerId: attackerPlayer.id, delta: -postAttackReasonLoss });
    nextState = {
      ...nextState,
      players: nextState.players.map((p) =>
        p.id === attackerPlayer.id ? { ...p, reason: reasonAfterLoss(attackerControllerAfter, postAttackReasonLoss) } : p
      ) as [PlayerState, PlayerState],
    };
  }

  return { ok: true, state: nextState, events };
}
