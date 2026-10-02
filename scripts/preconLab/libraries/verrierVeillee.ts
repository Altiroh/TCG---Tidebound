import { CARD_DATABASE, getCardDefinition } from "@/game/cards/sets/core";
import type { CardDefinition } from "@/game/cards/types";

/**
 * STANDARD VERRIER — LA VEILLÉE (30/09/2026).
 *
 * Constat : ses unités-moteur font bien les dégâts (67 %), mais leurs gains
 * s'évaporent en fin de tour — Cache-Cache et Papa est en mer prennent +1
 * Puissance « jusqu'à la fin du tour » — et la Veillée perd la course contre
 * les decks rapides (10 à 17 %). Le gage de Verre : le déclencheur paie en
 * stats CONSERVÉES sur l'unité qui frappe.
 *
 * Variantes cumulatives (coûts et statistiques de base inchangés) :
 *   - Cache-Cache : son +1 Puissance devient permanent ;
 *   - Papa est en mer : idem ;
 *   - Encore cinq minutes : elle grandit aussi quand elle survit à des dégâts.
 * Cartes `lab-…` : n'existent que le temps de la mesure. À charger en `--setup`.
 */

const db = CARD_DATABASE as Map<string, CardDefinition>;
const base = (id: string) => getCardDefinition(id);
const enregistrer = (carte: CardDefinition) => db.set(carte.id, carte);

// Cache-Cache, Papa est en mer, Encore cinq minutes : ADOPTÉES le 01/10/2026
// — ce sont désormais les textes des cartes elles-mêmes. Les identifiants de
// labo restent des alias, pour rejouer les listes archivées.
enregistrer({ ...base("cache-cache"), id: "lab-cache-cache-verrier" });
enregistrer({ ...base("papa-est-en-mer"), id: "lab-papa-verrier" });
enregistrer({ ...base("encore-cinq-minutes"), id: "lab-cinq-minutes-verrier" });
