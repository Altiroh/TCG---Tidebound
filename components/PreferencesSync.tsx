"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { flushPreferences, hydratePreferences } from "@/lib/preferences";

/**
 * Relit les préférences du COMPTE dès le premier écran (`lib/preferences.ts`),
 * sans lecture serveur dans la mise en page : elle reste statique.
 *
 * Sur une page publique (connexion), il n'y a pas encore de compte à relire :
 * la relecture est retentée à chaque changement de page, jusqu'à ce qu'elle
 * aboutisse — donc juste après la connexion.
 *
 * Une page qu'on quitte envoie ce qui attend encore (un réglage changé il y
 * a moins d'une seconde), au lieu de le perdre avec l'onglet.
 */
export function PreferencesSync() {
  const pathname = usePathname();

  useEffect(() => {
    void hydratePreferences();
  }, [pathname]);

  useEffect(() => {
    const flush = () => void flushPreferences();
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return null;
}
