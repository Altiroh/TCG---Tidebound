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

// Bernard +1 et Charpentier qui grandit : ADOPTÉS le 30/09/2026 — ce sont
// désormais les textes des cartes elles-mêmes. Les identifiants de labo
// restent des alias, pour rejouer les listes archivées.
enregistrer({ ...base("bernard-lermite-dacier"), id: "lab-bernard-verrier" });
enregistrer({ ...base("charpentier-des-epaves"), id: "lab-charpentier-verrier" });

// Bernard +2 — écarté (50,4 %, moins bien que Bernard +1 avec le Charpentier).
enregistrer({
  ...base("bernard-lermite-dacier"),
  id: "lab-bernard-verrier-2",
  text:
    "Tant que vous contrôlez une Structure visible, il gagne +1 Résistance. La première fois à chaque tour qu'une " +
    "Structure que vous contrôlez est détruite ou Sabordée, il gagne +2 Puissance.",
  abilities: [grandit("bernardVerrier2", 2)],
});
