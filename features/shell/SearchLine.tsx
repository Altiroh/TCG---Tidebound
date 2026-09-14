"use client";

import styles from "@/features/shell/ScreenShell.module.css";

interface SearchLineProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  /** Libellé pour lecteur d'écran — le champ n'a volontairement aucun label visible. */
  label: string;
  /**
   * `line` (défaut) : un filet bas, pour la barre utilitaire des écrans
   * papier. `pill` : une capsule sombre à contour, pour le bandeau des
   * écrans qui peignent leur propre décor (Collection, Deck Builder) — la
   * barre principale d'un client de TCG, pas un champ de formulaire.
   */
  variant?: "line" | "pill";
}

/**
 * Recherche réduite à l'essentiel : une loupe, un champ, un filet bas —
 * pas de rectangle à contour de laiton ni de creux en relief. Le focus
 * n'allume que ce filet (turquoise, cf. `.searchBar:focus-within::after`).
 * Peut légèrement grandir/rétrécir (`minmax` de la barre utilitaire).
 */
export function SearchLine({ value, onChange, placeholder, label, variant = "line" }: SearchLineProps) {
  return (
    <div className={variant === "pill" ? styles.searchPill : styles.searchBar}>
      <svg viewBox="0 0 24 24" fill="none" width="15" height="15" className={styles.searchIcon} aria-hidden>
        <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth={1.8} />
        <path d="M20 20l-3.2-3.2" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />
      </svg>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={styles.searchInput}
        aria-label={label}
      />
      {value.length > 0 && (
        <button type="button" className={styles.searchClear} onClick={() => onChange("")} aria-label="Effacer la recherche">
          ✕
        </button>
      )}
    </div>
  );
}
