"use client";

import { useCallback, useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { buildCardDetailModel } from "@/features/collection/card-detail/cardDetailData";
import { CardDetailArtwork } from "@/features/collection/card-detail/CardDetailArtwork";
import { CardDetailEffect } from "@/features/collection/card-detail/CardDetailEffect";
import { CardDetailHeader } from "@/features/collection/card-detail/CardDetailHeader";
import { CardDetailKeywords } from "@/features/collection/card-detail/CardDetailKeywords";
import { CardDetailMeta } from "@/features/collection/card-detail/CardDetailMeta";
import { CardDetailNavigation } from "@/features/collection/card-detail/CardDetailNavigation";
import { CardDetailResale } from "@/features/collection/card-detail/CardDetailResale";
import { CardDetailStats } from "@/features/collection/card-detail/CardDetailStats";
import styles from "@/features/collection/card-detail/CardDetail.module.css";

interface CardDetailModalProps {
  cardId: string;
  onClose: () => void;
  /** Absents s'il n'y a qu'une carte dans la sélection courante : ni flèches, ni raccourcis. */
  onPrevious?: () => void;
  onNext?: () => void;
  /** Saut direct vers une autre carte (contrepartie Standard/Abyssale). */
  onShowCard?: (cardId: string) => void;
  /**
   * Exemplaires possédés de CETTE carte. `undefined` là où la possession
   * n'a pas de sens (éditeur de deck hors connexion, fiche ouverte depuis
   * une liste d'emprunt) : la revente n'apparaît alors pas du tout, plutôt
   * que d'afficher « 0 possédée » à quelqu'un qui n'a pas de collection.
   */
  ownedCount?: number;
}

/**
 * Fiche détaillée d'une carte de la Collection.
 *
 * À ne pas confondre avec `features/match/CardDetailModal.tsx`, qui inspecte
 * une carte EN JEU (dégâts, modificateurs, équipements attachés, Marée
 * courante) : celle-ci inspecte une DÉFINITION de catalogue et n'a donc
 * jamais d'état de partie à montrer.
 *
 * Composition : la carte à gauche est la pièce maîtresse, le panneau de
 * droite l'accompagne. Toute la mise en page vit dans
 * `CardDetail.module.css` ; ce composant ne fait qu'assembler les sections
 * et tenir le comportement modal (fermeture, navigation, focus, défilement).
 */
export function CardDetailModal({ cardId, onClose, onPrevious, onNext, onShowCard, ownedCount }: CardDetailModalProps) {
  const model = buildCardDetailModel(cardId);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  /** Élément à re-focaliser à la fermeture — typiquement la carte cliquée dans la grille. */
  const openerRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    const opener = openerRef.current;
    return () => opener?.focus();
  }, []);

  // Verrouille le défilement de l'arrière-plan. La grille de la Collection
  // est déjà couverte par la superposition, mais le verrou couvre aussi le
  // document lui-même (petits écrans, navigateurs mobiles).
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key === "ArrowLeft") onPrevious?.();
      if (event.key === "ArrowRight") onNext?.();
      if (event.key !== "Tab") return;

      // Piège à focus : la tabulation ne doit jamais ramener sur la grille
      // qui vit derrière la fiche.
      //
      // Le filtre sur les éléments RÉELLEMENT focalisables n'est pas
      // cosmétique : `CardTile` rend un `<button disabled>` quand il n'a pas
      // de `onClick` (cas de cette fiche, où la carte n'est pas cliquable).
      // Compté comme dernier focalisable, il faisait sortir la tabulation de
      // la fiche — le navigateur, lui, le saute.
      const candidates = panelRef.current?.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (!candidates) return;
      const focusables = [...candidates].filter(
        (el) => !el.hasAttribute("disabled") && el.offsetParent !== null
      );
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (!first || !last) return;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [onClose, onPrevious, onNext]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const { def, isAbyssal, stats, keywords } = model;

  const fiche = (
    <div
      className={styles.backdrop}
      data-variant={isAbyssal ? "abyssal" : "standard"}
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={panelRef}
        className={styles.panel}
        data-variant={isAbyssal ? "abyssal" : "standard"}
        // Le clic sur la fiche elle-même ne doit pas la refermer.
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Fermer la fiche"
          className={`${styles.control} ${styles.close}`}
        >
          <svg viewBox="0 0 24 24" fill="none" className={styles.controlIcon} aria-hidden>
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" />
          </svg>
        </button>

        {onPrevious && onNext && <CardDetailNavigation onPrevious={onPrevious} onNext={onNext} />}

        <CardDetailArtwork cardId={cardId} />

        <div className={styles.info}>
          <CardDetailHeader model={model} titleId={titleId} />
          <CardDetailStats stats={stats} />
          {def.text && <CardDetailEffect text={def.text} />}
          {keywords.length > 0 && <CardDetailKeywords keywords={keywords} />}
          <CardDetailMeta model={model} onShowCounterpart={onShowCard} />
          {ownedCount !== undefined && <CardDetailResale cardId={cardId} owned={ownedCount} />}
        </div>
      </div>
    </div>
  );

  /*
   * Rendue DANS LE CORPS DU DOCUMENT, jamais là où on l'ouvre.
   *
   * Le voile est en `position: fixed`, ce qui suppose que son repère soit
   * la fenêtre. Il cesse de l'être dès qu'un ancêtre porte une
   * transformation — et `Dialog` en porte une en permanence (son animation
   * d'entrée est en `animation-fill-mode: both`, la dernière image reste
   * appliquée), en plus d'un `overflow: hidden`. Ouverte depuis une boîte
   * de dialogue — le récapitulatif d'un lot de boosters, la fiche
   * « Contenu » d'un sachet — la carte se retrouvait donc enfermée dans le
   * cadre de cette boîte : centrée sur elle et non sur l'écran, et son
   * panneau de droite coupé net au bord.
   *
   * Le portail la replace au niveau du `body`, où son `fixed` retrouve son
   * sens. Rien ne change là où elle s'ouvrait déjà d'un écran (Collection,
   * Éditeur de deck) : elle y était déjà libre.
   */
  return typeof document === "undefined" ? fiche : createPortal(fiche, document.body);
}
