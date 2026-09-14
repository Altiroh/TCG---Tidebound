"use client";

import { useEffect, useState } from "react";

export type BoardPreviewBreakpoint = "mobile-landscape" | "laptop" | "desktop-large";

export interface BoardPreviewMetrics {
  width: number;
  height: number;
  /** Largeur / hauteur, arrondi à 2 décimales (1.78 ≈ 16:9). */
  ratio: number;
  breakpoint: BoardPreviewBreakpoint;
  orientation: "landscape" | "portrait";
}

const INITIAL: BoardPreviewMetrics = {
  width: 0,
  height: 0,
  ratio: 0,
  breakpoint: "laptop",
  orientation: "landscape",
};

function isBreakpoint(value: string): value is BoardPreviewBreakpoint {
  return value === "mobile-landscape" || value === "laptop" || value === "desktop-large";
}

/**
 * Mesures du viewport de jeu, pour le panneau de debug.
 *
 * Le nom du breakpoint N'EST PAS recalculé ici à partir de media queries
 * dupliquées en JavaScript : il est LU sur la scène elle-même
 * (`--bp`, défini dans `BoardPreview.module.css`). Le CSS reste donc la
 * source de vérité unique — le panneau ne peut pas afficher un mode
 * différent de celui qui est réellement appliqué.
 *
 * @param stageRef élément portant les tokens (la `.stage` de `GameStage`).
 */
export function useBoardPreviewMetrics(stageRef: React.RefObject<HTMLElement>): BoardPreviewMetrics {
  const [metrics, setMetrics] = useState<BoardPreviewMetrics>(INITIAL);

  useEffect(() => {
    function read() {
      const stage = stageRef.current;
      // On mesure la scène quand elle est disponible (elle occupe tout le
      // viewport de jeu) et on retombe sur la fenêtre sinon.
      const rect = stage?.getBoundingClientRect();
      const width = Math.round(rect?.width ?? window.innerWidth);
      const height = Math.round(rect?.height ?? window.innerHeight);

      let breakpoint: BoardPreviewBreakpoint = "laptop";
      if (stage) {
        const raw = getComputedStyle(stage).getPropertyValue("--bp").trim().replace(/^"|"$/g, "");
        if (isBreakpoint(raw)) breakpoint = raw;
      }

      const next: BoardPreviewMetrics = {
        width,
        height,
        ratio: height > 0 ? Math.round((width / height) * 100) / 100 : 0,
        breakpoint,
        orientation: width >= height ? "landscape" : "portrait",
      };

      // Un redimensionnement à la souris émet des dizaines d'événements par
      // seconde : on ne re-rend que quand une valeur affichée bouge vraiment
      // (les mesures sont arrondies, donc beaucoup de ticks sont identiques).
      setMetrics((current) =>
        current.width === next.width &&
        current.height === next.height &&
        current.ratio === next.ratio &&
        current.breakpoint === next.breakpoint &&
        current.orientation === next.orientation
          ? current
          : next
      );
    }

    read();
    window.addEventListener("resize", read);
    window.addEventListener("orientationchange", read);

    // `resize` ne couvre pas tout (barre d'URL mobile qui se rétracte, panneau
    // de devtools qui s'ouvre à côté) : on observe aussi la scène elle-même.
    const stage = stageRef.current;
    const observer = stage ? new ResizeObserver(read) : null;
    if (stage && observer) observer.observe(stage);

    return () => {
      window.removeEventListener("resize", read);
      window.removeEventListener("orientationchange", read);
      observer?.disconnect();
    };
  }, [stageRef]);

  return metrics;
}
