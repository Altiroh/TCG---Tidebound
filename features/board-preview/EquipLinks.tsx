"use client";

import { useLayoutEffect, useState } from "react";
import styles from "@/features/board-preview/BoardPreview.module.css";

interface Link {
  key: string;
  d: string;
}

interface EquipLinksProps {
  /** Équipement → porteur (`usePreviewTable`). */
  attachments: Record<string, string>;
  /** Change quand les cartes bougent (pose, Sabordage) : force une nouvelle mesure. */
  layoutKey: string;
}

/**
 * Lien Équipement ↔ porteur, sous les cartes : un trait en angles droits
 * qui passe juste sous le rang, comme `EquipLinkOverlay` de l'ancien board.
 * Les deux cartes peuvent être n'importe où dans le rang.
 *
 * Mesure le DOM (`[data-card-id]`) en coordonnées viewport et se recalcule
 * au redimensionnement : la grille du board est fluide, aucune position
 * n'est connue à l'avance.
 */
export function EquipLinks({ attachments, layoutKey }: EquipLinksProps) {
  const [links, setLinks] = useState<Link[]>([]);

  useLayoutEffect(() => {
    function measure() {
      const next: Link[] = [];
      for (const [equipId, hostId] of Object.entries(attachments)) {
        const equip = document.querySelector(`[data-card-id="${equipId}"]`)?.getBoundingClientRect();
        const host = document.querySelector(`[data-card-id="${hostId}"]`)?.getBoundingClientRect();
        if (!equip || !host) continue;
        const x1 = equip.left + equip.width / 2;
        const x2 = host.left + host.width / 2;
        const y1 = equip.bottom;
        const y2 = host.bottom;
        // Descend sous le rang d'une fraction de carte, puis rejoint le porteur.
        const below = Math.max(y1, y2) + Math.max(4, equip.height * 0.035);
        next.push({ key: equipId, d: `M ${x1} ${y1} V ${below} H ${x2} V ${y2}` });
      }
      setLinks(next);
    }
    measure();
    // Les cartes posées jouent une courte animation d'arrivée : on remesure après.
    const settle = window.setTimeout(measure, 420);
    // `resize` ne couvre pas tout (émulation d'écran, panneau latéral) : on observe
    // aussi les cartes liées elles-mêmes, dont la taille suit les tokens du board.
    window.addEventListener("resize", measure);
    const observer = new ResizeObserver(measure);
    document.querySelectorAll("[data-card-id]").forEach((el) => observer.observe(el));
    return () => {
      window.clearTimeout(settle);
      window.removeEventListener("resize", measure);
      observer.disconnect();
    };
  }, [attachments, layoutKey]);

  if (links.length === 0) return null;

  return (
    <svg aria-hidden className={styles.equipLinks}>
      {links.map((link) => (
        <g key={link.key}>
          <path d={link.d} className={styles.equipLinkShadow} />
          <path d={link.d} className={styles.equipLink} />
        </g>
      ))}
    </svg>
  );
}
