"use client";

import { useEffect, useRef, useState } from "react";
import styles from "@/features/collection/CollectionScreen.module.css";
import { SORT_OPTIONS, type SortMode } from "@/features/collection/cardFilters";
import { playButtonClick } from "@/lib/sound";

interface SortControlProps {
  value: SortMode;
  onChange: (value: SortMode) => void;
}

/** "SORT: NAME ▼" — ancré en haut à droite DU PANNEAU (cf. `.sortControl`), jamais de l'écran entier. */
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
    <div ref={rootRef} className={styles.sortControl}>
      <button
        type="button"
        className={styles.sortButton}
        onClick={() => {
          playButtonClick();
          setOpen((v) => !v);
        }}
      >
        Sort: {current?.label ?? value}
        <span aria-hidden style={{ transform: open ? "rotate(180deg)" : undefined, display: "inline-block" }}>
          ▾
        </span>
      </button>

      {open && (
        <div className={styles.sortMenu}>
          {SORT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={opt.value === value ? styles.sortOptionActive : styles.sortOption}
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
