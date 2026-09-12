import type { CardDefinition } from "@/game/cards/types";

/**
 * Identifiant de substitution d'une carte que le destinataire d'une vue de
 * partie n'a pas le droit de connaître (main adverse, decks, Structure
 * adverse invisible pendant la Marée courante) — posé par
 * `toPlayerView` (`game/state/playerView.ts`).
 *
 * N'existe QUE dans une vue projetée envoyée à un client : le moteur ne
 * reçoit jamais un état qui en contient, puisqu'il ne tourne que sur l'état
 * complet, côté serveur.
 */
export const HIDDEN_CARD_ID = "__hidden__";

/**
 * Définition neutre renvoyée par `getCardDefinition(HIDDEN_CARD_ID)`, pour
 * que l'UI — qui appelle `getCardDefinition` sur toutes les cartes qu'elle
 * affiche — ne plante pas sur une carte masquée. Aucune statistique, aucun
 * effet, jamais visible : elle se rend toujours comme un dos de carte.
 */
export const HIDDEN_CARD_DEFINITION: CardDefinition = {
  id: HIDDEN_CARD_ID,
  name: "Carte cachée",
  type: "structure",
  cost: 0,
  visibleDuringTide: [],
};
