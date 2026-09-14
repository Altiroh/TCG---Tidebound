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
 * Trois rangées seulement :
 *
 *   adversaire   auto           → collé en haut
 *   centre       minmax(0, 1fr) → absorbe l'espace restant
 *   joueur       auto           → collé en bas (main comprise)
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
