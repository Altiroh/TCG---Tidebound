"use client";

import { useState, type ReactNode } from "react";
import styles from "@/components/game-ui/GameUi.module.css";

interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  /** `true` : reste ouvert au clic plutôt qu'au seul survol (utile pour un popover d'options sur tactile). */
  clickToOpen?: boolean;
}

/**
 * Info-bulle générique — remplace les tooltips HTML natifs (`title="..."`)
 * pour tout ce qui mérite d'être lisible (description de carte, option de
 * tri...). Une petite feuille bleu nuit opaque avec sa pointe, la même
 * matière que les menus (`GameUi.module.css`) — jamais un rectangle noir.
 *
 * S'ouvre aussi au FOCUS clavier : ce qu'on explique à la souris doit
 * s'expliquer au clavier.
 */
export function Tooltip({ content, children, clickToOpen = false }: TooltipProps) {
  const [open, setOpen] = useState(false);

  return (
    <span
      className={styles.tooltipAnchor}
      onMouseEnter={() => !clickToOpen && setOpen(true)}
      onMouseLeave={() => !clickToOpen && setOpen(false)}
      onFocus={() => !clickToOpen && setOpen(true)}
      onBlur={() => !clickToOpen && setOpen(false)}
      onClick={() => clickToOpen && setOpen((v) => !v)}
    >
      {children}
      {open && (
        <span role="tooltip" className={styles.tooltip}>
          {content}
        </span>
      )}
    </span>
  );
}
