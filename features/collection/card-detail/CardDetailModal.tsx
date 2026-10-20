"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { buildCardDetailModel } from "@/features/collection/card-detail/cardDetailData";
import { CardDetailArtwork } from "@/features/collection/card-detail/CardDetailArtwork";
import { CardDetailArtworks, CardDetailDisplayChoice, CardDetailFinishes } from "@/features/collection/card-detail/CardDetailFinishes";
import type { CardArtwork } from "@/game/cosmetics/artworks";
import type { CardFinish } from "@/game/cosmetics/finishes";
import { CLASSIC_EDITION, editionKey, editionRank, isClassicEdition, type CardEdition, type OwnedEdition } from "@/game/cosmetics/editions";
import { CardDetailEffect } from "@/features/collection/card-detail/CardDetailEffect";
import { CardDetailHeader } from "@/features/collection/card-detail/CardDetailHeader";
import { CardDetailKeywords } from "@/features/collection/card-detail/CardDetailKeywords";
import { CardDetailMeta } from "@/features/collection/card-detail/CardDetailMeta";
import { CardDetailNavigation } from "@/features/collection/card-detail/CardDetailNavigation";
import { CardDetailResale } from "@/features/collection/card-detail/CardDetailResale";
import { CardDetailStats } from "@/features/collection/card-detail/CardDetailStats";
import { CardDetailQualifications } from "@/features/collection/card-detail/CardDetailQualifications";
import { effectLead, qualificationChips } from "@/features/match/qualificationDisplay";
import { CardShelfControls } from "@/features/collection/shelf/CardShelfControls";
import { CardDetailShowcase } from "@/features/collection/card-detail/CardDetailShowcase";
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
  /**
   * ÉDITIONS rares possédées de cette carte (Collection visuelle V2).
   * `undefined` : possession inconnue — illustrations et finitions restent
   * consultables en aperçu, sans choix d'affichage en partie.
   */
  ownedEditions?: readonly OwnedEdition[];
  /** Illustration de départ obtenue, quand l'écran le sait sans `ownedEditions` (contenu du booster). */
  artworkOwned?: boolean;
  /** Édition de l'exemplaire touché dans la grille : la fiche s'ouvre dessus. Absente : la plus rare possédée. */
  initialEdition?: CardEdition;
  /** Édition que le joueur montre aujourd'hui en partie. Absente : pas de choix d'affichage (hors Collection). */
  displayedEdition?: CardEdition;
  /**
   * Sections Illustrations, Finitions et « En partie » — réservées aux
   * Admins et au développement local (18/10/2026) : les joueurs voient
   * l'édition qu'ils ont touchée, sans en choisir d'autre.
   */
  showEditionControls?: boolean;
  /** « Ma vitrine » : exposer l'édition montrée (Collection du joueur connecté seulement). */
  showcase?: boolean;
}

/** La plus rare des éditions possédées, la Classique sinon. */
function rarestEdition(editions: readonly CardEdition[] | undefined): CardEdition {
  return (editions ?? []).reduce<CardEdition>((best, e) => (editionRank(e) > editionRank(best) ? e : best), CLASSIC_EDITION);
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
export function CardDetailModal({
  cardId,
  onClose,
  onPrevious,
  onNext,
  onShowCard,
  ownedCount,
  ownedEditions,
  artworkOwned,
  initialEdition,
  displayedEdition,
  showEditionControls = false,
  showcase = false,
}: CardDetailModalProps) {
  const model = buildCardDetailModel(cardId);
  // La fiche s'ouvre sur l'édition touchée, sinon la plus rare possédée ;
  // changer de carte y revient. Illustration et finition se choisissent
  // ensuite séparément, en aperçu.
  const depart = initialEdition ?? rarestEdition(ownedEditions);
  const [illustration, setIllustration] = useState<CardArtwork>(depart.artwork);
  const [finition, setFinition] = useState<CardFinish>(depart.finish);
  const editionsCle = (ownedEditions ?? []).map(editionKey).join(",");
  const initialeCle = initialEdition ? editionKey(initialEdition) : "";
  useEffect(() => {
    setIllustration(depart.artwork);
    setFinition(depart.finish);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `depart` se déduit de ces clés
  }, [cardId, editionsCle, initialeCle]);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  /** Élément à re-focaliser à la fermeture — typiquement la carte cliquée dans la grille. */
  const openerRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    const opener = openerRef.current;
    // Le focus revient à la carte, SANS anneau : sinon la carte cliquée
    // gardait un contour blanc après la fermeture. Au clavier, Tab le
    // rallume comme d'habitude.
    return () => opener?.focus({ preventScroll: true, focusVisible: false } as FocusOptions);
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
  const qualifications = qualificationChips(def);
  const ligne = effectLead(def.text, qualifications);

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

        <CardDetailArtwork
          cardId={cardId}
          finish={finition}
          artwork={illustration}
          artworkOwned={artworkOwned ?? Boolean(ownedEditions?.some((edition) => edition.artwork === illustration))}
        />

        <div className={styles.info}>
          <CardDetailHeader model={model} titleId={titleId} />
          {/* Favori et carnets — seulement dans un écran qui fournit l'étagère (Collection, Éditeur de deck). */}
          <CardShelfControls cardId={cardId} />
          <CardDetailStats stats={stats} />
          {(ligne.lead || ligne.text) && <CardDetailEffect text={ligne.text} lead={ligne.lead} />}
          {qualifications.length > 0 && <CardDetailQualifications chips={qualifications} />}
          {keywords.length > 0 && <CardDetailKeywords keywords={keywords} />}
          <CardDetailMeta model={model} onShowCounterpart={onShowCard} />
          {showEditionControls && (
            <>
          <CardDetailArtworks cardId={cardId} shown={illustration} owned={ownedEditions} onShow={setIllustration} />
          <CardDetailFinishes shown={finition} owned={ownedEditions?.filter((e) => e.artwork === illustration).map((e) => e.finish)} onShow={setFinition} />
            </>
          )}
          {showEditionControls && displayedEdition && ownedEditions && (
            <CardDetailDisplayChoice
              cardId={cardId}
              shown={{ artwork: illustration, finish: finition }}
              owned={ownedEditions}
              displayed={displayedEdition}
            />
          )}
          {showcase && ownedCount !== undefined && (
            <CardDetailShowcase
              key={`vitrine:${cardId}:${illustration}/${finition}`}
              cardId={cardId}
              edition={{ artwork: illustration, finish: finition }}
              owned={
                isClassicEdition({ artwork: illustration, finish: finition })
                  ? ownedCount
                  : ((ownedEditions ?? []).find((e) => e.artwork === illustration && e.finish === finition)?.quantity ?? 0)
              }
            />
          )}
          {ownedCount !== undefined && (
            // La revente porte sur l'ÉDITION montrée : ses exemplaires à elle,
            // et la Classique sans ceux d'une édition rare.
            <CardDetailResale
              // Changer d'édition remet la quantité et la confirmation à zéro.
              key={`${cardId}:${illustration}/${finition}`}
              cardId={cardId}
              edition={{ artwork: illustration, finish: finition }}
              owned={
                isClassicEdition({ artwork: illustration, finish: finition })
                  ? ownedCount - (ownedEditions ?? []).reduce((sum, e) => sum + e.quantity, 0)
                  : ((ownedEditions ?? []).find((e) => e.artwork === illustration && e.finish === finition)?.quantity ?? 0)
              }
            />
          )}
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
