import { computeEffectiveStats } from "@/game/cards/stats";
import { getCardDefinition } from "@/game/cards/sets/core";
import { hasKeyword, hasResistance, UNIT_CARD_TYPES, type CardDefinition, type CardInstance } from "@/game/cards/types";
import { getShipDefinition } from "@/game/environment/shipData";
import type { TideStateName } from "@/game/environment/types";
import { PHASE_LABELS, phaseRefusal } from "@/game/rules/phaseLabels";
import { isMainPhase, type GamePhase, type GameState, type PlayerId, type PlayerState } from "@/game/state/types";

/**
 * Un mot-clé statique (`CardDefinition.keywords`) OU accordé dynamiquement
 * (`conditionalKeywords`, réévalué à chaque appel — jamais posé/retiré
 * explicitement) est-il actif sur cette carte EN CE MOMENT, pour SON
 * contrôleur (`controller`, pas un joueur quelconque) ?
 */
export function hasEffectiveKeyword(state: GameState, controller: PlayerState, unit: CardInstance, keyword: string): boolean {
  return hasKeywordInContext(unit, keyword, {
    tideState: state.environment.tideState,
    controllerBoard: controller.board,
    controllerReason: controller.reason,
  });
}

/** Ce qu'il faut savoir du plateau pour trancher un mot-clé conditionnel, sans porter tout le `GameState` (l'interface n'en a pas toujours un). */
export interface KeywordContext {
  tideState: TideStateName;
  /** Plateau du contrôleur de l'unité (elle y figure elle-même). */
  controllerBoard: readonly CardInstance[];
  controllerReason: number;
}

/**
 * Même réponse que `hasEffectiveKeyword`, à partir du seul contexte de
 * plateau. C'est CE point d'entrée que doit utiliser l'affichage : tester
 * `hasKeyword` (mot-clé imprimé) laisse invisibles les Garde conditionnels
 * (Chose des Hauts-Fonds), transmis par un Équipement ou temporaires.
 */
export function hasKeywordInContext(unit: CardInstance, keyword: string, context: KeywordContext): boolean {
  const { tideState, controllerBoard, controllerReason } = context;
  const def = getCardDefinition(unit.cardId);
  const matches = (grant: {
    keyword: string;
    controllerReasonAtMost?: number;
    tideStateIn?: string[];
    controllingCardIds?: string[];
  }) => {
    if (grant.keyword !== keyword) return false;
    if (grant.controllerReasonAtMost !== undefined && controllerReason > grant.controllerReasonAtMost) return false;
    if (grant.tideStateIn && !grant.tideStateIn.includes(tideState)) return false;
    // Ex: Chevalier Cra-Poiscail — Garde tant qu'un Destrier est en jeu.
    if (grant.controllingCardIds && !controllerBoard.some((u) => grant.controllingCardIds!.includes(u.cardId))) return false;
    return true;
  };
  if ((def.conditionalKeywordSuppressions ?? []).some(matches)) return false;
  if (hasKeyword(def, keyword)) return true;
  if ((def.conditionalKeywords ?? []).some(matches)) return true;
  // Mot-clé accordé temporairement par un modificateur (ex: "Pied marin jusqu'à la fin du tour").
  if (unit.modifiers.some((m) => m.keywords?.includes(keyword))) return true;
  // Équipement attaché transmettant un mot-clé (ex: Chaîne de Fer Noir → Garde).
  return controllerBoard.some(
    (equip) =>
      equip.attachedToInstanceId === unit.instanceId &&
      (getCardDefinition(equip.cardId).equipGrantsKeywords ?? []).includes(keyword)
  );
}

/** Cette unité attaquante contourne-t-elle Garde EN CE MOMENT (`bypassesGardeTideStateIn`) ? `false` si elle n'existe plus/pas sur le plateau de son contrôleur — et `false` sans attaquant du tout, ce qui est le cas d'un tir de Navire : aucun Navire ne contourne Garde. */
function attackerBypassesGardeNow(state: GameState, attackerOwnerId: PlayerId, attackerInstanceId: string | undefined): boolean {
  const attackerPlayer = state.players.find((p) => p.id === attackerOwnerId);
  const attacker = attackerPlayer?.board.find((u) => u.instanceId === attackerInstanceId);
  if (!attacker) return false;
  const def = getCardDefinition(attacker.cardId);
  return (def.bypassesGardeTideStateIn ?? []).includes(state.environment.tideState);
}

/**
 * Résultat d'une validation : soit "ok", soit un message d'erreur stable
 * (utilisable tel quel côté client pour expliquer pourquoi une action a
 * été refusée). Le serveur ne fait jamais confiance au client : toute
 * action passe par ces vérifications avant d'être appliquée.
 */
