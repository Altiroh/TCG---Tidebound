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
 *   adversaire   auto                          → navire, plateau, ressources
 *   centre       minmax(--tide-h, --center-max) → Marée + HUD (superposés)
 *   joueur       auto                          → plateau, navire, ressources, main
 *
 * La bande centrale étant plafonnée, l'espace vertical restant est réparti
 * à parts égales autour des trois rangées (`align-content: space-evenly`) :
 * les camps ne sont donc PAS collés aux bords, ils sont insérés avec une
 * marge égale à celle qui les sépare de la Marée (~127px en 2560×1440,
 * ~15px en 740×360). C'est ce qui évite le grand vide central.
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
