import type { ShipDefinition } from "@/game/environment/types";

/**
 * Navires principaux, conformes au cadrage "Navires, Slots et Raison" et
 * "Mécaniques verrouillées" : 4/5/6 Slots comme vraie caractéristique
 * d'équilibrage (4 = léger/compensé, 5 = standard, 6 = lourd/pénalisé).
 *
 * NOTE — certains passifs/faiblesses du cadrage sont des capacités
 * conditionnelles ou activables (ex: "annulez la première modification
 * d'Eaux adverse par tour", "la première Réaction coûte 1 Raison de
 * moins") que le moteur ne sait pas encore résoudre : il n'existe pas
 * encore de système de Réactions/capacités activables (cadrage section
 * 16, volontairement complexe, pas encore implémenté). Ces textes sont
 * conservés pour l'UI/la fidélité au design, mais seuls les effets
 * exprimables avec les champs numériques ci-dessous sont réellement
 * appliqués par le moteur pour l'instant.
 */
export const SHIP_SET: ShipDefinition[] = [
  {
    id: "le-brise-lames",
    name: "Le Brise-Lames",
    startingAnchor: 24,
    reasonMax: 8,
    slotCount: 6,
    passiveText: "Réduisez de 2 les dégâts de Tempête.",
    weaknessText:
      "Les pertes de Raison provoquées par les Abysses sont augmentées de 1. " +
      "Ne peut pas réduire la durée d'une Eau par ses propres effets (non appliqué : pas encore de telles cartes/effets ciblés).",
    resistanceByState: { tempete: 2 },
    reasonWeaknessByState: { abysses: 1 },
  },
  {
    id: "linsondable",
    name: "L'Insondable",
    startingAnchor: 18,
    reasonMax: 10,
    slotCount: 5,
    passiveText: "Réduisez de 3 les pertes d'Ancrage causées par les Abysses.",
    weaknessText: "Lorsque vous subissez des dégâts de Tempête, défaussez une carte.",
    resistanceByState: { abysses: 3 },
    onTideDamageTakenByState: { tempete: { discardCount: 1 } },
  },
  {
    id: "lerrant",
    name: "L'Errant",
    startingAnchor: 20,
    reasonMax: 10,
    slotCount: 5,
    text: "Profil standard : polyvalent, équilibré, sans faiblesse critique.",
    passiveText:
      "La première fois que vous changez volontairement les Eaux pendant votre tour, récupérez 1 Raison " +
      "(non appliqué : nécessite un système de capacités de Navire déclenchées, pas encore implémenté).",
  },
  {
    id: "le-courlis",
    name: "Le Courlis",
    startingAnchor: 18,
    reasonMax: 11,
    slotCount: 4,
    passiveText:
      "Coque vive : une fois par tour, quand la Marée change, réduisez de 1 les dégâts qu'elle inflige " +
      "(approximé ici par une résistance forfaitaire de 1 à la Tempête et aux Abysses).",
    weaknessText: "Ne peut contrôler que 4 permanents (slotCount).",
    resistanceByState: { tempete: 1, abysses: 1 },
  },
  {
    id: "lechappee",
    name: "L'Échappée",
    startingAnchor: 16,
    reasonMax: 12,
    slotCount: 4,
    passiveText:
      "La première Réaction jouée pendant le tour adverse coûte 1 Raison de moins " +
      "(non appliqué : pas encore de système de Réactions). " +
      "Une fois par partie, quittez les Eaux actuelles 1 tour plus tôt (non appliqué : capacité activable non modélisée).",
    weaknessText: "Faible Ancrage.",
  },
];

export const SHIP_DATABASE: ReadonlyMap<string, ShipDefinition> = new Map(
  SHIP_SET.map((ship) => [ship.id, ship])
);

export function getShipDefinition(shipId: string): ShipDefinition {
  const ship = SHIP_DATABASE.get(shipId);
  if (!ship) throw new Error(`Navire inconnu: ${shipId}`);
  return ship;
}
