import type { ShipDefinition } from "@/game/environment/types";

/**
 * Navires principaux — le trio verrouillé dans le cadrage Notion
 * ("Collection des Navires" + fiches dédiées) plus La Religieuse, ajoutée
 * à la demande explicite de l'utilisateur alors que sa fiche Notion
 * ("Gameplay — Raison, Déraison, healing & passifs de Navires") la
 * décrit encore comme une piste non verrouillée : stats et passif sont
 * donc les valeurs "moyennes" proposées par cette note, à ajuster au
 * premier vrai playtest plutôt que gravées dans le marbre.
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
    illustration: "le-courlis.png",
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
    illustration: "errant.png",
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
    illustration: "brise-lames.png",
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
  {
    id: "la-religieuse",
    name: "La Religieuse",
    startingAnchor: 20,
    reasonMax: 10,
    slotCount: 5,
    illustration: "la-religieuse.png",
    text: "Profil : healing / contrôle — survivre devient un moteur de jeu plutôt qu'une simple défense.",
    // Piste Notion "Gameplay — Raison, Déraison, healing & passifs de Navires" (2026-09-12), pas verrouillée :
    // ni les stats ni ce passif ne sont figés tant qu'un playtest n'a pas validé le rythme de la Déraison.
    // Le moteur ne modélise pas encore la Raison négative (Déraison) : ce passif reste donc purement
    // informatif pour l'instant, comme `capacityText` sur les autres Navires.
    passiveText:
      "Pénitence — la première fois par tour que vous devriez subir des dégâts d'Ancrage à cause de votre " +
      "Déraison, réduisez ces dégâts de 1 (non appliqué : la Déraison — Raison négative — n'est pas encore " +
      "modélisée par le moteur, piste de gameplay non verrouillée).",
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