/**
 * Mot-clé "Pied marin" : l'unité ignore son mal d'invocation et peut agir
 * le tour où elle arrive. Accordé aujourd'hui par l'invocation
 * (`EffectDefinition.rush`) ; le mot-clé statique est reconnu ici pour les
 * cartes qui le porteront en permanence.
 */
export const KEYWORD_PIED_MARIN = "pied-marin";

export type ValidationResult = { ok: true } | { ok: false; error: string };

export function ok(): ValidationResult {
  return { ok: true };
}

export function fail(error: string): ValidationResult {
  return { ok: false, error };
}

export function assertGameActive(state: GameState): ValidationResult {
  if (state.status !== "active") return fail("La partie est terminée.");
  return ok();
}

export function assertPlayerInGame(state: GameState, playerId: PlayerId): ValidationResult {
  const inGame = state.players.some((p) => p.id === playerId);
  if (!inGame) return fail("Ce joueur ne fait pas partie de cette partie.");
  return ok();
}

export function assertIsActivePlayer(state: GameState, playerId: PlayerId): ValidationResult {
  if (state.activePlayerId !== playerId) return fail("Ce n'est pas le tour de ce joueur.");
  return ok();
}

/**
 * Structure de tour (README "Structure de tour") : Phase principale →
 * Phase de combat → Phase principale 2, chaque passage via `advancePhase`.
 * Attaquer est réservé à la Phase de combat ; jouer une carte, Saborder ou
 * Briser un Objet aux Phases PRINCIPALES — les deux (`assertInMainPhase`).
 */
export function assertInPhase(state: GameState, playerId: PlayerId, phase: GamePhase): ValidationResult {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return fail("Joueur introuvable.");
  if (state.phase !== phase) {
    return fail(`Cette action n'est possible que pendant ${PHASE_LABELS[phase]}.`);
  }
  return ok();
}

/**
 * Variante de `assertInPhase` acceptant une LISTE de phases — pour les
 * capacités qui déclarent elles-mêmes leur fenêtre (`ShipActivatableAbility`)
 * plutôt que de la tenir du moteur.
 */
export function assertInAnyPhase(state: GameState, playerId: PlayerId, phases: readonly GamePhase[]): ValidationResult {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return fail("Joueur introuvable.");
  if (!phases.includes(state.phase)) return fail(phaseRefusal(phases));
  return ok();
}

/** Variante de `assertInPhase` acceptant indifféremment les deux Phases principales. */
export function assertInMainPhase(state: GameState, playerId: PlayerId): ValidationResult {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return fail("Joueur introuvable.");
  if (!isMainPhase(state.phase)) return fail("Cette action n'est possible que pendant une Phase principale.");
  return ok();
}

export function assertCardInHand(state: GameState, playerId: PlayerId, instanceId: string): ValidationResult {
  const player = state.players.find((p) => p.id === playerId);
  const inHand = player?.hand.some((c) => c.instanceId === instanceId);
  if (!inHand) return fail("Cette carte n'est pas dans la main du joueur.");
  return ok();
}

export function assertCardOnOwnBoard(state: GameState, playerId: PlayerId, instanceId: string): ValidationResult {
  const player = state.players.find((p) => p.id === playerId);
  const onBoard = player?.board.some((u) => u.instanceId === instanceId);
  if (!onBoard) return fail("Cette carte n'est pas sur le plateau de ce joueur.");
  return ok();
}

export function assertCanPayCost(
  state: GameState,
  playerId: PlayerId,
  cost: number
): ValidationResult {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return fail("Joueur introuvable.");
  // Aucun plancher de Déraison (design, 2026-09-16) : un coût se paie
  // toujours, quitte à creuser la dette. `cost` reste reçu pour garder la
  // signature stable et le point d'ancrage d'un futur garde-fou.
  void cost;
  return ok();
}

/**
 * « Jouable uniquement si… » (`CardDefinition.playableOnlyIf`) : refuse la
 * POSE quand la condition imprimée n'est pas remplie, avant tout paiement.
 *
 * Une carte sans `playableOnlyIf` passe toujours — comme toutes les autres
 * validations, celle-ci ne s'applique qu'à ce qui la déclare.
 */
export function assertPlayableCondition(
  state: GameState,
  playerId: PlayerId,
  def: CardDefinition
): ValidationResult {
  const gate = def.playableOnlyIf;
  if (!gate) return ok();
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return fail("Joueur introuvable.");

  const ratio = gate.controllerAnchorAtMostRatioOfStart;
  if (ratio !== undefined) {
    const depart = getShipDefinition(player.shipId).startingAnchor;
    if (player.anchor > depart * ratio) {
      return fail("Votre coque est encore trop intacte pour jouer cette carte.");
    }
  }
  return ok();
}

