import type { DieSize } from "@/game";

/**
 * Planches des dés : une TEXTURE de face vierge par dé (`de-6-face`…) et une
 * image de POINTS par valeur (`de-6-3`…), peintes de face, à plat. Le dé
 * est construit en volume (`polyhedra.ts`) : chaque face reçoit la texture
 * et les points de sa valeur, la perspective vient de la 3D.
 *
 * Dossier : `public/assets/dice/`. Les vues de trois quarts du 06/10/2026
 * (`de-4`, `de-6`, `de-8`) ne servent plus au plateau.
 */
export const DICE_DIR = "/assets/dice";

/** Texture d'une face VIERGE du dé (carré pour le D6, triangle pour le D4 et le D8). */
export function dieTextureUrl(die: DieSize): string {
  return `${DICE_DIR}/de-${die}-face.webp`;
}

export function dieFaceUrl(die: DieSize, value: number): string {
  return `${DICE_DIR}/de-${die}-${value}.webp`;
}

/**
 * Où la plaque est peinte dans sa texture (px de l'image). Les textures sont
 * rognées à leur plaque (512 px de large) ; on retire encore 4 px de bord
 * pour qu'aucun liseré transparent n'apparaisse sur les arêtes du solide.
 */
export const DIE_TEXTURE_BOX: Record<DieSize, { width: number; height: number; x0: number; y0: number; x1: number; y1: number }> = {
  4: { width: 512, height: 455, x0: 4, y0: 4, x1: 508, y1: 451 },
  6: { width: 512, height: 504, x0: 4, y0: 4, x1: 508, y1: 500 },
  8: { width: 512, height: 451, x0: 4, y0: 4, x1: 508, y1: 447 },
};

/** `background-size` et `background-position` pour une tuile de `width` × `height` px. */
export function dieTextureFit(die: DieSize, width: number, height: number): { backgroundSize: string; backgroundPosition: string } {
  const box = DIE_TEXTURE_BOX[die];
  const sx = width / (box.x1 - box.x0);
  const sy = height / (box.y1 - box.y0);
  return {
    backgroundSize: `${(box.width * sx).toFixed(1)}px ${(box.height * sy).toFixed(1)}px`,
    backgroundPosition: `${(-box.x0 * sx).toFixed(1)}px ${(-box.y0 * sy).toFixed(1)}px`,
  };
}
