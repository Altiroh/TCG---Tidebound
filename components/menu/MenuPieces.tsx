"use client";

import { useState, type CSSProperties } from "react";
import styles from "@/components/menu/MenuCarte.module.css";

/**
 * LES PIÈCES — un jouet du menu. Trois pièces à l'ancre posées sur la table ;
 * un clic la fait sauter : elle tourne sur la tranche, comme une pièce
 * qu'on lance, et retombe à sa place avec un petit rebond. Toujours
 * relançable.
 *
 * Planches : `public/assets/menu/carte/piece-1/2/3.webp` (de la plus grande
 * à la plus petite).
 */
interface Piece {
  src: string;
  /** Centre et largeur, en pourcentages de la scène (le fond). */
  x: string;
  y: string;
  largeur: string;
  /** Inclinaison de la pièce posée. */
  rotate: number;
}

const PIECES: Piece[] = [
  // La monnaie du Market, tombée au pied de son parchemin.
  { src: "/assets/menu/carte/piece-1.webp", x: "64.6%", y: "80.5%", largeur: "3.2%", rotate: -14 },
  // Sur le bois de la table, sous la pile de livres.
  { src: "/assets/menu/carte/piece-2.webp", x: "4.6%", y: "86%", largeur: "2.6%", rotate: 22 },
  // Avec les pièces que le décor peint déjà près du bocal.
  { src: "/assets/menu/carte/piece-3.webp", x: "25.8%", y: "32.8%", largeur: "1.9%", rotate: -6 },
];

export function MenuPieces() {
  /** Nombre de sauts de chaque pièce : le changer remonte l'image, et l'animation repart. */
  const [sauts, setSauts] = useState<number[]>(() => PIECES.map(() => 0));

  return (
    <>
      {PIECES.map((piece, index) => (
        <button
          key={index}
          type="button"
          aria-label="Une pièce"
          className={styles.piece}
          data-saute={sauts[index]! > 0 ? "true" : undefined}
          style={{ left: piece.x, top: piece.y, "--largeur": piece.largeur, "--rotate": `${piece.rotate}deg` } as CSSProperties}
          onClick={() => setSauts((current) => current.map((n, i) => (i === index ? n + 1 : n)))}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- décor minuscule, déjà à sa taille */}
          <img key={sauts[index]} src={piece.src} alt="" draggable={false} />
          {/* L'ombre au sol, remontée avec la pièce pour que son animation reparte aussi. */}
          <span key={`ombre-${sauts[index]}`} aria-hidden className={styles.pieceOmbre} />
        </button>
      ))}
    </>
  );
}
