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
 * NOTE — deux fréquences de capacité, une seule câblée. `activatableAbility`
 * (Le Goliath, Canon de proue) est réellement appliquée par le moteur :
 * coût, limite par tour, fenêtre de phase, ciblage explicite. Les quatre
 * autres Navires portent des capacités "une fois par PARTIE" (Virage court,
 * Changer de cap, Tenir la ligne), fréquence encore non modélisée : elles
 * restent en `capacityText`, informatif seulement. Même chose pour certains
 * passifs qui demanderaient de distinguer "gain de Raison venant d'une
 * carte" (cadrage section 16, volontairement complexe, pas encore
 * implémenté) ; seuls les effets exprimables avec les champs numériques
 * ci-dessous sont réellement appliqués.
 */
export const SHIP_SET: ShipDefinition[] = [
  {
    id: "le-courlis",
    name: "Le Courlis",
    startingAnchor: 17,
    reasonMax: 12,
    slotCount: 4,
    illustration: "le-courlis.webp",
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
    illustration: "errant.webp",
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
    illustration: "brise-lames.webp",
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
    illustration: "la-religieuse.webp",
    text: "Profil : healing / contrôle — survivre devient un moteur de jeu plutôt qu'une simple défense.",
    // Piste Notion "Gameplay — Raison, Déraison, healing & passifs de Navires" (2026-09-12), pas verrouillée :
    // ni les stats ni ce passif ne sont figés tant qu'un playtest n'a pas validé le rythme de la Déraison.
    // Pénitence retenue plutôt qu'Absolution (l'autre piste de passif de la note).
    passiveText:
      "Pénitence — la première fois par tour que vous devriez subir des dégâts d'Ancrage à cause de votre " +
      "Déraison, réduisez ces dégâts de 1.",
    deraisonDamageReduction: 1,
  },
  {
    // Cinquième Navire du roster de prototype (Notion "Collection des
    // Navires" + fiche "💥 Le Goliath", 2026-09-18). Ni passif ni faiblesse
    // au prototype : toute son identité tient dans son Canon.
    id: "le-goliath",
    name: "Le Goliath",
    startingAnchor: 20,
    reasonMax: 10,
    slotCount: 5,
    // Illustration non encore produite — l'arche reste vide, comme prévu.
    text: "Profil : moyen / artillerie / pression de board.",
    // Premier Navire dont la capacité est réellement CÂBLÉE (les quatre
    // autres sont "une fois par partie", fréquence encore non modélisée).
    // Geste en deux temps décidé le 18/09/2026 : la Raison se paie pour
    // DÉCOUVRIR le canon, pas pour tirer — un canon armé et non tiré a
    // coûté sa Raison pour rien.
    activatableAbility: {
      name: "Canon de proue",
      text:
        "Une fois par tour, pendant une Phase principale, dépensez 2 Raison pour armer le Canon de proue. " +
        "Pendant votre Phase de combat, vous pouvez alors tirer : infligez 2 dégâts à un permanent adverse " +
        "ou au Navire adverse, selon les mêmes règles de ciblage qu'une attaque. Le tir ne provoque aucune " +
        "riposte et referme le canon ; il ne consomme l'attaque d'aucune unité.",
      cost: { reason: 2 },
      activationPhases: ["mainPhase", "mainPhase2"],
      armedShot: {
        phases: ["combatPhase"],
        targeting: "attackRules",
        // Valeur de prototype (fiche Notion : « 2 dégâts ; à confirmer par playtest »).
        effects: [{ type: "damage", target: { kind: "shotTarget" }, amount: { kind: "flat", value: 2 } }],
      },
    },
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
