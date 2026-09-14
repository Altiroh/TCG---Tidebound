/**
 * Géométrie du cadre Navire (`public/assets/ships/ship-frame-empty.webp`,
 * 512×640) — partagée entre le plateau (`ShipInstrumentCluster`) et les
 * écrans de menu (`ShipPortrait` : Deck Builder, liste des decks, Jouer).
 * Une seule source de vérité : si le cadre est redessiné, tout suit.
 */

/** Ratio réel du cadre — dérive la hauteur à partir de la largeur demandée. */
export const SHIP_FRAME_ASPECT = 512 / 640;

export const SHIP_FRAME_SRC = "/assets/ships/ship-frame-empty.webp";

/**
 * Fenêtre en arche du cadre, mesurée par remplissage de la zone
 * transparente (alpha ≤ 40) depuis son centre : ~13,1 %/76,3 % de hauteur,
 * ~14,8 %/84,8 % de largeur. La zone déborde de 1 % de chaque côté (anneau
 * vérifié 100 % opaque : le bois du cadre recouvre ce débord) et
 * `SHIP_ILLUSTRATION_CLIP` suit le contour réel, en coordonnées relatives à
 * la zone.
 */
export const SHIP_ILLUSTRATION_ZONE = { top: "12.19%", left: "13.87%", width: "71.88%", height: "65%" } as const;

export const SHIP_ILLUSTRATION_CLIP =
  "polygon(39.4% 0%, 22.6% 7.5%, 13.9% 13.7%, 8.4% 19.7%, 4.6% 25.7%, 1.9% 31.7%, 0.3% 38%, 0% 44%, 0% 86.5%, 1.4% 92.5%, 7.3% 100%, 92.9% 100%, 98.9% 92.5%, 100% 86.5%, 100% 44%, 99.5% 38%, 97.8% 31.7%, 95.4% 25.7%, 91.6% 19.7%, 85.9% 13.7%, 77.2% 7.5%, 60.6% 0%)";

/** Centre vertical de la plaque en bois sous l'arche (médaillons en partie, nom du Navire en menu). */
export const SHIP_PLATE_TOP = "74%";

/** URL publique de l'illustration d'un Navire (`ShipDefinition.illustration`). */
export function shipIllustrationUrl(illustration: string): string {
  return `/assets/ships/illu/${illustration}`;
}
