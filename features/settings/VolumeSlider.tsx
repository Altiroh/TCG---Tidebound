"use client";

import { useId } from "react";

interface VolumeSliderProps {
  value: number;
  onChange: (value: number) => void;
  /** Libellé lu par les lecteurs d'écran — le curseur n'a pas d'étiquette visible, la ligne au-dessus porte déjà le nom. */
  label: string;
  /** Interrupteur coupé : le curseur reste réglable (on prépare son volume avant de rallumer) mais s'efface visuellement. */
  muted?: boolean;
}

/**
 * Curseur de volume 0→100 %. Un `<input type="range">` natif (donc clavier,
 * tactile et lecteurs d'écran gratuits), repeint en verre : rail translucide
 * dont la portion remplie est laiton, pastille du même laiton. La couleur du
 * remplissage vient d'un dégradé calculé sur la valeur — pas de pseudo-élément
 * de progression fiable sur tous les navigateurs.
 */
export function VolumeSlider({ value, onChange, label, muted = false }: VolumeSliderProps) {
  const id = useId();
  const percent = Math.round(value * 100);

  return (
    <div className={`flex items-center gap-3 px-1 pb-2 transition-opacity duration-150 ${muted ? "opacity-40" : ""}`}>
      <input
        id={id}
        type="range"
        min={0}
        max={100}
        step={1}
        value={percent}
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        className="volume-slider h-1.5 w-full cursor-pointer appearance-none rounded-full outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]/60"
        style={{
          background: `linear-gradient(to right, var(--accent) 0%, var(--accent) ${percent}%, var(--tb-border) ${percent}%, var(--tb-border) 100%)`,
        }}
      />
      <span className="w-9 shrink-0 text-right text-[11px] tabular-nums text-[var(--text-secondary)]">{percent}%</span>
    </div>
  );
}
