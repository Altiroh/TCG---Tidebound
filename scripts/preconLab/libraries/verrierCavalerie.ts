import { CARD_DATABASE, getCardDefinition } from "@/game/cards/sets/core";
import type { CardDefinition } from "@/game/cards/types";

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

// Destrier du Ressac, Mufle au Fanion, Monture de Brèche : ADOPTÉS (V3) le
// 01/10/2026 — ce sont désormais les textes des cartes elles-mêmes. Les
// identifiants de labo restent des alias, pour rejouer les listes archivées.
enregistrer({ ...base("destrier-du-ressac"), id: "lab-destrier-verrier" });
enregistrer({ ...base("mufle-au-fanion"), id: "lab-mufle-verrier" });
enregistrer({ ...base("monture-de-breche"), id: "lab-monture-verrier" });
