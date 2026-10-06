"use client";

import type { ReactNode } from "react";
import styles from "@/features/match/CarouselPromptFrame.module.css";

interface CarouselPromptFrameProps {
  ariaLabel: string;
  /** Petites capitales au-dessus du titre : la carte d'où vient la question. */
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  /** Le `CardCarousel` — seule zone qui rétrécit (et défile au pire). */
  children: ReactNode;
  /** Compteur ou sélection, à gauche du pied. */
  status: ReactNode;
  /** Boutons du pied : toujours visibles, jamais dans la zone qui rétrécit. */
  actions: ReactNode;
  /** Clic sur le fond (à côté du panneau) — absent : le fond ne ferme rien. */
  onBackdropClick?: () => void;
  /** Reflet blanc en haut du panneau (toutes sauf l'Assemblage, qui n'en a jamais eu). */
  gloss?: boolean;
}

/**
 * Cadre commun des invites à carrousel (`DeckLookPrompt`,
 * `HandDiscardPrompt`, `GraveyardPickPrompt`, `AssemblagePrompt`) ; les
 * désignations d'unités se font, elles, sur le plateau (`useBoardPick`,
 * 05/10/2026) : en-tête, rangée de grandes
 * cartes, pied de validation. Même rendu qu'avant sur un écran de bureau ;
 * sur un téléphone couché, le pied reste visible quoi qu'il arrive — cf.
 * `CarouselPromptFrame.module.css`.
 */
export function CarouselPromptFrame({
  ariaLabel,
  eyebrow,
  title,
  description,
  children,
  status,
  actions,
  onBackdropClick,
  gloss = true,
}: CarouselPromptFrameProps) {
  return (
    <div
      className={`fixed inset-0 z-[85] flex items-center justify-center bg-black/70 backdrop-blur-md ${styles.overlay}`}
      onClick={onBackdropClick}
    >
      <div
        role="dialog"
        aria-label={ariaLabel}
        onClick={onBackdropClick ? (event) => event.stopPropagation() : undefined}
        className={`relative flex w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-white/15 bg-white/[0.06] shadow-[0_8px_40px_rgba(0,0,0,0.6)] backdrop-blur-2xl ${styles.panel}`}
      >
        {gloss && <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-white/20 to-transparent" />}
        <div className={styles.head}>
          {eyebrow && <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{eyebrow}</p>}
          <h2 className={`font-semibold text-white [font-family:var(--font-card-title)] ${styles.title}`}>{title}</h2>
          {description && <p className={`text-slate-300 ${styles.description}`}>{description}</p>}
        </div>

        <div className={styles.carousel}>{children}</div>

        <div className={styles.foot}>
          <span className={`text-sm text-slate-400 ${styles.status}`}>{status}</span>
          {actions}
        </div>
      </div>
    </div>
  );
}
