"use client";

import type { ButtonHTMLAttributes, MouseEvent, ReactNode } from "react";
import { TRANSITION } from "@/components/game-ui/tokens";
import { playButtonClick } from "@/lib/sound";

interface GameIconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  /** Rendu "allumé" (ex: filtre actif) — glow laiton au lieu du fond neutre. */
  active?: boolean;
  size?: number;
}

/**
 * Icône seule, cliquable — remplace les boutons ronds bordés en dur (filtres
 * de type, tri, recherche...). Invisible/neutre au repos, ne se distingue
 * que par un fond très léger au survol et un glow laiton quand `active`.
 */
export function GameIconButton({ children, active = false, size = 36, className = "", onClick, ...props }: GameIconButtonProps) {
  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    playButtonClick();
    onClick?.(event);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`inline-flex items-center justify-center rounded-full ${TRANSITION} active:scale-90 ${
        active
          ? "bg-[var(--accent)]/15 text-[var(--accent-hover)] shadow-[0_0_0_1px_var(--accent)]"
          : "text-[var(--text-secondary)] hover:bg-white/5 hover:text-[var(--text-primary)]"
      } ${className}`}
      style={{ width: size, height: size }}
      {...props}
    >
      {children}
    </button>
  );
}
