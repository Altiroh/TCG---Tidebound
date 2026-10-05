/**
 * Cadre de carte en usage.
 *
 * Le NOUVEAU cadre (`features/cadre-preview/NouveauCadreCard.tsx` :
 * illustration plein cadre, scintillement des légendaires, reflet des
 * Abyssales) est le cadre du jeu depuis le 05/10/2026. Il était à l'essai
 * derrière une option ; l'option est retirée.
 *
 * L'ANCIEN cadre reste dans `CardTile` (et ses assets, dont les bandeaux de
 * type `cards/icons/type-*.webp`) : passer cette constante à `false` le
 * rétablit partout, sans autre changement.
 */
export const NOUVEAU_CADRE = true;
