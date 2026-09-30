"use client";

import type { ReactNode } from "react";
import { playButtonClick } from "@/lib/sound";

/**
 * Coquille commune des invites de partie — le « verre liquide » recentré à
 * l'écran, validé en test sur le choix de réaction (Il Dottore) et porté
 * depuis sur les autres demandes : choix d'option d'une capacité
 * (`PendingChoicePrompt`) et activation d'un effet de bris
 * (`ObjectBreakPrompt`).
 *
 * Trois invites qui posent la même sorte de question doivent se ressembler :
 * le joueur reconnaît « on me demande une décision » avant même de lire.
 *
 * `dim` assombrit le plateau derrière : réservé aux demandes qui
 * interrompent vraiment (le Bris, ouvert par un geste du joueur). Une
 * fenêtre de réaction, elle, laisse voir la partie — c'est en la regardant
 * qu'on décide.
 */
interface PromptShellProps {
  ariaLabel: string;
  children: ReactNode;
  /** Bouton de fermeture en haut à droite (absent : la décision est obligatoire). */
  onClose?: () => void;
  closeLabel?: string;
  /** Largeur du panneau : `narrow` pour une question, `wide` quand une carte est montrée à côté du texte. */
  width?: "narrow" | "wide";
  /** Assombrit et floute le fond, et ferme au clic à côté (si `onClose`). */
  dim?: boolean;
}

const GLASS_SHADOW =
  "inset 0 1px 1px rgba(255,255,255,0.5), inset 0 0 0 1px rgba(255,255,255,0.08), inset 0 -12px 24px -12px rgba(255,255,255,0.06), 0 24px 60px rgba(0,0,0,0.6)";

export function PromptShell({ ariaLabel, children, onClose, closeLabel = "Fermer", width = "narrow", dim = false }: PromptShellProps) {
  return (
    <div
      className={`fixed inset-0 z-[85] flex items-center justify-center ${
        dim ? "bg-black/65 backdrop-blur-md" : "pointer-events-none"
      }`}
      style={{
        padding:
          "calc(1rem + var(--tb-safe-top)) calc(1rem + var(--tb-safe-right)) calc(1rem + var(--tb-safe-bottom)) calc(1rem + var(--tb-safe-left))",
      }}
      onClick={dim && onClose ? onClose : undefined}
    >
      <div
        role="dialog"
        aria-label={ariaLabel}
        onClick={(event) => event.stopPropagation()}
        className={`pointer-events-auto relative flex max-h-full w-full flex-col ${
          width === "wide" ? "max-w-xl" : "max-w-sm"
        } overflow-hidden rounded-3xl bg-white/6 p-6 text-center backdrop-blur-[32px] backdrop-brightness-110 backdrop-saturate-150 [@media(max-height:520px)]:p-4`}
        style={{ boxShadow: GLASS_SHADOW }}
      >
        {/* Léger reflet en haut à gauche — le grain "verre liquide" (courbure
            qui capte la lumière), pas un aplat qui masquerait le flou du fond. */}
        <div className="pointer-events-none absolute -left-6 -top-10 h-32 w-32 rounded-full bg-white/25 blur-2xl" aria-hidden />

        {/* Croix de 28 px à l'écran, 44 px sous le doigt : un `::before` invisible déborde de 8 px. */}
        {onClose && (
          <button
            type="button"
            onClick={() => {
              playButtonClick();
              onClose();
            }}
            aria-label={closeLabel}
            className="absolute right-3 top-3 z-10 flex h-7 w-7 items-center justify-center rounded-full text-white/60 outline-none transition-colors before:absolute before:-inset-2 before:content-[''] hover:bg-white/15 hover:text-white focus-visible:ring-2 focus-visible:ring-white/40"
          >
            <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
            </svg>
          </button>
        )}

        {/* Seule zone qui défile quand la hauteur manque (téléphone couché) ;
            la croix reste posée sur le panneau, et `PromptActions` colle au
            bas de cette zone — les boutons ne sortent jamais de l'écran. */}
        <div className="relative min-h-0 overflow-y-auto overscroll-contain">{children}</div>
      </div>
    </div>
  );
}

/** Intitulé au-dessus de la question, en petites capitales — nomme la carte ou le geste. */
export function PromptEyebrow({ children }: { children: ReactNode }) {
  return <p className="text-[11px] font-semibold uppercase tracking-wider text-white/50">{children}</p>;
}

/** Ce que l'effet fait : lu avant la question, c'est ce qui décide. */
export function PromptEffect({ children }: { children: ReactNode }) {
  return <p className="text-sm font-semibold leading-snug text-white">{children}</p>;
}

/** La question, ou une précision sous l'effet. */
export function PromptQuestion({ children }: { children: ReactNode }) {
  return <p className="text-xs leading-snug text-white/60">{children}</p>;
}

type PromptButtonTone = "accept" | "neutral" | "danger";

const TONES: Record<PromptButtonTone, string> = {
  accept: "bg-emerald-400 text-emerald-950 hover:bg-emerald-300 focus-visible:ring-emerald-200",
  neutral: "bg-white/10 text-white hover:bg-white/20 focus-visible:ring-white/40",
  danger: "bg-rose-500/80 text-white hover:bg-rose-400 focus-visible:ring-rose-200",
};

/** Bouton d'invite : pastille pleine, même gabarit partout. */
export function PromptButton({
  tone = "neutral",
  onClick,
  disabled,
  children,
}: {
  tone?: PromptButtonTone;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => {
        playButtonClick();
        onClick();
      }}
      className={`rounded-full px-7 py-2 text-sm font-semibold outline-none transition-colors focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-40 [@media(max-height:520px)]:min-h-11 [@media(pointer:coarse)]:min-h-11 ${TONES[tone]}`}
    >
      {children}
    </button>
  );
}

/**
 * Rangée de boutons, centrée : action engageante en premier à gauche, refus à droite (comme le choix de réaction).
 *
 * Collée au bas de la zone défilante de `PromptShell` : quand le texte
 * dépasse, il passe SOUS les boutons au lieu de les pousser hors de
 * l'écran. Sur un bureau, rien ne dépasse et `sticky` ne fait rien ; le
 * voile sombre qui sépare le texte des boutons n'est posé qu'en paysage bas.
 */
export function PromptActions({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-0 z-10 mt-1 flex flex-wrap items-center justify-center gap-3 [@media(max-height:520px)]:gap-2 [@media(max-height:520px)]:self-stretch [@media(max-height:520px)]:bg-[linear-gradient(to_top,rgba(6,12,22,0.92)_65%,transparent)] [@media(max-height:520px)]:pb-1 [@media(max-height:520px)]:pt-3">
      {children}
    </div>
  );
}
