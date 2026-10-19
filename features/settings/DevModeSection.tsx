"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setDevMode } from "@/features/admin/actions";
import { notifyProgressionChanged } from "@/features/progression/progressionSync";
import { ToggleSwitch } from "@/features/settings/ToggleSwitch";

/**
 * Mode Dev (Admins) : coupé, l'Admin voit l'application comme un joueur —
 * Atelier, outils d'édition de la Collection et écriture du courrier
 * disparaissent. L'interrupteur, lui, reste toujours là pour revenir.
 */
export function DevModeSection({ vueJoueur }: { vueJoueur: boolean }) {
  const router = useRouter();
  const [devMode, setDevModeShown] = useState(!vueJoueur);
  const [pending, startTransition] = useTransition();

  function toggle(enabled: boolean) {
    if (pending) return;
    setDevModeShown(enabled);
    startTransition(async () => {
      const result = await setDevMode(enabled);
      if (!result.ok) {
        setDevModeShown(!enabled);
        return;
      }
      // Le bandeau relit le rôle affiché, la page serveur aussi.
      notifyProgressionChanged();
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col">
      <ToggleSwitch
        label="Mode Dev"
        description={devMode ? "Outils Admin affichés." : "Vue joueur : tu vois ce que voient les joueurs."}
        checked={devMode}
        onChange={toggle}
      />
    </div>
  );
}
