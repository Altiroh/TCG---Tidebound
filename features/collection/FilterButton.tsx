"use client";

import type { CardType } from "@/game";
import styles from "@/features/collection/CollectionScreen.module.css";
import { CARD_TYPE_LABELS } from "@/features/match/cardDisplay";
import { playButtonClick } from "@/lib/sound";

interface FilterButtonProps {
  active: boolean;
  onClick: () => void;
  /** Icône de type (anneau de laiton rond) — omis pour le bouton "Tout" (texte). */
  type?: CardType;
}

/** Anneau de laiton rond, icône de type au centre — repli textuel "Tout" si `type` est omis. */
export function FilterButton({ active, onClick, type }: FilterButtonProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      title={type ? CARD_TYPE_LABELS[type] : "Tout"}
      aria-label={type ? CARD_TYPE_LABELS[type] : "Tout"}
      onClick={() => {
        playButtonClick();
        onClick();
      }}
      className={active ? styles.filterButtonActive : styles.filterButton}
    >
      {type ? (
        <span
          aria-hidden
          style={{
            display: "block",
            height: "62%",
            width: "62%",
            backgroundImage: `url(/assets/cards/icons/TYPE_${type.toUpperCase()}_STANDARD.png)`,
            // Chaque asset `TYPE_*_STANDARD.png` est un pictogramme suivi d'un
            // mot-clé sur un ratio ~3:1 — l'icône occupe la zone carrée de
            // tête (largeur ≈ hauteur de l'image). `auto 100%` cale la
            // hauteur affichée sur celle du conteneur, ce qui fait exactement
            // coïncider la fenêtre visible (`left center`) avec cette zone
            // carrée : l'icône entière apparaît, centrée, jamais tronquée
            // (contrairement à un zoom supérieur à 100% qui ne montrerait
            // qu'une tranche gauche du pictogramme).
            backgroundSize: "auto 100%",
            backgroundPosition: "left center",
            backgroundRepeat: "no-repeat",
            filter: active ? "none" : "grayscale(0.7) opacity(0.65)",
          }}
        />
      ) : (
        <span style={{ fontSize: "0.65em", fontWeight: 700, letterSpacing: "0.02em" }}>Tout</span>
      )}
    </button>
  );
}
