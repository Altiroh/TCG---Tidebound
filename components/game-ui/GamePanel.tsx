import type { HTMLAttributes } from "react";
import { BORDER_SUBTLE, RADIUS_MD, SHADOW_PANEL, SURFACE_1 } from "@/components/game-ui/tokens";

interface GamePanelProps extends HTMLAttributes<HTMLDivElement> {
  /** `true` pour un panneau en verre fumé (superposé à du contenu) plutôt qu'une surface pleine. */
  glass?: boolean;
}

/**
 * Bloc de contenu générique — remplace les `<div className="rounded-md
 * border border-amber-600/40 bg-slate-950/70 p-...">` ad hoc. Une bordure à
 * peine visible plutôt qu'un contour net, une ombre douce plutôt qu'un
 * encadré dur.
 */
export function GamePanel({ glass = false, className = "", ...props }: GamePanelProps) {
  return (
    <div
      className={`${glass ? "bg-[var(--surface-glass)] backdrop-blur-md" : SURFACE_1} ${BORDER_SUBTLE} ${RADIUS_MD} ${SHADOW_PANEL} ${className}`}
      {...props}
    />
  );
}
