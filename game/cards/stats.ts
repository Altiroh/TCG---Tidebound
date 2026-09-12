import { getCardDefinition } from "@/game/cards/sets/core";
import { isVisibleDuringTide, type CardInstance } from "@/game/cards/types";
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
 * Contexte de plateau nécessaire pour calculer les auras/stats dynamiques
 * (Bernard-l'Ermite d'Acier, Matelot Insomniaque, Capitaine Sans Sommeil,
 * Lampe de Pont Rouge, Masque de Plongée Fissuré) : uniquement le plateau et
 * la Raison du CONTRÔLEUR de l'unité évaluée — ces mécanismes ne portent
 * jamais sur le plateau adverse. Optionnel : un appelant qui ne le fournit
 * pas obtient les stats "de base" (modificateurs + Marée), sans les auras —
 * utile pour les affichages qui n'ont pas facilement accès au plateau complet.
 */
export interface AuraContext {
  /** Plateau complet du contrôleur de l'unité évaluée (elle y figure elle-même). */
  controllerBoard: readonly CardInstance[];
  /** Raison actuelle du contrôleur. */
  controllerReason: number;
}

/**
 * Calcule les statistiques effectives d'une unité en combinant :
 * la définition de base, les modificateurs temporaires/permanents
 * (buffs/debuffs), l'affinité de Marée de la carte pour l'état actuel, et —
 * si `aura` est fourni — les auras/stats dynamiques qui dépendent du reste
 * du plateau de son contrôleur ou de sa Raison. Point d'entrée unique pour
 * "combien vaut vraiment cette unité maintenant" — à utiliser partout plutôt
 * que de relire `def.attack`/`def.health` en direct.
 */
export function computeEffectiveStats(unit: CardInstance, tideState: TideStateName, aura?: AuraContext): EffectiveStats {
  const def = getCardDefinition(unit.cardId);
  const tideEntry = def.tideAffinity?.[tideState];

  const baseAttack = tideEntry?.attack ?? def.attack ?? 0;
  const baseHealth = tideEntry?.health ?? def.health ?? 0;

  const modifierAttack = unit.modifiers.reduce((sum, m) => sum + m.attack, 0);
  const modifierHealth = unit.modifiers.reduce((sum, m) => sum + m.health, 0);

  let auraAttack = 0;
  let auraHealth = 0;

  if (aura) {
    const { controllerBoard, controllerReason } = aura;

    // Bernard-l'Ermite d'Acier : bonus sur soi tant qu'une Structure VISIBLE est contrôlée.
    const visibleStructureBuff = def.selfBuffWhileControllingVisibleStructure;
    if (visibleStructureBuff) {
      const hasVisibleStructure = controllerBoard.some((other) => {
        const otherDef = getCardDefinition(other.cardId);
        return otherDef.type === "structure" && isVisibleDuringTide(otherDef, tideState);
      });
      if (hasVisibleStructure) {
        auraAttack += visibleStructureBuff.attackAmount ?? 0;
        auraHealth += visibleStructureBuff.healthAmount ?? 0;
      }
    }

    // Matelot Insomniaque : bonus sur soi tant que la Raison du contrôleur est sous le seuil.
    const reasonSelfBuff = def.selfBuffWhileControllerReasonAtMost;
    if (reasonSelfBuff && controllerReason <= reasonSelfBuff.reasonAtMost) {
      auraAttack += reasonSelfBuff.attackAmount ?? 0;
      auraHealth += reasonSelfBuff.healthAmount ?? 0;
    }

    // Capitaine Sans Sommeil : aura reçue d'UNE AUTRE unité du même contrôleur.
    for (const source of controllerBoard) {
      if (source.instanceId === unit.instanceId) continue;
      const auraSpec = getCardDefinition(source.cardId).auraBuffOtherUnitsWhileControllerReasonAtMost;
      if (!auraSpec || auraSpec.targetType !== def.type) continue;
      if (controllerReason > auraSpec.reasonAtMost) continue;
      auraAttack += auraSpec.attackAmount ?? 0;
      auraHealth += auraSpec.healthAmount ?? 0;
    }

    // Lampe de Pont Rouge / Masque de Plongée Fissuré : bonus d'Équipement conditionnel à la Marée.
    for (const equip of controllerBoard) {
      if (equip.attachedToInstanceId !== unit.instanceId) continue;
      const buff = getCardDefinition(equip.cardId).equipGrantsBuffWhileTideStateIn;
      if (!buff || !buff.tideStateIn.includes(tideState)) continue;
      auraAttack += buff.attackAmount ?? 0;
      auraHealth += buff.healthAmount ?? 0;
    }
  }

  return {
    attack: baseAttack + modifierAttack + auraAttack,
    health: baseHealth + modifierHealth + auraHealth,
    inactive: tideEntry?.inactive ?? false,
    destroyedByTide: tideEntry?.destroyed ?? false,
  };
}

/**
 * Isole la contribution des modificateurs (buffs/debuffs) sur la
 * Puissance/Résistance affichée, séparément de l'affinité de Marée —
 * pour la lisibilité visuelle demandée par Notion "Moteur de partie"
 * (valeur au-dessus de la base imprimée en vert, en-dessous en rouge).
 * `0` = valeur de base (imprimée, éventuellement ajustée par la Marée),
 * inchangée par un buff/debuff actif.
 */
export function computeStatModifierDelta(unit: CardInstance): { attack: number; health: number } {
  return {
    attack: unit.modifiers.reduce((sum, m) => sum + m.attack, 0),
    health: unit.modifiers.reduce((sum, m) => sum + m.health, 0),
  };
}
