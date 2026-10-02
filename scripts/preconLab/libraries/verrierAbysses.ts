import { CARD_DATABASE, getCardDefinition } from "@/game/cards/sets/core";
import type { CardDefinition } from "@/game/cards/types";

/**
 * STANDARD VERRIER — DESCENTE AUX ABYSSES (30/09/2026).
 *
 * Constat : les unités qui PROFITENT des Abysses frappent (Albatros, Raie des
 * Fosses, Bat-Marin, Masse-Sombre), mais celles qui PILOTENT la Marée pour y
 * descendre ne frappent pas et coûtent la partie (Sondeur Δ −8, Cartographe
 * Δ −5). La chaîne est coupée entre « descendre » et « frapper ».
 *
 * Variantes du Sondeur des Mauvaises Eaux (propre au deck ; coût et
 * statistiques de base inchangés) :
 *   - A, « le pilote grandit » : chaque activation lui donne +1 Puissance ;
 *   - B, « le pilote arrive au fond » : +1 Puissance en Tempête, +2 en Abysses.
 * Cartes `lab-…` : n'existent que le temps de la mesure. À charger en `--setup`.
 */

const db = CARD_DATABASE as Map<string, CardDefinition>;
const base = (id: string) => getCardDefinition(id);
const enregistrer = (carte: CardDefinition) => db.set(carte.id, carte);

const sondeur = base("sondeur-des-mauvaises-eaux");

enregistrer({
  ...sondeur,
  id: "lab-sondeur-grandit",
  text: "Une fois par tour, vous pouvez perdre 1 Raison : réduisez de 1 tour la durée de la Marée actuelle, et il gagne +1 Puissance.",
  activatableOncePerTurn: {
    ...sondeur.activatableOncePerTurn!,
    effects: [
      ...sondeur.activatableOncePerTurn!.effects,
      { type: "buff", target: { kind: "self" }, attackAmount: { kind: "flat", value: 1 }, healthAmount: { kind: "flat", value: 0 }, permanent: true },
    ],
  },
});

enregistrer({
  ...sondeur,
  id: "lab-sondeur-fond",
  text:
    "Une fois par tour, vous pouvez perdre 1 Raison : réduisez de 1 tour la durée de la Marée actuelle. Pendant Tempête, " +
    "il gagne +1 Puissance. Pendant Abysses, il gagne +2 Puissance.",
  tideAffinity: {
    tempete: { attack: 3, health: 3 },
    abysses: { attack: 4, health: 3 },
  },
});
