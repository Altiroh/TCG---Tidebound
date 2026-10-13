"use client";

import type { CSSProperties } from "react";
import styles from "@/features/shell/MicroLoader.module.css";

interface MicroLoaderProps {
  /** L'attente est en cours. */
  active: boolean;
  /** Ce qu'on attend, en quelques mots (« Coup en route », « L'adversaire réfléchit »). */
  label: string;
  /**
   * Il ne se montre qu'au-delà de ce délai : une attente brève passe sans
   * rien faire clignoter. Défaut : 220 ms.
   */
  delayMs?: number;
  /** `floating` : pastille posée en haut de l'écran de jeu ; `inline` : dans le flux, à côté d'un bouton. */
  placement?: "floating" | "inline";
}

/**
 * MICRO-CHARGEMENT (13/10/2026) — « si besoin, mettre en place des micro
 * chargements ». Quand l'interface attend quelque chose qu'elle ne peut pas
 * montrer d'avance (la réponse du serveur à une attaque, la réflexion du
 * bot), elle le DIT, discrètement : un petit anneau qui tourne et trois mots.
 * Sans lui, le plateau refusait les gestes sans rien montrer, et le jeu
 * paraissait figé.
 *
 * Même anneau que l'écran de chargement (`ScreenLoading`). Il n'apparaît
 * qu'après `delayMs` (en CSS, sans minuterie) ; seules l'opacité et la
 * rotation bougent — composité, il ne coûte rien au plateau.
 */
export function MicroLoader({ active, label, delayMs = 220, placement = "floating" }: MicroLoaderProps) {
  if (!active) return null;
  return (
    <span
      className={styles.loader}
      data-placement={placement}
      role="status"
      aria-live="polite"
      style={{ "--micro-delay": `${delayMs}ms` } as CSSProperties}
    >
      <span className={styles.ring} aria-hidden />
      <span className={styles.label}>{label}</span>
    </span>
  );
}
