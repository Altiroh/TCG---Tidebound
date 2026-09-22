/**
 * Les listes du BANC D'ESSAI, nommées une seule fois.
 *
 * Extrait de `playtestReport.ts` : l'audit du swarm et les replays
 * d'équilibrage doivent jouer exactement les mêmes listes que le rapport de
 * rythme, sinon leurs chiffres ne se comparent pas.
 *
 * `La Ligne Tenue` reste la RÉFÉRENCE DÉFENSIVE : c'est contre elle que se
 * mesure ce qui attaque.
 */
import {
  DECK_A_PORTEE,
  DECK_BEC_DANS_LA_BRUME,
  DECK_CAP_DE_FER,
  DECK_GRACE_SOUS_PRESSION,
  DECK_LE_BANC_DEBORDE,
} from "@/game/cards/decks/borrowed";
import {
  DECK_DERNIER_RAPPEL,
  DECK_GRENOUILLES_AU_CANON,
  DECK_LA_LIGNE_TENUE,
  DECK_LES_PETITS_ATTENDENT,
  DECK_SOUS_LA_LIGNE,
  DECK_TOUT_RECUPERER,
} from "@/game/cards/decks/precon";
import type { DeckList } from "@/game/cards/decks/types";

export const DECKS: Record<string, DeckList> = {
  "La Ligne Tenue": DECK_LA_LIGNE_TENUE,
  "Bec dans la Brume": DECK_BEC_DANS_LA_BRUME,
  "Cap de Fer": DECK_CAP_DE_FER,
  "Le Banc Déborde": DECK_LE_BANC_DEBORDE,
  "Grâce sous pression": DECK_GRACE_SOUS_PRESSION,
  "À Portée": DECK_A_PORTEE,
  "Dernier Rappel": DECK_DERNIER_RAPPEL,
  "Sous la Ligne": DECK_SOUS_LA_LIGNE,
  "Tout Récupérer": DECK_TOUT_RECUPERER,
  "Les Petits Attendent": DECK_LES_PETITS_ATTENDENT,
  "Grenouilles au Canon": DECK_GRENOUILLES_AU_CANON,
};

/** La liste de référence défensive, contre laquelle tout le reste se mesure. */
export const REFERENCE_DEFENSIVE = "La Ligne Tenue";
