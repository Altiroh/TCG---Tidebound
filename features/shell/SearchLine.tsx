"use client";

import { useEffect, useRef, useState } from "react";
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
  /**
   * Branche Ctrl+K (⌘K sur Mac) sur ce champ et affiche la pastille du
   * raccourci quand il est vide. À n'activer que sur LA recherche
   * principale d'un écran : deux champs qui répondent au même raccourci
   * se voleraient le focus.
   */
  shortcut?: boolean;
}

/**
 * Recherche réduite à l'essentiel : une loupe, un champ, un filet bas —
 * pas de rectangle à contour de laiton ni de creux en relief. Le focus
 * n'allume que ce filet (turquoise, cf. `.searchBar:focus-within::after`).
 * Peut légèrement grandir/rétrécir (`minmax` de la barre utilitaire).
 *
 * Avec `shortcut`, une pastille discrète annonce Ctrl+K — le raccourci
 * existe de toute façon, autant qu'il se voie.
 */
export function SearchLine({ value, onChange, placeholder, label, variant = "line", shortcut = false }: SearchLineProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  // Le modificateur dépend de la plateforme, donc du navigateur : résolu
  // APRÈS le montage, sinon le rendu serveur (toujours "Ctrl") et le rendu
  // client divergeraient sur un Mac.
  const [isApple, setIsApple] = useState(false);

  useEffect(() => {
    if (!shortcut) return;
    setIsApple(/Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent));
  }, [shortcut]);

  useEffect(() => {
    if (!shortcut) return;

    function handleKey(event: KeyboardEvent) {
      // Ctrl+K comme ⌘K : on accepte les deux partout plutôt que d'imposer
      // au joueur de savoir sur quelle plateforme il est.
      if (event.key.toLowerCase() !== "k" || !(event.ctrlKey || event.metaKey) || event.altKey) return;
      const input = inputRef.current;
      if (!input) return;
      event.preventDefault();
      input.focus();
      input.select();
    }

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [shortcut]);

  return (
    <div className={variant === "pill" ? styles.searchPill : styles.searchBar}>
      <svg viewBox="0 0 24 24" fill="none" width="15" height="15" className={styles.searchIcon} aria-hidden>
        <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth={1.8} />
        <path d="M20 20l-3.2-3.2" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />
      </svg>
      <input
        ref={inputRef}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={styles.searchInput}
        aria-label={shortcut ? `${label} (Ctrl+K)` : label}
        aria-keyshortcuts={shortcut ? "Control+K Meta+K" : undefined}
      />
      {/* La pastille cède la place à la croix dès qu'il y a quelque chose à
          effacer : le raccourci ne sert plus à rien une fois dans le champ. */}
      {shortcut && value.length === 0 && (
        <kbd className={styles.searchShortcut} aria-hidden>
          {isApple ? "⌘" : "Ctrl"}
          <span className={styles.searchShortcutKey}>K</span>
        </kbd>
      )}
      {value.length > 0 && (
        <button type="button" className={styles.searchClear} onClick={() => onChange("")} aria-label="Effacer la recherche">
          ✕
        </button>
      )}
    </div>
  );
}
