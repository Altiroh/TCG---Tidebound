"use client";

import type { ReactNode } from "react";
import styles from "@/features/match/table/Table.module.css";

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
  /** Le public en direct (`LiveAudience`), à gauche du bouton Menu. */
  audience?: ReactNode;
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
export function TableHud({ turn, turnOwner, viewerTurn, journal, phaseButton, onMenu, audience }: PreviewHudProps) {
  return (
    <>
      <div className={styles.hudCornerTop}>
        {audience}
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
  /** Ce que le bouton FAIT (« Combat », « Fin de tour »). */
  label: string;
  /** Phase en COURS, telle qu'on la nomme — l'infobulle la rappelle. */
  phaseLabel?: string;
  icon: string;
  disabled?: boolean;
  onClick?: () => void;
}

/**
 * Bouton de phase de la colonne : cadre laiton + icône, comme
 * `PhaseActionButton`, dimensionné par la colonne.
 *
 * Au survol, une infobulle DANS LE TON DE L'INTERFACE — laiton sur bleu de
 * nuit, pas l'infobulle grise du navigateur — qui dit deux choses que
 * l'icône seule ne dit pas : la phase où l'on est, et ce que le bouton fera.
 * Une icône d'épée ne distingue pas « passer au combat » de « on y est
 * déjà ». D'où l'absence de `title` : il aurait doublé l'infobulle d'une
 * seconde, native et hors charte.
 */
export function PhaseButton({ label, phaseLabel, icon, disabled = false, onClick }: PhaseButtonProps) {
  return (
    <span className={styles.phaseWrap}>
      <button
        type="button"
        className={styles.phaseButton}
        onClick={onClick}
        disabled={disabled}
        aria-label={phaseLabel ? `${label} — ${phaseLabel}` : label}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- bouton composite décoratif */}
        <img src="/assets/board/phase-buttons/frame.webp" alt="" aria-hidden draggable={false} className={styles.fill} />
        {/* eslint-disable-next-line @next/next/no-img-element -- idem */}
        <img src={icon} alt="" aria-hidden draggable={false} className={styles.phaseIcon} />
      </button>

      {/* `aria-hidden` : le bouton porte déjà les deux informations dans son
          `aria-label`, un lecteur d'écran les entendrait deux fois. */}
      <span className={styles.phaseTip} aria-hidden>
        {phaseLabel && <span className={styles.phaseTipPhase}>{phaseLabel}</span>}
        <span className={styles.phaseTipAction}>{label}</span>
      </span>
    </span>
  );
}
