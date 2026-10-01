import { CARD_DATABASE, getCardDefinition } from "@/game/cards/sets/core";
import type { CardDefinition, TriggeredAbility } from "@/game/cards/types";

/**
 * STANDARD VERRIER — CAVALERIE (01/10/2026).
 *
 * Constat : des corps lourds dont aucun ne grandit ; les effets ne valent
 * que pour une attaque ou restent statiques. Le pire, Destrier du Ressac
 * (Δ −16), n'est bon que seul — à contre-courant d'un deck de bêtes.
 *
 * Boucle visée, « l'élan » : charger → prendre de l'élan → frapper plus fort.
 * Variantes cumulatives (coûts et statistiques de base inchangés) :
 *   - Destrier du Ressac : +1 Puissance conservée chaque fois qu'il attaque
 *     (au lieu de « tant qu'il est votre seule unité ») ;
 *   - Mufle au Fanion : grandit quand il survit à des dégâts ;
 *   - Monture de Brèche : prend aussi de l'élan.
 * Cartes `lab-…` : n'existent que le temps de la mesure. À charger en `--setup`.
 */

const db = CARD_DATABASE as Map<string, CardDefinition>;
const base = (id: string) => getCardDefinition(id);
const enregistrer = (carte: CardDefinition) => db.set(carte.id, carte);

const plusUn = [{ type: "buff" as const, target: { kind: "self" as const }, attackAmount: { kind: "flat" as const, value: 1 }, healthAmount: { kind: "flat" as const, value: 0 }, permanent: true }];
const elan = (key: string): TriggeredAbility => ({ trigger: "onAttack", oncePerTurnKey: key, description: "Il charge : +1 Puissance, conservée.", effects: plusUn });
const tientBon = (key: string): TriggeredAbility => ({ trigger: "onSurvivedDamage", oncePerTurnKey: key, description: "Il tient bon : +1 Puissance, conservée.", effects: plusUn });

enregistrer({
  ...base("destrier-du-ressac"),
  id: "lab-destrier-verrier",
  text: "Chaque fois qu'il attaque, il gagne +1 Puissance.",
  selfBuffWhileOnlyUnit: undefined,
  abilities: [elan("destrierElan")],
});

enregistrer({
  ...base("mufle-au-fanion"),
  id: "lab-mufle-verrier",
  text: "Tant qu'il est blessé, il a Garde. La première fois à chaque tour qu'il survit à des dégâts, il gagne +1 Puissance.",
  abilities: [tientBon("mufleTientBon")],
});

enregistrer({
  ...base("monture-de-breche"),
  id: "lab-monture-verrier",
  text: "Lorsqu'elle attaque une unité ayant Garde, elle gagne +1 Puissance pour cette attaque. Chaque fois qu'elle attaque, elle gagne +1 Puissance.",
  abilities: [elan("montureElan")],
});
