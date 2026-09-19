import { hasAnyValidEquipTarget, type CardDefinition, type CardInstance } from "@/game";

/**
 * Une carte jouée demande-t-elle une DÉSIGNATION de cible ? Cas général :
 * présence d'un `onPlayEffect` en `chosenUnit`.
 *
 * Cas des Équipements (`attachEquipment`) : sans permanent équipable sur le
 * plateau, la réponse est non — non parce que la carte se poserait sans
 * lien, mais parce qu'elle ne se pose PAS du tout (« Équipez une unité Un
 * Dead » est un ordre, cf. `game/actions/playCard.ts`). Rien à désigner :
 * le geste part au moteur, qui le refuse en le disant. Ouvrir une fenêtre
 * de ciblage vide laisserait le joueur devant un écran sans issue.
 */
export function needsPlayTarget(def: CardDefinition, board: CardInstance[]): boolean {
  const effects = def.onPlayEffects ?? [];
  if (!effects.some((e) => e.target.kind === "chosenUnit")) return false;
  const attachEffect = effects.some((e) => e.type === "attachEquipment");
  if (attachEffect) return hasAnyValidEquipTarget(def, board);
  return true;
}
