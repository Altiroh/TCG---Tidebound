"use client";

import type { InputHTMLAttributes } from "react";
import { TEXT_PRIMARY, TRANSITION } from "@/components/game-ui/tokens";

/**
 * Champ texte générique — pas de boîte rectangulaire bordée façon
 * formulaire : un fond à peine plus clair que son entourage, un simple
 * soulignement laiton au focus plutôt qu'un `ring` complet.
 */
export function GameInput({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`w-full border-b border-white/10 bg-white/[0.03] px-3 py-2 text-sm ${TEXT_PRIMARY} placeholder:text-[var(--text-secondary)] outline-none ${TRANSITION} focus:border-[var(--accent)] focus:bg-white/[0.05] ${className}`}
      {...props}
    />
  );
}
