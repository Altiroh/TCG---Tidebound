"use client";

import { useEffect, useState } from "react";

/** Résolution native de `board.jpg` — sert de repère fixe pour positionner tout le HUD en pixels absolus. */
export const STAGE_WIDTH = 1672;
export const STAGE_HEIGHT = 941;

/**
 * Canevas de taille fixe (`STAGE_WIDTH`×`STAGE_HEIGHT`, la résolution native de
 * `board.jpg`) recentré et mis à l'échelle (`scale()`, "contain") pour
 * toujours tenir dans le viewport sans jamais scroller ni déformer le
 * board. Tout le HUD (`MatchBoard`/`OnlineBoard`) se positionne en `px`
 * absolus DANS ce repère fixe — un seul calcul d'échelle ici plutôt que de
 * rendre chaque sous-composant responsive individuellement.
 */
export function BoardStage({ children }: { children: React.ReactNode }) {
  const [scale, setScale] = useState(1);

  useEffect(() => {
    function update() {
      setScale(Math.min(window.innerWidth / STAGE_WIDTH, window.innerHeight / STAGE_HEIGHT));
    }
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  return (
    <div className="fixed inset-0 overflow-hidden bg-black">
      <div
        className="absolute left-1/2 top-1/2"
        style={{
          width: STAGE_WIDTH,
          height: STAGE_HEIGHT,
          transform: `translate(-50%, -50%) scale(${scale})`,
          transformOrigin: "center center",
        }}
      >
        {children}
      </div>
    </div>
  );
}
