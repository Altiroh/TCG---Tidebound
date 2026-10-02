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

// Mouette du Brise-Lames, Carcasse Renversée, Le Dernier Rempart : ADOPTÉES
// le 30/09/2026 — ce sont désormais les textes des cartes elles-mêmes. Les
// identifiants de labo restent des alias, pour rejouer les listes archivées.
enregistrer({ ...base("mouette-du-brise-lames"), id: "lab-mouette-verrier" });
enregistrer({ ...base("carcasse-renversee"), id: "lab-carcasse-verrier" });
enregistrer({ ...base("le-dernier-rempart"), id: "lab-rempart-verrier" });

// Brise-Vague de Fortune — ÉCARTÉE : une aura de stats sans boucle, qui
// poussait la Forteresse à 68 %.
enregistrer({
  ...base("brise-vague-de-fortune"),
  id: "lab-brise-vague-verrier",
  text: "Durée : 3 tours. Visible pendant Houle et Tempête. Tant qu'elle est visible, vos unités ont +1 Puissance.",
  abilities: [],
  reduceTideShipDamageOncePerTurn: undefined,
  auraBuffControllerCardTypes: { targetTypes: [...UNITES], attackAmount: 1, whileSelfVisible: true },
} as CardDefinition);
