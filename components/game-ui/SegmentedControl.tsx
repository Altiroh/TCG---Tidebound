"use client";

import { TRANSITION } from "@/components/game-ui/tokens";
import { playButtonClick } from "@/lib/sound";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

interface SegmentedControlProps<T extends string> {
  value: T;
  options: SegmentedOption<T>[];
  onChange: (value: T) => void;
  className?: string;
}

/**
 * Bascule entre 2-3 vues (ex: "Collection / Decks") — un soulignement sur
 * l'onglet actif, jamais des onglets pleins qui se disputent l'attention
 * avec le contenu en-dessous.
 */
export function SegmentedControl<T extends string>({ value, options, onChange, className = "" }: SegmentedControlProps<T>) {
  return (
    <div className={`flex items-center gap-4 text-sm ${className}`}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => {
            playButtonClick();
            onChange(opt.value);
          }}
          className={`relative pb-1 font-medium ${TRANSITION} ${
            opt.value === value ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          }`}
        >
          {opt.label}
          <span
            className={`absolute inset-x-0 -bottom-0.5 h-px bg-[var(--accent)] ${TRANSITION} ${
              opt.value === value ? "opacity-100" : "opacity-0"
            }`}
          />
        </button>
      ))}
    </div>
  );
}
