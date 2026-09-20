"use client";

import { useLayoutEffect, useState } from "react";
import styles from "@/features/match/table/Table.module.css";

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
 * qui passe juste sous le rang. Les deux cartes peuvent être n'importe où
 * dans le rang, jamais forcément côte à côte.
 *
 * Mesure le DOM (`[data-card-id]`) en coordonnées viewport : la grille du
 * board est fluide, aucune position n'est connue à l'avance. Trois
 * remesures, et pas une seule — c'est ce qui manquait à l'ancien
 * `EquipLinkOverlay`, dont le trait restait accroché à une position
 * périmée :
 *   - après l'animation d'arrivée d'une carte posée (`settle`), sinon le
 *     trait se dessine là où la carte n'est pas encore ;
 *   - au redimensionnement de la fenêtre ;
 *   - et surtout sur les cartes elles-mêmes (`ResizeObserver`) : leur
 *     taille suit les tokens du board, qui dépendent de requêtes de
 *     conteneur — ouvrir un panneau latéral les change sans qu'aucun
 *     `resize` ne soit émis.
 *
 * Le trait reste DANS le rang, et pas sous lui. Mesuré : le rang fait
 * exactement la hauteur des cartes (à 1 px près), et la zone qui l'entoure
 * aussi — l'ancien `EquipLinkOverlay` piquait 14 px sous le bas de la
 * carte, donc 14 px sur le cadre de bois du plateau, quand ce n'était pas
 * dans la mer. Les deux repères (`INSET`, `DIP`) sont proportionnels à la
 * carte et `DIP < INSET` : le tracé ne peut pas sortir de la carte, donc
 * jamais du rang, quelle que soit la taille du board.
 */

/** Remontée depuis le bas de la carte, en fraction de sa hauteur. */
const INSET = 0.055;
/** Profondeur du creux entre les deux cartes — toujours inférieure à `INSET`. */
const DIP = 0.035;
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
        const y1 = equip.bottom - equip.height * INSET;
        const y2 = host.bottom - host.height * INSET;
        // Descend le long du bas des cartes, puis rejoint le porteur — sans
        // jamais franchir leur bord (`DIP < INSET`).
        const below = Math.max(y1, y2) + equip.height * DIP;
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
