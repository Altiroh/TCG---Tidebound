"use client";

import styles from "@/features/collection/CollectionScreen.module.css";

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
}

/** Champ de recherche toujours visible dans la toolbar — peut légèrement grandir/rétrécir (`minmax` du parent). */
export function SearchBar({ value, onChange }: SearchBarProps) {
  return (
    <div className={styles.searchBar}>
      <svg viewBox="0 0 24 24" fill="none" width="16" height="16" style={{ flexShrink: 0, opacity: 0.7 }} aria-hidden>
        <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth={2} />
        <path d="M20 20l-3.2-3.2" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
      </svg>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search cards..."
        className={styles.searchInput}
        aria-label="Rechercher une carte"
      />
      {value.length > 0 && (
        <button type="button" className={styles.searchClear} onClick={() => onChange("")} aria-label="Effacer la recherche">
          ✕
        </button>
      )}
    </div>
  );
}
