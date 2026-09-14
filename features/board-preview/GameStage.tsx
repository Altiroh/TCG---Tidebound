import { forwardRef } from "react";
import styles from "@/features/board-preview/BoardPreview.module.css";

/**
 * Scène de jeu — la grille de composition, et le porteur de TOUS les
 * tokens de dimensionnement (`--card-h`, `--ship-w`, `--gutter-*`… ; voir
 * `BoardPreview.module.css`).
 *
 * Composition de référence : un 16:9 façon 1920×1080. Mais la scène n'est
 * PAS un canevas figé mis à l'échelle (contrairement à
 * `features/match/BoardStage.tsx` et son `transform: scale()` global) :
 * elle occupe tout l'espace sûr disponible et se ré-agence zone par zone.
 * La composition reprend les placements de l'ancien board (`MatchBoard`,
 * repère 1672×941) sur une grille 4 colonnes × 5 rangées :
 *
 *                 navires   plateau          piles    colonne
 *   main adverse  ─────── éventail (dos) ───────      Menu
 *   adversaire    navire    5 emplacements   pioche·défausse │ Tour
 *   centre        tuile     piste de Marée   —               │ Journal
 *   joueur        navire    5 emplacements   pioche·défausse │ Phase
 *   main          ─────── éventail ───────────────    joueur
 *
 * Seules les bandes de main (`1fr`) et la bande centrale (`2fr`) sont
 * élastiques : l'espace en trop se répartit entre elles, sans grand vide au
 * milieu du plateau.
 *
 * Le padding de la scène intègre `env(safe-area-inset-*)` : le gameplay
 * reste toujours dans la zone sûre, même si le décor, lui, peut être
 * recadré derrière.
 */
export const GameStage = forwardRef<HTMLDivElement, { children: React.ReactNode }>(function GameStage(
  { children },
  ref
) {
  return (
    <div ref={ref} className={styles.stage}>
      {children}
    </div>
  );
});
