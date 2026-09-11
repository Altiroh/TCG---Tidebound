"use client";

import { useEffect } from "react";
import { startMenuAmbiance, stopMenuAmbiance } from "@/lib/sound";

/** Lance l'ambiance sonore du menu principal tant que ce composant est monté (démonté dès qu'on quitte l'écran d'accueil). */
export function MenuAmbiance() {
  useEffect(() => {
    startMenuAmbiance();
    return () => stopMenuAmbiance();
  }, []);

  return null;
}
