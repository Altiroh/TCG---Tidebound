"use client";

import book from "@/features/decks/DeckEditorBook.module.css";

/**
 * La barre de recherche « sur le livre » : bois cerclé de laiton, la loupe
 * posée à part dans son creux gauche (`barre-recherche.webp`,
 * `icone-loupe.webp`). Partagée par l'Éditeur de deck et la Collection :
 * sur le livre, la recherche descend du bandeau dans la barre de la grille.
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
  return (
    <label className={book.search}>
      <span className={book.searchIcon} aria-hidden />
      <span className={book.visuallyHidden}>{label}</span>
      <input type="search" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
    </label>
  );
}
