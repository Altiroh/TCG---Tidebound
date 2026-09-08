import type { ShipDefinition } from "@/game/environment/types";

/**
 * Navires principaux — UNIQUEMENT les Navires verrouillés dans le cadrage
 * Notion ("Collection des Navires" + fiches dédiées). Ne pas ajouter de
 * Navire ici tant qu'il n'a pas été verrouillé côté design.
 *
 * NOTE — les capacités activables (`capacityText`) et certains éléments de
 * passif ne sont pas encore exprimables par le moteur : il n'existe pas de
 * système de capacités "une fois par partie" ni de distinction "gain de
 * Raison venant d'une carte" (cadrage section 16, volontairement complexe,
 * pas encore implémenté). Ces textes sont conservés pour l'UI/la fidélité
 * au design ; seuls les effets exprimables avec les champs numériques
 * ci-dessous sont réellement appliqués par le moteur pour l'instant.
 */
export const SHIP_SET: ShipDefinition[] = [
  {
    id: "le-courlis",
    name: "Le Courlis",
    startingAnchor: 17,
    reasonMax: 12,
    slotCount: 4,
    text: "Profil : léger / maniable / contrôle environnemental.",
    passiveText:
      "Tirant léger — la première fois par tour qu'un effet d'Eau ou de Marée devrait vous infliger des " +
      "dégâts d'Ancrage, réduisez-les de 1.",
    capacityText:
      "Virage court — une fois par partie, lorsqu'une nouvelle Eau est révélée, vous pouvez la refuser ; " +
      "une autre Eau valide est immédiatement révélée à la place (non appliqué : capacité activable non modélisée).",
    weaknessText: "Coque légère — les attaques directes contre votre Navire lui infligent +1 dégât.",
    // Le moteur ne calcule les dégâts de Marée/Eaux qu'une seule fois par tour
    // (`resolveTideTurnStep`), donc cette résistance forfaitaire équivaut
    // fidèlement à "la première fois par tour" de Tirant léger.
    resistanceByState: { tempete: 1, abysses: 1 },
    directAttackWeakness: 1,
  },
  {
    id: "lerrant",
    name: "L'Errant",
    startingAnchor: 20,
    reasonMax: 10,
    slotCount: 5,
    text: "Profil standard : polyvalent, équilibré, sans faiblesse critique.",
    passiveText:
      "Cap sûr — la première fois par tour que vous récupérez de la Raison grâce à une carte, récupérez 1 " +
      "Raison supplémentaire (non appliqué : nécessite de distinguer les gains de Raison venant des cartes, " +
      "pas encore modélisé).",
    capacityText:
      "Changer de cap — une fois par partie, après qu'une Marée a été annoncée mais avant l'application de " +
      "ses effets, réduisez sa durée de 1 tour (non appliqué : capacité activable non modélisée).",
    // Aucune faiblesse explicite.
  },
  {
    id: "le-brise-lames",
    name: "Le Brise-Lames",
    startingAnchor: 24,
    reasonMax: 8,
    slotCount: 6,
    text: "Profil : lourd / Structures / endurance.",
    passiveText:
      "Coque renforcée — la première fois à chaque tour que votre Navire devrait subir des dégâts de " +
      "Tempête, réduisez ces dégâts de 2.",
    capacityText:
      "Tenir la ligne — une fois par partie, au début de votre tour, jusqu'à la fin de ce tour, vos " +
      "Structures ne peuvent pas être détruites par des effets environnementaux (non appliqué : capacité " +
      "activable non modélisée).",
    weaknessText: "Équipage à bout — chaque fois que vous entrez dans les Abysses, perdez 1 Raison supplémentaire.",
    resistanceByState: { tempete: 2 },
    reasonWeaknessByState: { abysses: 1 },
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
