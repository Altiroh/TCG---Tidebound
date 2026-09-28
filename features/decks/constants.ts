/** Navire par défaut d'un deck personnel fraîchement créé — pas encore de sélecteur de Navire à la création ("on pimpera plus tard"), modifiable une fois un sélecteur ajouté à l'éditeur. */
export const DEFAULT_SHIP_ID = "le-courlis";

/**
 * Longueur maximale du résumé libre d'un deck, affiché sur sa fiche à
 * l'écran Jouer. Deux lignes de fiche, pas un journal de bord : les
 * descriptions des listes du jeu font 90 à 160 caractères, celle-ci a la
 * même place à tenir.
 */
export const DECK_DESCRIPTION_MAX = 180;

/** Longueur maximale du nom d'un deck — la même borne qu'en base (`player_decks_name_length`). */
export const DECK_NAME_MAX = 60;
