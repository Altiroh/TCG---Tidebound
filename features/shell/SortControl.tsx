"use client";

import { useEffect, useRef, useState } from "react";
import styles from "@/features/shell/ScreenShell.module.css";
import { SORT_OPTIONS, type SortMode } from "@/features/collection/cardFilters";
import { playButtonClick } from "@/lib/sound";

interface SortControlProps {
  value: SortMode;
  onChange: (value: SortMode) => void;
}

/**
 * « Trier : Nom ⌄ » — du texte posé directement sur le papier (précédé d'un
 * court filet de laiton), et non une plaque beige à contour et à capitales.
 * Ancré en haut à droite de la SURFACE qui le contient (cf. `.inkControl`),
 * jamais de l'écran entier : la Collection l'ancre sur toute la largeur,
 * l'éditeur de deck sur sa seule colonne de gauche.
 */
export function SortControl({ value, onChange }: SortControlProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const current = SORT_OPTIONS.find((o) => o.value === value);

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
    <div ref={rootRef} className={styles.inkControl}>
      <span className={styles.inkRule} aria-hidden />

      <button
        type="button"
        className={styles.inkButton}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => {
          playButtonClick();
          setOpen((v) => !v);
        }}
      >
        Trier&nbsp;: <span className={styles.inkValue}>{current?.label ?? value}</span>
        <span className={open ? styles.inkCaretOpen : styles.inkCaret} aria-hidden>
          ⌄
        </span>
      </button>

      {open && (
        <div className={styles.inkMenu} role="listbox">
          {SORT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              role="option"
              aria-selected={opt.value === value}
              className={opt.value === value ? styles.inkOptionActive : styles.inkOption}
              onClick={() => {
                playButtonClick();
                onChange(opt.value);
                setOpen(false);
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
