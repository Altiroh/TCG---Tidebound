"use client";

import { useRef, useState } from "react";
import { BORDER_SUBTLE, RADIUS_SM, SURFACE_1, TEXT_PRIMARY, TRANSITION } from "@/components/game-ui/tokens";

interface SearchFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

/**
 * Recherche discrète : une icône seule au repos, qui s'étend en champ texte
 * au clic (ou si elle contient déjà une valeur) — jamais une barre béante en
 * permanence quand elle ne sert pas.
 */
export function SearchField({ value, onChange, placeholder = "Rechercher...", className = "" }: SearchFieldProps) {
  const [expanded, setExpanded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const open = expanded || value.length > 0;

  return (
    <div
      className={`flex items-center gap-2 overflow-hidden ${SURFACE_1} ${BORDER_SUBTLE} ${RADIUS_SM} ${TRANSITION} ${
        open ? "w-48 px-3 py-1.5" : "w-9 px-0 py-1.5 justify-center"
      } ${className}`}
    >
      <button
        type="button"
        onClick={() => {
          setExpanded(true);
          requestAnimationFrame(() => inputRef.current?.focus());
        }}
        aria-label="Rechercher"
        className="shrink-0 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
      >
        <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
          <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth={2} />
          <path d="M20 20l-3.2-3.2" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
        </svg>
      </button>
      {open && (
        <input
          ref={inputRef}
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => setExpanded(false)}
          placeholder={placeholder}
          className={`w-full bg-transparent text-sm ${TEXT_PRIMARY} placeholder:text-[var(--text-secondary)] outline-none`}
        />
      )}
    </div>
  );
}
