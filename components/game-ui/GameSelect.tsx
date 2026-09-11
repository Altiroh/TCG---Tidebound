"use client";

import { useEffect, useRef, useState } from "react";
import { BORDER_SUBTLE, RADIUS_SM, SHADOW_FLOATING, SURFACE_1, TEXT_PRIMARY, TRANSITION } from "@/components/game-ui/tokens";

export interface GameSelectOption<T extends string> {
  value: T;
  label: string;
  /** Regroupe visuellement les options sous un en-tête (ex: "Decks de base" / "Archétypes") — affiché dès que l'option précédente a un `group` différent. */
  group?: string;
}

interface GameSelectProps<T extends string> {
  value: T;
  options: GameSelectOption<T>[];
  onChange: (value: T) => void;
  className?: string;
}

/**
 * Menu déroulant custom — jamais un `<select>` natif du navigateur. Un
 * bouton compact affichant la valeur courante ; le menu s'ouvre en popover
 * flottant juste en-dessous, fermé au clic extérieur ou à Échap.
 */
export function GameSelect<T extends string>({ value, options, onChange, className = "" }: GameSelectProps<T>) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("mousedown", handleClick);
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("mousedown", handleClick);
      window.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-sm ${SURFACE_1} ${BORDER_SUBTLE} ${RADIUS_SM} ${TEXT_PRIMARY} ${TRANSITION} hover:border-[var(--accent)]/50`}
      >
        <span className="truncate">{current?.label ?? value}</span>
        <svg viewBox="0 0 24 24" fill="none" className={`h-3.5 w-3.5 shrink-0 text-[var(--text-secondary)] ${TRANSITION} ${open ? "rotate-180" : ""}`}>
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div
          className={`absolute right-0 top-full z-20 mt-1.5 min-w-full overflow-hidden bg-[var(--surface-glass)] backdrop-blur-xl ${BORDER_SUBTLE} ${RADIUS_SM} ${SHADOW_FLOATING} py-1`}
        >
          {options.map((opt, i) => (
            <div key={opt.value}>
              {opt.group && opt.group !== options[i - 1]?.group && (
                <div className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)] first:pt-1">
                  {opt.group}
                </div>
              )}
              <button
                type="button"
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
                className={`block w-full whitespace-nowrap px-3 py-1.5 text-left text-sm ${TRANSITION} ${
                  opt.value === value ? "text-[var(--accent-hover)]" : `${TEXT_PRIMARY} hover:bg-white/5`
                }`}
              >
                {opt.label}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
