import { getCardDefinition, type EffectDefinition } from "@/game";

/**
 * SENS d'un ciblage, pour sa couleur (décision du 05/10/2026) : ROUGE pour
 * ce qui nuit à la cible (dégâts, destruction, malus…) — le même rouge que
 * l'attaque —, BLEU pour ce qui l'aide (soin, bonus, protection, Équipement).
 */
export type TargetPolarity = "hostile" | "friendly";

/** Types d'effets qui nuisent à l'unité visée. */
const HOSTILE_TYPES = new Set<string>(["damage", "destroy", "saborde", "debuff", "durationLoss", "transform"]);

function amountIsNegative(amount: EffectDefinition["attackAmount"]): boolean {
  return amount?.kind === "flat" && amount.value < 0;
}

function isHostile(effect: EffectDefinition): boolean {
  if (HOSTILE_TYPES.has(effect.type)) return true;
  if (effect.type === "buff") return amountIsNegative(effect.attackAmount) || amountIsNegative(effect.healthAmount);
  // Renvoyer en main : un repli pour une unité à soi (le filtre de choix
  // reste sur son propre plateau par défaut, `sameController ?? true`), une
  // expulsion sinon.
  if (effect.type === "moveZone") {
    if (effect.target.kind !== "chosenUnit") return true;
    const among = effect.target.among;
    return Boolean(among?.opponentOnly) || among?.sameController === false;
  }
  return false;
}

/**
 * Sens des effets qui portent sur l'unité DÉSIGNÉE (`chosenUnit`) ; à
 * défaut de cible désignée, de l'ensemble des effets. Un seul effet
 * nuisible suffit à rendre le ciblage hostile : mieux vaut un rouge de
 * trop qu'un bleu trompeur.
 */
export function effectsPolarity(effects: readonly EffectDefinition[]): TargetPolarity {
  const chosen = effects.filter((effect) => effect.target.kind === "chosenUnit");
  return (chosen.length > 0 ? chosen : effects).some(isHostile) ? "hostile" : "friendly";
}

/**
 * Sens du ciblage lancé par une carte : sa pose (`playCard`), son bris
 * (`break`), sa capacité activable (`ability`) ou une capacité déclenchée
 * (`reaction`, avec son indice).
 */
export function sourcePolarity(cardId: string, kind: "playCard" | "break" | "ability" | "reaction", abilityIndex = 0): TargetPolarity {
  const def = getCardDefinition(cardId);
  const effects =
    kind === "playCard"
      ? def.onPlayEffects
      : kind === "break"
        ? def.onBreakEffects
        : kind === "ability"
          ? def.activatableOncePerTurn?.effects
          : def.abilities?.[abilityIndex]?.effects;
  return effectsPolarity(effects ?? []);
}
