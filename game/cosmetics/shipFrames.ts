/**
 * Cadres de navire — la seconde famille de Collectables.
 *
 * Même principe que les dos (`cardBacks.ts`) : le catalogue vit en
 * TypeScript, la base ne stocke que ce qui est débloqué
 * (`player_cosmetics`, famille `shipSkin`). Le plateau n'affiche encore que
 * le cadre d'origine : un cadre obtenu sans visuel est montré comme tel —
 * obtenu, visuel à venir — plutôt que passé sous silence.
 */

export interface ShipFrameSkin {
  /** Identifiant stocké dans `player_cosmetics.cosmetic_id` (famille `shipSkin`). */
  id: string;
  label: string;
  description: string;
  /** Visuel du cadre, ou `null` tant qu'il n'est pas produit. */
  src: string | null;
  /** Possédé d'office par tout le monde. */
  free: boolean;
  /** Niveau qui le débloque, pour l'afficher dans la collection. */
  unlockLevel?: number;
}

/** Famille de cosmétique en base (`player_cosmetics.cosmetic_kind`). */
export const SHIP_FRAME_COSMETIC_KIND = "shipSkin";

export const DEFAULT_SHIP_FRAME_ID = "ship-frame-default";

export const SHIP_FRAMES: readonly ShipFrameSkin[] = [
  {
    id: DEFAULT_SHIP_FRAME_ID,
    label: "Coque d'origine",
    description: "Le cadre de bois ferré et de cordages qui porte chaque Navire en partie.",
    src: "/assets/ships/ship-frame-empty.webp",
    free: true,
  },
  {
    id: "ship-skin-abyssal",
    label: "Coque abyssale",
    description: "Une coque remontée des grands fonds. Palier du niveau 40.",
    src: null,
    free: false,
    unlockLevel: 40,
  },
];
