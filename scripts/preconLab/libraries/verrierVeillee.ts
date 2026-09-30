import { CARD_DATABASE, getCardDefinition } from "@/game/cards/sets/core";
import type { CardDefinition, TriggeredAbility } from "@/game/cards/types";

/**
 * STANDARD VERRIER — LA VEILLÉE (30/09/2026).
 *
 * Constat : ses unités-moteur font bien les dégâts (67 %), mais leurs gains
 * s'évaporent en fin de tour — Cache-Cache et Papa est en mer prennent +1
 * Puissance « jusqu'à la fin du tour » — et la Veillée perd la course contre
 * les decks rapides (10 à 17 %). Le gage de Verre : le déclencheur paie en
 * stats CONSERVÉES sur l'unité qui frappe.
 *
 * Variantes cumulatives (coûts et statistiques de base inchangés) :
 *   - Cache-Cache : son +1 Puissance devient permanent ;
 *   - Papa est en mer : idem ;
 *   - Encore cinq minutes : elle grandit aussi quand elle survit à des dégâts.
 * Cartes `lab-…` : n'existent que le temps de la mesure. À charger en `--setup`.
 */

const db = CARD_DATABASE as Map<string, CardDefinition>;
const base = (id: string) => getCardDefinition(id);
const enregistrer = (carte: CardDefinition) => db.set(carte.id, carte);

/** Même carte, mais ses gains de Puissance « jusqu'à la fin du tour » sont conservés. */
function conserve(id: string, labId: string, text: string): CardDefinition {
  const carte = base(id);
  return {
    ...carte,
    id: labId,
    text,
    abilities: (carte.abilities ?? []).map((ability) => ({
      ...ability,
      effects: ability.effects.map((effect) =>
        effect.type === "buff" ? { ...effect, duration: undefined, permanent: true, healthAmount: effect.healthAmount ?? { kind: "flat", value: 0 } } : effect
      ),
    })),
  };
}

enregistrer(
  conserve(
    "cache-cache",
    "lab-cache-cache-verrier",
    "La première fois pendant votre tour qu'une de vos cartes rejoint le Cimetière depuis votre main ou votre pioche, elle gagne +1 Puissance."
  )
);
enregistrer(
  conserve(
    "papa-est-en-mer",
    "lab-papa-verrier",
    "Quand une autre de vos unités Un Dead est détruite, il gagne +1 Puissance. Une fois par tour."
  )
);

const cinqMinutes = base("encore-cinq-minutes");
const grandit: TriggeredAbility = {
  trigger: "onSurvivedDamage",
  oncePerTurnKey: "cinqMinutesTientBon",
  description: "Elle tient bon : +1 Puissance, conservée.",
  effects: [{ type: "buff", target: { kind: "self" }, attackAmount: { kind: "flat", value: 1 }, healthAmount: { kind: "flat", value: 0 }, permanent: true }],
};
enregistrer({
  ...cinqMinutes,
  id: "lab-cinq-minutes-verrier",
  text:
    "La première fois à chaque tour qu'elle devrait être détruite au combat, elle reste à 1 Résistance. La première " +
    "fois à chaque tour qu'elle survit à des dégâts, elle gagne +1 Puissance.",
  abilities: [...(cinqMinutes.abilities ?? []), grandit],
});
