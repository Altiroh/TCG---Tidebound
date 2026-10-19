import type { CardDefinition } from "@/game/cards/types";
import type { EffectDefinition } from "@/game/effects/types";

/**
 * « Chaîne — <effet> », sans situation dans le texte : un Objet Chaîne
 * INSTANTANÉ (`CardDefinition.chaineLibre`). Il se joue en Phase principale
 * (ses `onBreakEffects`), ou en réaction depuis la main quand une unité
 * attaque — adverse ou l'une des vôtres — ou quand l'adversaire joue un
 * Objet. Mêmes effets dans toutes les voies.
 */
export function chaineLibre(
  description: string,
  effects: EffectDefinition[]
): Pick<CardDefinition, "chaine" | "chaineLibre" | "onBreakEffects" | "abilities"> {
  return {
    chaine: true,
    chaineLibre: true,
    onBreakEffects: effects,
    abilities: [
      { trigger: "onUnitAttackDeclared", mode: "optional", description, effects },
      // Pendant VOTRE attaque aussi : un instantané n'attend pas le tour adverse.
      { trigger: "onOwnAttackDeclared", mode: "optional", description, effects },
      { trigger: "onObjectPlayed", triggeredBy: { opponentOnly: true }, mode: "optional", description, effects },
    ],
  };
}
