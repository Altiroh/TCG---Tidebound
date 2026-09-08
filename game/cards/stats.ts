import { getCardDefinition } from "@/game/cards/sets/core";
import type { CardInstance } from "@/game/cards/types";
import type { TideStateName } from "@/game/environment/types";

export interface EffectiveStats {
  attack: number;
  health: number;
  /** Vrai si la carte est rendue inactive par la Marée courante (ne peut ni attaquer, ni utiliser ses capacités). */
  inactive: boolean;
  /** Vrai si la Marée courante devrait détruire cette carte (à traiter par `processDeaths`). */
  destroyedByTide: boolean;
}

/**
 * Calcule les statistiques effectives d'une unité en combinant :
 * la définition de base, les modificateurs temporaires/permanents
 * (buffs/debuffs), et l'affinité de Marée de la carte pour l'état actuel.
 * Point d'entrée unique pour "combien vaut vraiment cette unité maintenant" —
 * à utiliser partout plutôt que de relire `def.attack`/`def.health` en direct.
 */
export function computeEffectiveStats(unit: CardInstance, tideState: TideStateName): EffectiveStats {
  const def = getCardDefinition(unit.cardId);
  const tideEntry = def.tideAffinity?.[tideState];

  const baseAttack = tideEntry?.attack ?? def.attack ?? 0;
  const baseHealth = tideEntry?.health ?? def.health ?? 0;

  const modifierAttack = unit.modifiers.reduce((sum, m) => sum + m.attack, 0);
  const modifierHealth = unit.modifiers.reduce((sum, m) => sum + m.health, 0);

  return {
    attack: baseAttack + modifierAttack,
    health: baseHealth + modifierHealth,
    inactive: tideEntry?.inactive ?? false,
    destroyedByTide: tideEntry?.destroyed ?? false,
  };
}
