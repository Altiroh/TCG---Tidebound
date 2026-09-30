import { CARD_DATABASE, getCardDefinition } from "@/game/cards/sets/core";
import type { CardDefinition } from "@/game/cards/types";

/**
 * STANDARD VERRIER — MINEURS DE FOND (30/09/2026).
 *
 * Constat : les dégâts viennent de la Baleine et de la Chose des Hauts-Fonds
 * (Δ +28), pas des pièges (Dernière Barricade −18, Caisses Arrimées −14,
 * Pont Miné −13). Les deux petites unités du moteur font moins d'un dégât
 * par partie.
 *
 * Boucle visée, « les pièges qui tirent » : un piège part → la troupe
 * grandit → elle frappe. Bernard-l'Ermite d'Acier (1 Raison, 3 exemplaires)
 * devient l'Éclaireur Ébréché des Mineurs. Coûts et statistiques inchangés.
 * Cartes `lab-…` : n'existent que le temps de la mesure. À charger en `--setup`.
 */

const db = CARD_DATABASE as Map<string, CardDefinition>;
const base = (id: string) => getCardDefinition(id);
const enregistrer = (carte: CardDefinition) => db.set(carte.id, carte);

const grandit = (key: string, puissance: number) => ({
  trigger: "onDeath" as const,
  triggeredBy: { cardTypes: ["structure" as const] },
  oncePerTurnKey: key,
  description: `Une de vos Structures part : +${puissance} Puissance, conservée.`,
  effects: [
    {
      type: "buff" as const,
      target: { kind: "self" as const },
      attackAmount: { kind: "flat" as const, value: puissance },
      healthAmount: { kind: "flat" as const, value: 0 },
      permanent: true,
    },
  ],
});

const bernard = base("bernard-lermite-dacier");
for (const [id, puissance] of [["lab-bernard-verrier", 1], ["lab-bernard-verrier-2", 2]] as const) {
  enregistrer({
    ...bernard,
    id,
    text:
      "Tant que vous contrôlez une Structure visible, il gagne +1 Résistance. La première fois à chaque tour qu'une " +
      `Structure que vous contrôlez est détruite ou Sabordée, il gagne +${puissance} Puissance.`,
    abilities: [grandit(`bernardVerrier${puissance}`, puissance)],
  });
}

// Charpentier des Épaves — il filtre ET il grandit (partagé avec les Épavistes).
const charpentier = base("charpentier-des-epaves");
enregistrer({
  ...charpentier,
  id: "lab-charpentier-verrier",
  text:
    "La première fois à chaque tour qu'une Structure que vous contrôlez est détruite ou Sabordée, piochez 1 carte " +
    "puis défaussez 1 carte, et il gagne +1 Puissance.",
  abilities: [
    {
      ...charpentier.abilities![0]!,
      description: "Une de vos Structures part : piochez 1, défaussez 1, +1 Puissance conservée.",
      effects: [
        ...charpentier.abilities![0]!.effects,
        { type: "buff", target: { kind: "self" }, attackAmount: { kind: "flat", value: 1 }, healthAmount: { kind: "flat", value: 0 }, permanent: true },
      ],
    },
  ],
});
