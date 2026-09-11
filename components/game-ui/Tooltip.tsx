"use client";

import { useState, type ReactNode } from "react";
import { BORDER_SUBTLE, RADIUS_SM, SHADOW_FLOATING, TEXT_PRIMARY, TRANSITION } from "@/components/game-ui/tokens";

interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  /** `true` : reste ouvert au clic plutôt qu'au seul survol (utile pour un popover d'options sur tactile). */
  clickToOpen?: boolean;
}

/**
 * Info-bulle générique — remplace les tooltips HTML natifs (`title="..."`)
 * pour tout ce qui mérite d'être lisible (description de carte, option de
 * tri...). Petit chip en verre fumé, jamais un rectangle plein.
 */
export function Tooltip({ content, children, clickToOpen = false }: TooltipProps) {
  const [open, setOpen] = useState(false);

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => !clickToOpen && setOpen(true)}
      onMouseLeave={() => !clickToOpen && setOpen(false)}
      onClick={() => clickToOpen && setOpen((v) => !v)}
    >
      {children}
      {open && (
        <span
          className={`pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 w-max max-w-xs -translate-x-1/2 bg-[var(--surface-glass)] backdrop-blur-xl px-3 py-1.5 text-xs ${TEXT_PRIMARY} ${BORDER_SUBTLE} ${RADIUS_SM} ${SHADOW_FLOATING} ${TRANSITION}`}
        >
          {content}
        </span>
      )}
    </span>
  );
}
