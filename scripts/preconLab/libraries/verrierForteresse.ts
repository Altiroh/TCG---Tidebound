import { CARD_DATABASE, getCardDefinition } from "@/game/cards/sets/core";
import type { CardDefinition } from "@/game/cards/types";

/**
 * STANDARD VERRIER — LA FORTERESSE (30/09/2026).
 *
 * Constat : 85 % des dégâts de la Forteresse viennent de corps neutres, 4 %
 * de ses cartes de moteur (Δ −13). Ses Structures réduisent des dégâts et
 * rien d'autre ; ses unités sont des murs sans effet. Aucune boucle.
 *
 * Le gage de Verre : le déclencheur paie en STATS sur l'unité qui frappe.
 * Adapté aux murs — « encaisser → grandir → frapper » :
 *   - les Structures visibles arment les unités et font grandir celles qui
 *     tiennent le choc ;
 *   - les unités Garde qui survivent prennent de la Puissance ;
 *   - le Dernier Rempart convertit chaque coup encaissé en dégâts au Navire.
 *
 * Seules les cartes PROPRES à la Forteresse sont retouchées (les génériques
 * partagées changeraient d'autres decks). Coûts, statistiques et durées
 * inchangés : seul l'effet change. Cartes `lab-…` : n'existent que le temps
 * de la mesure. À charger en `--setup`.
 */

const db = CARD_DATABASE as Map<string, CardDefinition>;
const base = (id: string) => getCardDefinition(id);
const enregistrer = (carte: CardDefinition) => db.set(carte.id, carte);
const UNITES = ["marin", "creature"] as const;

const grandit = (key: string, puissance: number) => ({
  trigger: "onSurvivedDamage" as const,
  oncePerTurnKey: key,
  description: `Tient bon : +${puissance} Puissance, conservée.`,
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

// Mouette du Brise-Lames — le petit mur qui devient une arme.
enregistrer({
  ...base("mouette-du-brise-lames"),
  id: "lab-mouette-verrier",
  text: "Garde. La première fois à chaque tour qu'elle survit à des dégâts, elle gagne +1 Puissance.",
  abilities: [grandit("mouetteVerrier", 1)],
});

// Brise-Vague de Fortune — le mur arme ceux qu'il abrite.
enregistrer({
  ...base("brise-vague-de-fortune"),
  id: "lab-brise-vague-verrier",
  text: "Durée : 3 tours. Visible pendant Houle et Tempête. Tant qu'elle est visible, vos unités ont +1 Puissance.",
  abilities: [],
  reduceTideShipDamageOncePerTurn: undefined,
  auraBuffControllerCardTypes: { targetTypes: [...UNITES], attackAmount: 1, whileSelfVisible: true },
} as CardDefinition);

// Carcasse Renversée — derrière elle, chaque coup encaissé endurcit.
enregistrer({
  ...base("carcasse-renversee"),
  id: "lab-carcasse-verrier",
  text:
    "Durée : 4 tours. Visible pendant Houle, Tempête et Abysses. Si elle est visible, la première fois à chaque " +
    "tour qu'une de vos unités survit à des dégâts, cette unité gagne +1 Puissance.",
  capDirectShipDamageWhileVisible: undefined,
  abilities: [
    {
      trigger: "onSurvivedDamage",
      triggeredBy: { cardTypes: [...UNITES] },
      condition: { selfVisible: true },
      oncePerTurnKey: "carcasseVerrier",
      description: "Une de vos unités tient bon derrière la Carcasse : +1 Puissance, conservée.",
      effects: [
        {
          type: "buff",
          target: { kind: "triggerSource" },
          attackAmount: { kind: "flat", value: 1 },
          healthAmount: { kind: "flat", value: 0 },
          permanent: true,
        },
      ],
    },
  ],
} as CardDefinition);

// Le Dernier Rempart — chaque coup encaissé revient à l'envoyeur.
enregistrer({
  ...base("le-dernier-rempart"),
  id: "lab-rempart-verrier",
  text: "Garde. La première fois à chaque tour qu'il survit à des dégâts, infligez 2 dégâts au Navire adverse.",
  abilities: [
    {
      trigger: "onSurvivedDamage",
      oncePerTurnKey: "rempartVerrier",
      description: "Il tient : 2 dégâts au Navire adverse.",
      effects: [{ type: "damage", target: { kind: "opponentPlayer" }, amount: { kind: "flat", value: 2 } }],
    },
  ],
});
