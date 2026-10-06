import type { DieSize } from "@/game";

/**
 * Planches des dés (06/10/2026) : un CORPS par dé (`de-4`, `de-6`, `de-8`)
 * et une image de POINTS par face (`de-6-3`…), peinte de face, à plat.
 * Les points se posent sur la face visible du corps et se DÉFORMENT avec
 * lui pendant le lancer (`TableDice`) : c'est la distorsion qui donne le
 * volume, les planches n'ont qu'une vue.
 *
 * Dossier : `public/assets/dice/`. Tant que les planches n'y sont pas, un
 * dé dessiné prend le relais — rien ne casse, le chiffre reste lisible.
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
 * déformation qui les couche sur la face visible. VALEURS DE DÉPART, à
 * recaler sur les planches une fois livrées : le corps du D6 est vu de
 * trois quarts, ses points sont donc légèrement écrasés en hauteur ; le D4
 * et le D8 montrent une face triangulaire, plus petite.
 */
export const DIE_FACE_PLACEMENT: Record<DieSize, { left: number; top: number; width: number; height: number; transform: string }> = {
  4: { left: 26, top: 40, width: 48, height: 44, transform: "perspective(240px) rotateX(16deg)" },
  6: { left: 17, top: 22, width: 66, height: 60, transform: "perspective(260px) rotateX(14deg) skewX(-3deg)" },
  8: { left: 25, top: 24, width: 50, height: 50, transform: "perspective(240px) rotateX(10deg)" },
};
