"use client";

import type { ReactNode } from "react";
import styles from "@/features/board-preview/BoardPreview.module.css";

interface PreviewHudProps {
  turn: number;
  /** À qui de jouer, affiché discrètement sous le numéro de tour (« À vous », « Au bot »…). */
  turnOwner: string;
  /** Le tour est-il au joueur qui regarde ? (teinte de la ligne ci-dessus) */
  viewerTurn: boolean;
  /** Contenu du journal (liste compacte, miniatures…), posé sur le feutre de la colonne. */
  journal: ReactNode;
  /** Bouton de phase complet (cf. `PhaseButton`). */
  phaseButton: ReactNode;
  /** Ouvre le menu de pause. */
  onMenu: () => void;
}

/**
 * Colonne de droite, sur toute la hauteur des deux rangées de plateau
 * (emplacement du cadre boussole de l'ancien board) :
 *   Tour N
 *   à qui de jouer
 *   Journal d'actions (élastique)
 *   Bouton de phase (rond)
 *
 * Le bouton Menu est posé au-dessus de la colonne, dans le coin haut droit
 * laissé libre par la main adverse.
 */
export function PreviewHud({ turn, turnOwner, viewerTurn, journal, phaseButton, onMenu }: PreviewHudProps) {
  return (
    <>
      <div className={styles.hudCornerTop}>
        <button type="button" className={styles.hudButton} onClick={onMenu} aria-label="Menu" title="Menu">
          {/* eslint-disable-next-line @next/next/no-img-element -- cadre décoratif, même asset que le bouton de phase */}
          <img src="/assets/board/phase-buttons/frame.webp" alt="" aria-hidden draggable={false} className={styles.fill} />
          <span className={styles.menuGlyph} aria-hidden>
            <span />
            <span />
            <span />
          </span>
        </button>
      </div>

      <aside className={styles.rail} data-zone="SideRail" aria-label="Tour et journal">
        <div className={styles.railTurn}>Tour {turn}</div>
        <div className={`${styles.railTurnOwner} ${viewerTurn ? styles.railTurnOwnerViewer : ""}`} aria-live="polite">
          {turnOwner}
        </div>
        <div className={styles.journal}>{journal}</div>
        {phaseButton}
      </aside>
    </>
  );
}

interface PhaseButtonProps {
  label: string;
  icon: string;
  disabled?: boolean;
  onClick?: () => void;
}

/** Bouton de phase de la colonne : cadre laiton + icône, comme `PhaseActionButton`, dimensionné par la colonne. */
export function PhaseButton({ label, icon, disabled = false, onClick }: PhaseButtonProps) {
  return (
    <button
      type="button"
      className={styles.phaseButton}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- bouton composite décoratif */}
      <img src="/assets/board/phase-buttons/frame.webp" alt="" aria-hidden draggable={false} className={styles.fill} />
      {/* eslint-disable-next-line @next/next/no-img-element -- idem */}
      <img src={icon} alt="" aria-hidden draggable={false} className={styles.phaseIcon} />
    </button>
  );
}
