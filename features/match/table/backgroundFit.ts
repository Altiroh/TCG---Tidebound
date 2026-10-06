/**
 * CADRAGE DU FOND sur l'interface — la partie pure.
 *
 * Un fond de partie (1672 × 941) porte une zone faite pour recevoir le
 * plateau : le tapis de parchemin de la table classique, l'enclos de murs
 * du Donjon. Un simple `cover` ne savait rien des rangées : elles
 * débordaient du tapis. Ici, on choisit le zoom et le décalage du fond pour
 * que cette zone ENGLOBE les zones d'interface mesurées (rangées, bande
 * centrale, colonne de droite), avec une marge — sans jamais laisser voir
 * le bord du fond.
 */

/** Format des fonds de partie. */
export const BACKGROUND_W = 1672;
export const BACKGROUND_H = 941;

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Zone du fond faite pour le plateau, en fractions du fond : `[gauche, haut, droite, bas]`. */
export type FitTarget = readonly [number, number, number, number];

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Boîte (px, dans le repère de la vue) où poser le fond pour que `target`
 * englobe `ui` agrandi de `margin`, tout en couvrant la vue entière.
 *
 * Le zoom est le plus petit qui satisfait les deux ; la zone est centrée sur
 * l'interface, puis le fond est ramené dans la vue s'il en découvrait un
 * bord (la zone peut alors n'englober l'interface qu'au mieux).
 */
export function fitBackground(view: { width: number; height: number }, ui: Rect, target: FitTarget, margin: number): Box {
  const [tx0, ty0, tx1, ty1] = target;
  const uiW = ui.right - ui.left + 2 * margin;
  const uiH = ui.bottom - ui.top + 2 * margin;
  const scale = Math.max(
    view.width / BACKGROUND_W,
    view.height / BACKGROUND_H,
    uiW / ((tx1 - tx0) * BACKGROUND_W),
    uiH / ((ty1 - ty0) * BACKGROUND_H)
  );
  const width = BACKGROUND_W * scale;
  const height = BACKGROUND_H * scale;
  const centerX = (ui.left + ui.right) / 2;
  const centerY = (ui.top + ui.bottom) / 2;
  const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
  return {
    left: clamp(centerX - ((tx0 + tx1) / 2) * width, view.width - width, 0),
    top: clamp(centerY - ((ty0 + ty1) / 2) * height, view.height - height, 0),
    width,
    height,
  };
}

/** Englobe des rectangles (ignorés : ceux de taille nulle). `null` s'il n'en reste aucun. */
export function unionRect(rects: Rect[]): Rect | null {
  const real = rects.filter((r) => r.right > r.left && r.bottom > r.top);
  if (real.length === 0) return null;
  return {
    left: Math.min(...real.map((r) => r.left)),
    top: Math.min(...real.map((r) => r.top)),
    right: Math.max(...real.map((r) => r.right)),
    bottom: Math.max(...real.map((r) => r.bottom)),
  };
}
