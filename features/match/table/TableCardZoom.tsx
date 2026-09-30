"use client";

import { useEffect, useRef, type ReactNode } from "react";
import styles from "@/features/match/table/Table.module.css";

/** Une action proposée à côté de la carte agrandie. */
export interface ZoomAction {
  label: string;
  /** Absent : action grisée (`disabled`), montrée pour son motif. */
  onAction?: () => void;
  /** `primary` : engage la partie (Jouer) ; `danger` : perd la carte (Saborder) ; `neutral` : le reste. */
  tone?: "primary" | "danger" | "neutral";
  /** Grisée, avec son motif dans `note` : on montre ce qui empêche, plutôt que de cacher le bouton. */
  disabled?: boolean;
  /** Une ligne sous le bouton : le motif d'un refus, ou ce que coûtera le geste. */
  note?: string;
  /** Avertissement (Déraison) : la note passe au rouge. */
  warn?: boolean;
}

interface TableCardZoomProps {
  /** La carte, rendue par le plateau lui-même (`renderFace`) — jamais une seconde définition. */
  children: ReactNode;
  /** Ouvre la fiche détaillée (dégâts, modificateurs, Équipements) depuis l'agrandissement. Absent : pas de bouton. */
  onDetail?: () => void;
  onClose: () => void;
  /**
   * Ce que le joueur peut faire de cette carte MAINTENANT — Jouer,
   * Défausser, Activer, Briser, Saborder… Au doigt, toucher une carte la
   * MONTRE ; c'est ici qu'on agit, d'un bouton, jamais d'un toucher pour lire.
   */
  actions?: ZoomAction[];
  /** Ce que disent ses badges de statut, en toutes lettres (`cardStatusLegend`). */
  legend?: Array<{ label: string; description: string }>;
  /**
   * Parcours de la main : balayer (ou les flèches) passe à la carte voisine.
   * `position` : « 2 / 5 ».
   */
  onPrev?: () => void;
  onNext?: () => void;
  position?: { index: number; count: number };
}

/** Distance (px) d'un balayage horizontal qui change de carte au lieu de refermer. */
const SWIPE_PX = 48;
/** En deçà, un appui relâché vaut un toucher : il referme. */
const TAP_PX = 12;

/**
 * LA CARTE, EN GRAND, PAR-DESSUS LE PLATEAU — et, au doigt, le CENTRE DES
 * ACTIONS sur cette carte.
 *
 * Sur un téléphone couché, une carte de plateau fait ~50 px de large :
 * son texte de règles y est une ligne de fourmis. Un toucher la pose donc
 * ici, à pleine hauteur d'écran, avec à côté d'elle ce qu'on peut en faire
 * et ce que disent ses statuts. La FICHE détaillée
 * (`features/match/CardDetailModal`), qui déplie l'état vivant de la
 * carte, reste à un bouton d'ici.
 *
 * Jumelle de `features/board-preview/CardZoom` — même calque, mêmes
 * classes — à ceci près qu'elle ne connaît pas la carte : le plateau la
 * lui passe déjà rendue, avec sa Marée, ses dégâts et ses auras.
 *
 * Se ferme au RELÂCHÉ d'un appui commencé SUR le calque : le relâché du
 * doigt qui vient de l'ouvrir (appui long) ne doit pas la refermer
 * aussitôt, et un balayage change de carte au lieu de refermer.
 */
export function TableCardZoom({ children, onDetail, onClose, actions = [], legend = [], onPrev, onNext, position }: TableCardZoomProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const press = useRef<{ x: number; y: number } | null>(null);
  const handlers = useRef({ onClose, onPrev, onNext });
  handlers.current = { onClose, onPrev, onNext };

  // En CAPTURE, et Échap s'arrête ici : sans quoi il refermait la carte
  // ET ouvrait le menu de pause, qui écoute la même touche sur `window`.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        handlers.current.onClose();
      } else if (event.key === "ArrowLeft") handlers.current.onPrev?.();
      else if (event.key === "ArrowRight") handlers.current.onNext?.();
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  // Le focus entre dans le calque (première action, sinon la fiche) et
  // revient à son point de départ à la fermeture : au clavier comme au
  // lecteur d'écran, le dialogue est l'endroit où l'on est.
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus({ preventScroll: true });
    return () => previous?.focus({ preventScroll: true });
  }, []);

  const stop = (event: React.PointerEvent) => event.stopPropagation();

  return (
    <div
      ref={dialogRef}
      className={styles.cardZoom}
      // Lu par le guide du tutoriel, qui s'efface tant que la carte est en grand.
      data-card-zoom=""
      role="dialog"
      aria-modal
      aria-label="Carte agrandie"
      onPointerDown={(event) => {
        event.stopPropagation();
        press.current = { x: event.clientX, y: event.clientY };
      }}
      onPointerUp={(event) => {
        const start = press.current;
        press.current = null;
        if (!start) return;
        const dx = event.clientX - start.x;
        const dy = event.clientY - start.y;
        if (Math.abs(dx) >= SWIPE_PX && Math.abs(dx) > Math.abs(dy)) {
          // Balayer vers la gauche fait venir la carte de DROITE, comme on tourne une page.
          if (dx < 0) onNext?.();
          else onPrev?.();
          return;
        }
        if (Math.hypot(dx, dy) <= TAP_PX) onClose();
      }}
      onPointerCancel={() => {
        press.current = null;
      }}
      onContextMenu={(event) => event.preventDefault()}
    >
      <div className={styles.cardZoomCard}>{children}</div>

      {/* Les seuls contrôles du calque : tout le reste referme. */}
      <div className={styles.cardZoomSide} onPointerDown={stop} onPointerUp={stop}>
        {actions.map((action) => (
          <div key={action.label} className={styles.cardZoomActionItem}>
            <button
              type="button"
              className={styles.cardZoomPlay}
              data-tone={action.tone ?? "primary"}
              disabled={action.disabled}
              onClick={(event) => {
                event.stopPropagation();
                action.onAction?.();
              }}
            >
              {action.label}
            </button>
            {action.note && (
              <span className={styles.cardZoomNote} data-warn={action.warn ? "" : undefined}>
                {action.note}
              </span>
            )}
          </div>
        ))}

        {legend.length > 0 && (
          <dl className={styles.cardZoomLegend}>
            {legend.map((item) => (
              <div key={item.label}>
                <dt>{item.label}</dt>
                <dd>{item.description}</dd>
              </div>
            ))}
          </dl>
        )}

        <div className={styles.cardZoomFooter}>
          {position && position.count > 1 && (
            <div className={styles.cardZoomNav}>
              <button type="button" className={styles.cardZoomArrow} aria-label="Carte précédente" disabled={!onPrev} onClick={onPrev}>
                ‹
              </button>
              <span aria-live="polite">
                {position.index + 1} / {position.count}
              </span>
              <button type="button" className={styles.cardZoomArrow} aria-label="Carte suivante" disabled={!onNext} onClick={onNext}>
                ›
              </button>
            </div>
          )}
          {onDetail && (
            <button type="button" className={styles.cardZoomDetail} onClick={onDetail}>
              Fiche détaillée
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
