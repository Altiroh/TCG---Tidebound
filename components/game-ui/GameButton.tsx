"use client";

import type { ButtonHTMLAttributes, MouseEvent } from "react";
import { BORDER_SUBTLE, RADIUS_SM, TEXT_PRIMARY, TRANSITION } from "@/components/game-ui/tokens";
import { playButtonClick } from "@/lib/sound";

type Variant = "primary" | "secondary" | "ghost" | "danger";

interface GameButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

const VARIANT_CLASSES: Record<Variant, string> = {
  // Action principale d'un écran (une seule par écran, en général) : fond
  // laiton désaturé plein, jamais un bleu SaaS.
  primary: "bg-[var(--accent)] text-[#1a1410] hover:bg-[var(--accent-hover)]",
  // Action secondaire : surface discrète, texte ivoire, pas de bloc plein.
  secondary: `bg-[var(--surface-1)] ${TEXT_PRIMARY} ${BORDER_SUBTLE} hover:border-[var(--accent)]/50`,
  // Action tertiaire/peu fréquente : quasi invisible tant qu'on ne survole pas.
  ghost: `bg-transparent text-[var(--text-secondary)] hover:${TEXT_PRIMARY} hover:bg-white/5`,
  danger: "bg-[var(--danger)]/90 text-[#1a1410] hover:bg-[var(--danger)]",
};

/**
 * Bouton d'action générique de la refonte — remplace les `<button
 * className="rounded-md bg-board-accent ...">` ad hoc semés dans les
 * écrans hors-plateau. Compact, sans grand rectangle, feedback de clic
 * immédiat (`active:scale-95`).
 */
export function GameButton({ variant = "secondary", className = "", disabled, onClick, ...props }: GameButtonProps) {
  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    playButtonClick();
    onClick?.(event);
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={handleClick}
      className={`inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-medium ${RADIUS_SM} ${TRANSITION} active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100 ${VARIANT_CLASSES[variant]} ${className}`}
      {...props}
    />
  );
}
