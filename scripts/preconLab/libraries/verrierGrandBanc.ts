import { CARD_DATABASE, getCardDefinition } from "@/game/cards/sets/core";
import type { CardDefinition } from "@/game/cards/types";

/**
 * STANDARD VERRIER — LE GRAND BANC (01/10/2026).
 *
 * Constat : un essaim dont rien ne reste. Tous les déclencheurs du banc
 * paient « jusqu'à la fin du tour » (Chef de Banc, Ramasseur, Grand Rêve) ;
 * le reste est statique (seigneurs) ou sans texte (Têtard-Fesse Δ −12).
 * Le banc s'aligne, se fait bloquer par des murs (Forteresse : 20 %) et ne
 * grandit jamais.
 *
 * Boucle visée, « le banc grossit » : chaque arrivée nourrit un
 * Cra-Poiscail qui garde ce qu'il gagne, et chaque perte refait une
 * arrivée. Coûts et statistiques de base inchangés.
 *   V1 — les trois déclencheurs gardent leur gain (`permanent: true`) ;
 *   V2 — V1 + Têtard-Fesse : « Quand il est détruit, invoquez 1 Péon
 *        Cra-Poiscail 1 / 1. » (la perte relance l'arrivée).
 * Cartes `lab-…` : n'existent que le temps de la mesure. À charger en `--setup`.
 */

const db = CARD_DATABASE as Map<string, CardDefinition>;
const base = (id: string) => getCardDefinition(id);
const enregistrer = (carte: CardDefinition) => db.set(carte.id, carte);

// Chef de Banc, Ramasseur, Grand Rêve, Têtard-Fesse : ADOPTÉS (V2) le
// 01/10/2026 — ce sont désormais les textes des cartes elles-mêmes. Les
// identifiants de labo restent des alias, pour rejouer les listes archivées.
enregistrer({ ...base("cra-poiscail-chef-de-banc"), id: "lab-chef-de-banc-verrier" });
enregistrer({ ...base("cra-poiscail-ramasseur"), id: "lab-ramasseur-verrier" });
enregistrer({ ...base("ptite-fesse-grand-reve"), id: "lab-grand-reve-verrier" });
enregistrer({ ...base("tetard-fesse"), id: "lab-tetard-verrier" });
