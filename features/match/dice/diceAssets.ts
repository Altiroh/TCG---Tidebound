import type { DieSize } from "@/game";

/**
 * Planches des dés (06/10/2026) : un CORPS par dé (`de-4`, `de-6`, `de-8`)
 * et une image de POINTS par face (`de-6-3`…), peinte de face, à plat.
 * Les points se posent sur la face visible du corps et se DÉFORMENT avec
 * lui pendant le lancer (`TableDice`) : c'est la distorsion qui donne le
 * volume, les planches n'ont qu'une vue.
 *
 * Dossier : `public/assets/dice/`. Si une planche manquait, un dé dessiné
 * prend le relais — rien ne casse, le chiffre reste lisible.
 */
export const DICE_DIR = "/assets/dice";

export function dieBodyUrl(die: DieSize): string {
  return `${DICE_DIR}/de-${die}.webp`;
}

export function dieFaceUrl(die: DieSize, value: number): string {
  return `${DICE_DIR}/de-${die}-${value}.webp`;
}

/**
 * Où se posent les points sur le corps, en % de l'image du corps, et la
 * déformation qui les couche sur la face visible. Calé sur les planches du
 * 06/10/2026 (corps recadrés à leur silhouette ; les faces d'un même dé
 * partagent un cadre commun, pour que la taille des points ne varie pas
 * d'une face à l'autre) :
 *   - D4 : face avant du tétraèdre, légèrement couchée ;
 *   - D6 : face GAUCHE du cube vu de trois quarts, cisaillée comme elle ;
 *   - D8 : facette haute gauche de l'octaèdre.
 */
export const DIE_FACE_PLACEMENT: Record<DieSize, { left: number; top: number; width: number; height: number; transform: string }> = {
  4: { left: 28, top: 45, width: 44, height: 44, transform: "perspective(300px) rotateX(28deg)" },
  6: { left: 8, top: 33, width: 42, height: 46, transform: "skewY(14deg)" },
  8: { left: 15, top: 20, width: 38, height: 36, transform: "skewY(-22deg) scaleX(0.9)" },
};
