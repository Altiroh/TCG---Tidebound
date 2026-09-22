/**
 * Les listes du BANC D'ESSAI, nommées une seule fois.
 *
 * Extrait de `playtestReport.ts` : l'audit du swarm et les replays
 * d'équilibrage doivent jouer exactement les mêmes listes que le rapport de
 * rythme, sinon leurs chiffres ne se comparent pas.
 *
 * DEPUIS LE 22/09/2026, le banc joue les DECKS D'EMPRUNT et rien d'autre.
 * Il tournait jusque-là sur une sélection composite — cinq emprunts et six
 * préconstruits — entretenue à la main dans ce fichier. Deux problèmes, et
 * le second est le vrai :
 *
 *  - elle ne se mettait à jour que si quelqu'un y pensait, donc elle
 *    dérivait du catalogue à chaque lot ;
 *  - elle mesurait un rayon que personne ne joue. Les douze emprunts sont
 *    désormais ce qu'un joueur a réellement entre les mains à la sortie du
 *    tutoriel, et ils couvrent les douze grandes mécaniques du jeu. Mesurer
 *    autre chose, c'est mesurer à côté.
 *
 * Les préconstruits restent un produit (Jeton de Préconstruit) ; ils ne
 * sont simplement plus la référence d'équilibrage.
 */
import { BORROWED_DECK_LISTS } from "@/game/cards/decks/borrowed";
import type { DeckList } from "@/game/cards/decks/types";

/** Les douze emprunts, indexés par leur nom affiché. */
export const DECKS: Record<string, DeckList> = Object.fromEntries(
  BORROWED_DECK_LISTS.map((deck) => [deck.name, deck])
);

/**
 * La liste de référence DÉFENSIVE, contre laquelle tout ce qui attaque se
 * mesure.
 *
 * La Forteresse remplace La Ligne Tenue : c'est le deck d'emprunt dont le
 * plan est explicitement d'encaisser (« retarder suffisamment la partie
 * pour rendre les grosses cartes pertinentes »). Comparaison impossible
 * avec les relevés d'avant le 22/09 — ce n'est pas le même deck, et le
 * catalogue a changé de 48 cartes entre-temps.
 */
export const REFERENCE_DEFENSIVE = "La Forteresse";
