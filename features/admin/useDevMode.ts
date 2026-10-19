"use client";

import { useEffect, useState } from "react";
import { fetchProgression, type ProgressionSummary } from "@/features/progression/actions";
import { onProgressionRead, readProgression, rememberedProgression } from "@/features/progression/progressionSync";

/**
 * Mode Dev côté NAVIGATEUR : Admin dont le mode Dev est allumé (Options), ou
 * développement local hors vue joueur — la même règle que les outils
 * d'édition de la Collection (`app/collection/page.tsx`).
 */
function devModeOf(summary: ProgressionSummary | null): boolean {
  if (summary?.vueJoueur) return false;
  return process.env.NODE_ENV === "development" || (summary?.isAdmin ?? false);
}

/**
 * Le mode Dev est-il actif ? Faux tant qu'on ne sait pas : ce qu'il dévoile
 * (illustrations pas encore sorties) reste caché par défaut. Il suit la
 * lecture partagée du bandeau (`readProgression`, dédoublonnée) : cent
 * cartes à l'écran ne font pas cent requêtes, et la bascule des Options
 * s'applique partout dès la relecture.
 */
export function useDevMode(): boolean {
  const [devMode, setDevMode] = useState(() => devModeOf(rememberedProgression()));
  useEffect(() => {
    const unsubscribe = onProgressionRead((summary) => setDevMode(devModeOf(summary)));
    readProgression(fetchProgression)
      .then((summary) => setDevMode(devModeOf(summary)))
      .catch(() => undefined);
    return unsubscribe;
  }, []);
  return devMode;
}
