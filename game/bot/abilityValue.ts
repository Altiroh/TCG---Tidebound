import { getCardDefinition } from "@/game/cards/sets/core";
import type { CardDefinition, CardInstance, TriggeredAbility } from "@/game/cards/types";
import type { EffectDefinition } from "@/game/effects/types";
import type { TriggerType } from "@/game/triggers/types";
import type { GameState, PlayerState } from "@/game/state/types";

/**
 * CE QUE RAPPORTENT LES CAPACITÉS D'UN PERMANENT EN JEU.
 *
 * `permanentValue` (`evaluateState.ts`) ne voyait qu'une Puissance et une
 * Résistance. « Au début de votre tour, … », « la première fois à chaque tour
 * qu'une carte rejoint votre Cimetière, 1 dégât au Navire adverse » : rien de
 * tout cela ne comptait. Une Structure de moteur valait sa seule Résistance,
 * et le bot posait à sa place n'importe quelle unité du même coût (relevé du
 * 30/09/2026 : La Marelle posée une fois sur cinq quand elle est en main).
 * Le banc d'essai sous-estimait donc tous les decks dont le moteur est POSÉ
 * — Veillée, Forteresse, Mineurs.
 *
 * L'estimation est lue dans les DONNÉES, sans nommer une seule carte :
 *   - le DÉCLENCHEUR donne une fréquence (chaque tour, parfois, une fois) ;
 *   - les EFFETS donnent ce que rapporte une résolution, selon leur type et
 *     leur cible (au camp adverse ou au sien) ;
 *   - la DURÉE restante (ou un horizon de quelques tours) borne le nombre de
 *     résolutions à venir ;
 *   - le tout est escompté : c'est un revenu FUTUR, incertain, jamais une
 *     valeur acquise.
 *
 * Délibérément grossier et prudent : il suffit que « moteur posé » cesse de
 * valoir zéro. Les capacités ACTIVÉES par le joueur ne sont pas comptées ici —
 * la recherche les voit déjà en les jouant.
 */

/** Tours à venir pris en compte, au plus. */
const HORIZON_TURNS = 3;
/** Escompte d'un revenu futur. */
const FUTURE_DISCOUNT = 0.5;
/** Une capacité soumise à condition ne joue pas toujours. */
const CONDITIONAL_FACTOR = 0.6;

/** Fréquence par tour selon le déclencheur ; `once` : ne jouera qu'une fois (mort, Sabordage…). */
type Cadence = { perTurn: number } | { once: number } | null;

const EVERY_TURN: ReadonlySet<TriggerType> = new Set(["startOfTurn", "endOfTurn"]);
/** Déclencheurs d'OBSERVATEUR : ils guettent ce qui arrive aux autres cartes ou aux joueurs. */
const OBSERVERS: ReadonlySet<TriggerType> = new Set([
  "onCardPlayed",
  "onCardDiscardedFromHand",
  "onCardPutIntoGraveyard",
  "onCardRecoveredFromGraveyard",
  "onObjectBroken",
  "onPowerGained",
  "onReasonGained",
  "onTideStateEntered",
  "onTideStateExited",
  "onTideAnnounced",
]);
/** Fenêtres de défense : elles jouent quand l'adversaire agit. */
const DEFENSIVE_WINDOWS: ReadonlySet<TriggerType> = new Set([
  "onIncomingDirectAttack",
  "onUnitAttackDeclared",
  "onPermanentWouldBeDestroyed",
  "onCombatVsGarde",
]);
/** Déclencheurs qui ne portent que sur la carte elle-même, et qui ne joueront qu'une fois. */
const SELF_ONCE: ReadonlySet<TriggerType> = new Set(["onSaborde", "onExpire", "onReturnedToHand", "onDiscarded"]);

/**
 * La carte se blesse-t-elle elle-même à chaque tour (Équipage de Verre :
 * « au début de votre Main Phase, il subit 1 dégât ») ? Alors ses capacités
 * « quand elle subit / survit à des dégâts » jouent à chaque tour, pas « de
 * temps en temps » : la blessure est précisément là pour les déclencher.
 */
function hurtsItselfEveryTurn(def: CardDefinition): boolean {
  return (def.abilities ?? []).some(
    (ability) =>
      EVERY_TURN.has(ability.trigger) &&
      (ability.effects ?? []).some((effect) => effect.type === "damage" && (effect.target as { kind?: string } | undefined)?.kind === "self")
  );
}

