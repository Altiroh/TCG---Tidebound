"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { TRANSITION } from "@/components/game-ui/tokens";

interface FilterChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  active: boolean;
  children: ReactNode;
}

/**
 * Bascule de filtre compacte — contour fin au repos (jamais un fond plein),
 * glow laiton discret une fois actif. Utilisé aussi bien pour du texte
 * ("Tout") que pour une icône seule (type de carte).
 */
export function FilterChip({ active, children, className = "", ...props }: FilterChipProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={`inline-flex items-center justify-center rounded-full px-3 py-1.5 text-xs font-medium ${TRANSITION} active:scale-95 ${
        active
          ? "bg-[var(--accent)]/15 text-[var(--accent-hover)] shadow-[0_0_0_1px_var(--accent)]"
          : "text-[var(--text-secondary)] shadow-[0_0_0_1px_var(--border-subtle)] hover:text-[var(--text-primary)] hover:shadow-[0_0_0_1px_rgba(255,255,255,0.25)]"
      } ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
