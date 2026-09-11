/**
 * Classes Tailwind arbitraires partagées, dérivées des tokens CSS posés
 * dans `app/globals.css` (`--surface-0`, `--accent`, etc.). Centralisées
 * ici pour que tous les composants `game-ui/*` restent visuellement
 * cohérents sans dupliquer les mêmes chaînes `bg-[var(--...)]` partout.
 */
export const SURFACE_0 = "bg-[var(--surface-0)]";
export const SURFACE_1 = "bg-[var(--surface-1)]";
export const SURFACE_GLASS = "bg-[var(--surface-glass)] backdrop-blur-md";
export const BORDER_SUBTLE = "border border-[var(--border-subtle)]";
export const TEXT_PRIMARY = "text-[var(--text-primary)]";
export const TEXT_SECONDARY = "text-[var(--text-secondary)]";
export const RADIUS_SM = "rounded-[var(--radius-sm)]";
export const RADIUS_MD = "rounded-[var(--radius-md)]";
export const SHADOW_PANEL = "shadow-[var(--shadow-panel)]";
export const SHADOW_FLOATING = "shadow-[var(--shadow-floating)]";

/** Transition standard de la refonte — 120 à 220ms, jamais plus. */
export const TRANSITION = "transition duration-150 ease-out";
