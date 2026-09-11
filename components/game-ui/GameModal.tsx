"use client";

import type { ReactNode } from "react";
import { RADIUS_MD, SHADOW_FLOATING, TEXT_PRIMARY } from "@/components/game-ui/tokens";

interface GameModalProps {
  children: ReactNode;
  onClose?: () => void;
  className?: string;
}

/**
 * Superposition modale générique — remplace les `bg-black/70 backdrop-blur-md`
 * + `rounded-2xl border border-white/15 bg-white/[0.07]` semés ad hoc.
 * Un seul point de vérité pour "à quoi ressemble une fenêtre flottante"
 * dans toute l'appli hors-plateau.
 */
export function GameModal({ children, onClose, className = "" }: GameModalProps) {
  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`bg-[var(--surface-glass)] backdrop-blur-2xl ${RADIUS_MD} ${SHADOW_FLOATING} ${TEXT_PRIMARY} p-6 ${className}`}
      >
        {children}
      </div>
    </div>
  );
}
