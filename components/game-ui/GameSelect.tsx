"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import styles from "@/components/game-ui/GameUi.module.css";
import { playButtonClick } from "@/lib/sound";

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
  disabled?: boolean;
  /** Libellé pour lecteur d'écran quand le contexte visuel ne le donne pas. */
  "aria-label"?: string;
}

/**
 * Menu déroulant custom — jamais un `<select>` natif du navigateur. Un
 * bouton compact affichant la valeur courante ; le menu s'ouvre en popover
 * flottant juste en-dessous, fermé au clic extérieur ou à Échap.
 *
 * Même feuille que les menus contextuels du design system
 * (`GameUi.module.css`, tokens `--tb-*`) : le tri de la Collection et le
 * menu « plus » de l'éditeur de deck sont le même objet.
 */
/** Marge conservée entre le menu ouvert et le bord de la fenêtre, pour qu'il ne colle jamais au ras. */
const VIEWPORT_MARGIN = 12;

export function GameSelect<T extends string>({ value, options, onChange, className = "", disabled = false, "aria-label": ariaLabel }: GameSelectProps<T>) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  /**
   * Placement calculé à l'OUVERTURE, à partir de la place réellement
   * disponible autour du bouton : une hauteur maximale en CSS ne suffit
   * pas quand le bouton est déjà bas dans la page — le menu déborde alors
   * sous la fenêtre, et ses dernières entrées sont inatteignables.
   */
  const [placement, setPlacement] = useState<{ dropUp: boolean; maxHeight: number } | null>(null);
  const current = options.find((o) => o.value === value);

  useLayoutEffect(() => {
    if (!open) {
      setPlacement(null);
      return;
    }
    function measure() {
      const trigger = rootRef.current?.getBoundingClientRect();
      if (!trigger) return;
      const below = window.innerHeight - trigger.bottom - VIEWPORT_MARGIN;
      const above = trigger.top - VIEWPORT_MARGIN;
      // On ne remonte le menu que s'il y a franchement plus de place
      // au-dessus : un menu qui s'ouvre vers le haut surprend, autant ne le
      // faire que quand ça change vraiment quelque chose.
      const dropUp = below < 200 && above > below;
      setPlacement({ dropUp, maxHeight: Math.max(120, dropUp ? above : below) });
    }
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open]);

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
    <div ref={rootRef} className={`${styles.select} ${className}`}>
      <button
        type="button"
        className={styles.trigger}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => {
          playButtonClick();
          setOpen((v) => !v);
        }}
      >
        <span className={styles.triggerLabel}>{current?.label ?? value}</span>
        <svg viewBox="0 0 24 24" fill="none" className={styles.chevron} aria-hidden>
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div
          role="listbox"
          // Défilement vertical borné par la place disponible (cf.
          // `placement`) : une liste longue reste entièrement atteignable,
          // que le bouton soit en haut ou en bas de la page.
          className={`${styles.menu} ${placement?.dropUp ? styles.menuUp : styles.menuDown}`}
          style={placement ? { maxHeight: placement.maxHeight } : { visibility: "hidden" }}
        >
          {options.map((opt, i) => (
            <div key={opt.value}>
              {opt.group && opt.group !== options[i - 1]?.group && <div className={styles.group}>{opt.group}</div>}
              <button
                type="button"
                role="option"
                aria-selected={opt.value === value}
                className={opt.value === value ? styles.optionActive : styles.option}
                onClick={() => {
                  playButtonClick();
                  onChange(opt.value);
                  setOpen(false);
                }}
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
