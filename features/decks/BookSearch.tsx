"use client";

import { useRef } from "react";
import book from "@/features/decks/DeckEditorBook.module.css";
import { playButtonClick } from "@/lib/sound";

/**
 * La barre de recherche « sur le livre » : bois cerclé de laiton, la loupe
 * posée à part dans son creux gauche (`barre-recherche.webp`,
 * `icone-loupe.webp`). Partagée par l'Éditeur de deck et la Collection :
 * sur le livre, la recherche descend du bandeau dans la barre de la grille.
 *
 * La croix d'effacement est la NÔTRE, pas celle du navigateur : celle de
 * Chrome, grise et minuscule, disparaissait sur le bois sombre. Elle
 * n'apparaît que lorsqu'il y a quelque chose à effacer, et rend la main au
 * champ pour qu'on retape aussitôt.
 */
export function BookSearch({
  value,
  onChange,
  placeholder = "Rechercher une carte…",
  label = "Rechercher une carte",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <label className={book.search}>
      <span className={book.searchIcon} aria-hidden />
      <span className={book.visuallyHidden}>{label}</span>
      <input ref={inputRef} type="search" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
      {value && (
        <button
          type="button"
          className={book.searchClear}
          aria-label="Effacer la recherche"
          title="Effacer la recherche"
          onClick={(event) => {
            // Dans un <label> : sans ça, le clic repartirait vers le champ comme un second clic.
            event.preventDefault();
            playButtonClick();
            onChange("");
            inputRef.current?.focus();
          }}
        >
          <svg viewBox="0 0 24 24" fill="none" width="100%" height="100%" aria-hidden>
            <path d="M7 7l10 10M17 7L7 17" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" />
          </svg>
        </button>
      )}
    </label>
  );
}