export function assertBoardNotFull(state: GameState, playerId: PlayerId): ValidationResult {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return fail("Joueur introuvable.");
  const ship = getShipDefinition(player.shipId);
  if (player.board.length >= ship.slotCount) {
    return fail("Le plateau de ce joueur est déjà plein (emplacements limités par le Navire).");
  }
  return ok();
}

export function assertIsObjectCard(state: GameState, playerId: PlayerId, instanceId: string): ValidationResult {
  const player = state.players.find((p) => p.id === playerId);
  const unit = player?.board.find((u) => u.instanceId === instanceId);
  if (!unit) return fail("Cette carte n'est pas sur le plateau de ce joueur.");
  if (getCardDefinition(unit.cardId).type !== "objet") return fail("Seul un Objet peut être brisé.");
  return ok();
}

export function assertUnitCanAttack(state: GameState, playerId: PlayerId, instanceId: string): ValidationResult {
  const player = state.players.find((p) => p.id === playerId);
  const unit = player?.board.find((u) => u.instanceId === instanceId);
  if (!unit) return fail("Cette unité n'est pas sur le plateau de ce joueur.");
  if (!(UNIT_CARD_TYPES as readonly string[]).includes(getCardDefinition(unit.cardId).type)) {
    return fail("Seuls les Marins et Créatures peuvent attaquer.");
  }
  // Pied marin : l'unité a le pied assez sûr pour agir dès son arrivée.
  if (unit.summoningSick && !hasEffectiveKeyword(state, player!, unit, KEYWORD_PIED_MARIN)) {
    return fail("Cette unité ne peut pas encore attaquer.");
  }
  if (unit.hasAttackedThisTurn) return fail("Cette unité a déjà attaqué ce tour-ci.");

  if (computeEffectiveStats(unit, state.environment.tideState).inactive) {
    return fail("Cette unité est rendue inactive par la Marée actuelle.");
  }
  return ok();
}

/**
 * Cette unité peut-elle attaquer maintenant (hors phase et fenêtres) ? Même
 * règle que `assertUnitCanAttack` — Pied marin compris : c'est CE point
 * d'entrée que doivent lire l'interface et le bot, jamais un
 * `!summoningSick` recopié.
 */
export function canUnitAttack(state: GameState, playerId: PlayerId, instanceId: string): boolean {
  return assertUnitCanAttack(state, playerId, instanceId).ok;
}

/**
 * Valide la cible de défense. Applique le mot-clé Garde : si l'adversaire
 * contrôle au moins un permanent portant "garde", une attaque visant le
 * Navire (pas de `defenderInstanceId`) doit être redirigée vers un des
 * porteurs de Garde — l'attaque directe est alors refusée, et si une
 * cible est fournie, elle doit elle-même porter Garde.
 *
 * Priorité entre plusieurs porteurs de Garde simultanés : non tranchée
 * par le cadrage ("à préciser") — tout porteur de Garde est accepté ici
 * en attendant une règle de priorité explicite.
 *
 * `attackerInstanceId` sert uniquement à vérifier un contournement de
 * Garde propre à l'ATTAQUANT (`bypassesGardeTideStateIn`, ex: Raie des
 * Fosses pendant Abysses) — jamais utilisé pour autre chose ici.
 */
export function assertValidDefender(
  state: GameState,
  attackerOwnerId: PlayerId,
  attackerInstanceId: string | undefined,
  defenderInstanceId?: string
): ValidationResult {
  const opponent = state.players.find((p) => p.id !== attackerOwnerId);
  if (!opponent) return fail("Adversaire introuvable.");

  const guards = opponent.board.filter((u) => hasEffectiveKeyword(state, opponent, u, "garde"));
  const attackerBypassesGarde = attackerBypassesGardeNow(state, attackerOwnerId, attackerInstanceId);

  if (!defenderInstanceId) {
    if (guards.length > 0 && !attackerBypassesGarde) {
      return fail("Une unité adverse porte Garde : l'attaque doit la cibler en priorité.");
    }
    return ok();
  }

  const target = opponent.board.find((u) => u.instanceId === defenderInstanceId);
  if (!target) return fail("Cible de défense invalide.");

  // Un permanent sans Résistance (un Objet) ne s'attaque pas : il n'a rien
  // à encaisser, et le combat n'aurait aucune issue.
  if (!hasResistance(getCardDefinition(target.cardId))) {
    return fail("Cette carte n'a pas de Résistance : elle ne peut pas être attaquée.");
  }

  if (guards.length > 0 && !hasEffectiveKeyword(state, opponent, target, "garde")) {
    return fail("Une unité adverse porte Garde : l'attaque doit la cibler en priorité.");
  }

  return ok();
}

/** Combine plusieurs validations, retourne la première erreur rencontrée. */
export function combine(...results: ValidationResult[]): ValidationResult {
  for (const result of results) {
    if (!result.ok) return result;
  }
  return ok();
}