function cadenceOf(ability: TriggeredAbility, selfHurting: boolean): Cadence {
  const trigger = ability.trigger;
  const observes = Boolean(ability.triggeredBy);
  let cadence: Cadence;
  if (EVERY_TURN.has(trigger)) cadence = { perTurn: 1 };
  else if (OBSERVERS.has(trigger)) cadence = { perTurn: 0.5 };
  else if (DEFENSIVE_WINDOWS.has(trigger)) cadence = { perTurn: 0.3 };
  // Une arrivée, une mort, une attaque, des dégâts : si la capacité guette
  // les AUTRES cartes (`triggeredBy`), c'est un revenu ; sur soi, l'arrivée
  // est déjà passée et le reste n'arrivera qu'une fois.
  else if (trigger === "onEnterPlay" || trigger === "onPlay") cadence = observes ? { perTurn: 0.5 } : null;
  else if (trigger === "onDeath") cadence = observes ? { perTurn: 0.5 } : { once: 1 };
  else if ((trigger === "onDamaged" || trigger === "onSurvivedDamage") && selfHurting && !observes) cadence = { perTurn: 1 };
  else if (trigger === "onAttack" || trigger === "onDamaged" || trigger === "onSurvivedDamage") cadence = { perTurn: 0.5 };
  else if (SELF_ONCE.has(trigger)) cadence = { once: 1 };
  else cadence = { perTurn: 0.3 };

  if (!cadence) return null;
  if (ability.onceEver) return { once: "once" in cadence ? cadence.once : 1 };
  if ("perTurn" in cadence && ability.oncePerTurnKey) return { perTurn: Math.min(1, cadence.perTurn) };
  return cadence;
}

function amountOf(effect: EffectDefinition): number {
  const amount = effect.amount;
  if (!amount) return 1;
  if (amount.kind === "flat") return amount.value;
  // Montants calculés à la résolution : une estimation raisonnable.
  return 1.5;
}

/**
 * Sens d'une cible : +1 si l'effet porte sur le camp ADVERSE, −1 sur le sien,
 * 0 si c'est au joueur de choisir (il choisira le bon côté).
 */
function sideOf(effect: EffectDefinition): 1 | -1 | 0 {
  const target = effect.target as { kind?: string; among?: { opponentOnly?: boolean; sameController?: boolean } } | undefined;
  switch (target?.kind) {
    case "opponentPlayer":
    case "allEnemyUnits":
    case "randomEnemyUnit":
    case "pendingAttacker":
      return 1;
    case "controllerPlayer":
    case "allAllyUnits":
    case "randomAllyUnit":
    case "allyUnitsWithCardIds":
    case "self":
    case "equippedUnit":
      return -1;
    case "chosenUnit":
      if (target.among?.opponentOnly) return 1;
      if (target.among?.sameController) return -1;
      return 0;
    default:
      return 0;
  }
}

/** Effets qui FONT DU MAL à leur cible ; les autres lui font du bien. */
const HARMFUL = new Set(["damage", "destroy", "debuff", "reasonLoss", "discard", "durationLoss", "saborde"]);

/** Valeur d'une résolution de l'effet, pour une cible « du bon côté ». */
function magnitude(effect: EffectDefinition, targetIsOpponentShip: boolean): number {
  const amount = amountOf(effect);
  switch (effect.type) {
    case "damage":
      // Un point au Navire adverse vaut un point d'Ancrage ; à une unité, un point de Résistance.
      return amount * (targetIsOpponentShip ? 3 : 1.2);
    case "heal":
      return amount * 1;
    case "draw":
      return amount * 0.9;
    case "reasonGain":
    case "reasonLoss":
      return amount * 0.5;
    case "buff":
    case "debuff": {
      const flat = (value: unknown) => {
        const a = value as { kind?: string; value?: number } | undefined;
        return a?.kind === "flat" ? Math.abs(a.value ?? 0) : a ? 1 : 0;
      };
      const e = effect as EffectDefinition & { attackAmount?: unknown; healthAmount?: unknown; permanent?: boolean };
      const size = flat(e.attackAmount) * 1.5 + flat(e.healthAmount) * 1.2;
      // Un gain permanent vaut pleinement ; un gain « jusqu'à la fin du tour », à moitié.
      return (size || amount * 0.8) * (e.permanent ? 1 : 0.5);
    }
    case "summon":
      return 3;
    case "destroy":
      return 4;
    case "moveGraveyardCardToHand":
      return 0.9;
    case "mill":
      return amount * 0.2;
    default:
      return 0.5;
  }
}

/** Ce que rapporte une résolution de la liste d'effets, pour le contrôleur. */
function payoffOf(effects: readonly EffectDefinition[]): number {
  let total = 0;
  for (const effect of effects) {
    const side = sideOf(effect);
    const harmful = HARMFUL.has(effect.type);
    const size = magnitude(effect, (effect.target as { kind?: string } | undefined)?.kind === "opponentPlayer");
    // Un effet néfaste rapporte sur l'adversaire et coûte sur soi ; un effet
    // bénéfique, l'inverse. Au choix du joueur : il prendra le bon côté.
    const sign = side === 0 ? 1 : harmful ? side : -side;
    total += sign * size;
  }
  return total;
}

