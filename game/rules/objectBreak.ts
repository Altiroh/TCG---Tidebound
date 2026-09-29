import type { CardDefinition, TriggeredAbility } from "@/game/cards/types";

/**
 * Coût IMPRIMÉ du Bris depuis la main (Notion "Catalogue de cartes", règle
 * prototype "Briser un Objet depuis la main") : moitié du coût imprimé,
 * arrondie au supérieur, minimum 1 Raison. Une réduction temporaire de coût
 * ne le réduit pas ; le bouclier de perte de Raison s'applique au paiement,
 * comme pour tout coût.
 *
 * Ici plutôt que dans `breakObject.ts` : la fenêtre de réaction
 * (`triggerBus.ts`) en a besoin pour proposer un Objet réactif depuis la
 * main, et `breakObject.ts` importe déjà le bus.
 */
export function handBreakCost(def: Pick<CardDefinition, "cost">): number {
  return Math.max(1, Math.ceil(def.cost / 2));
}

/**
 * Capacité de BRIS EN RÉACTION d'un Objet : « Lorsque …, vous pouvez
 * Briser cet Objet : … ». Facultative, et l'Objet part en la payant (un
 * effet `saborde` sur lui-même, dernier de la liste).
 *
 * Règle du 29/09/2026 : une telle capacité se propose AUSSI depuis la main,
 * au coût d'un Bris depuis la main (`handBreakCost`) et sans prendre de
 * Slot — exactement comme un Objet ordinaire se Brise depuis la main.
 * Poser l'Objet d'abord reste possible ; ce n'est plus obligatoire.
 */
export function isBreakReaction(def: Pick<CardDefinition, "type">, ability: TriggeredAbility): boolean {
  return (
    def.type === "objet" &&
    ability.mode === "optional" &&
    ability.effects.some((effect) => effect.type === "saborde" && effect.target.kind === "self")
  );
}