interface AbilityIncome {
  /** Revenu par tour, déjà pondéré par la fréquence. */
  perTurn: number;
  /** Revenu des capacités qui ne joueront qu'une fois. */
  once: number;
  /** Nombre de résolutions par tour qui envoient des cartes de SA pioche au Cimetière. */
  selfMillPerTurn: number;
  /** Ce que rapporte une résolution de ses capacités qui guettent une arrivée au Cimetière hors mort. */
  graveyardWatch: number;
}

const NO_INCOME: AbilityIncome = { perTurn: 0, once: 0, selfMillPerTurn: 0, graveyardWatch: 0 };
const incomeCache = new Map<string, AbilityIncome>();

function incomeOf(def: CardDefinition): AbilityIncome {
  const cached = incomeCache.get(def.id);
  if (cached) return cached;

  let perTurn = 0;
  let once = 0;
  let selfMillPerTurn = 0;
  let graveyardWatch = 0;
  const selfHurting = hurtsItselfEveryTurn(def);
  for (const ability of def.abilities ?? []) {
    const cadence = cadenceOf(ability, selfHurting);
    if (!cadence) continue;
    let payoff = payoffOf(ability.effects ?? []);
    if (ability.condition) payoff *= CONDITIONAL_FACTOR;
    // Une capacité payante coûte ce qu'on paie à chaque fois.
    payoff -= (ability.cost?.reason ?? 0) * 0.5 + (ability.cost?.anchor ?? 0) * 3;
    // Facultative : le joueur ne l'active que si elle rapporte.
    if (ability.mode === "optional") payoff = Math.max(0, payoff);
    if ("perTurn" in cadence) perTurn += payoff * cadence.perTurn;
    else once += payoff * cadence.once;

    if ("perTurn" in cadence && (ability.effects ?? []).some((e) => e.type === "mill" && sideOf(e) === -1)) {
      selfMillPerTurn += cadence.perTurn;
    }
    if (ability.trigger === "onCardPutIntoGraveyard") graveyardWatch += payoff;
  }

  const income =
    perTurn === 0 && once === 0 && selfMillPerTurn === 0 && graveyardWatch === 0 ? NO_INCOME : { perTurn, once, selfMillPerTurn, graveyardWatch };
  incomeCache.set(def.id, income);
  return income;
}

/**
 * Valeur à venir des capacités déclenchées de ce permanent. Nulle pour une
 * carte sans capacité déclenchée ; négative si ses capacités lui coûtent
 * (une Anomalie qui blesse son propre camp, par exemple).
 */
export function abilityValue(_state: GameState, unit: CardInstance, controller: PlayerState): number {
  let def: CardDefinition;
  try {
    def = getCardDefinition(unit.cardId);
  } catch {
    return 0;
  }
  const income = incomeOf(def);
  if (income === NO_INCOME) return 0;

  const remaining = unit.turnsRemaining ?? def.durationTurns ?? HORIZON_TURNS;
  const turns = Math.max(0, Math.min(HORIZON_TURNS, remaining));
  return (income.perTurn * turns + income.once + feedingValue(unit, income, controller) * turns) * FUTURE_DISCOUNT;
}

/**
 * UN CARBURANT VAUT CE QU'IL FAIT TOURNER.
 *
 * Meuler sa propre pioche ne rapporte rien en soi — mais, avec La Marelle en
 * jeu, chaque meulage est 1 dégât au Navire adverse. Une carte qui remplit
 * son Cimetière à chaque tour vaut donc, en plus, ce que rapportent les
 * cartes du même camp qui guettent cette arrivée (`onCardPutIntoGraveyard`).
 * Chacune ne compte qu'une fois par tour : elles sont presque toutes
 * limitées à « la première fois à chaque tour ».
 */
function feedingValue(unit: CardInstance, income: AbilityIncome, controller: PlayerState | undefined): number {
  if (income.selfMillPerTurn === 0 || !controller?.board) return 0;
  let watchers = 0;
  for (const other of controller.board) {
    if (other.instanceId === unit.instanceId) continue;
    let otherDef: CardDefinition;
    try {
      otherDef = getCardDefinition(other.cardId);
    } catch {
      continue;
    }
    watchers += Math.max(0, incomeOf(otherDef).graveyardWatch);
  }
  return watchers * Math.min(1, income.selfMillPerTurn);
}
