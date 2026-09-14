"use client";

import { useEffect, useState } from "react";
import { forgetProgression } from "@/features/progression/progressionSync";
import { SettingsDialog } from "@/features/settings/SettingsDialog";
import { playButtonClick } from "@/lib/sound";

interface OptionsButtonProps {
  isSignedIn: boolean;
}

function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
      <circle cx="12" cy="12" r="3.1" stroke="currentColor" strokeWidth={1.7} />
      <path
        d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 8.9 19.3a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.7 8.9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1.03-1.56V3a2 2 0 1 1 4 0v.1A1.7 1.7 0 0 0 15.1 4.7a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9c.28.68.94 1.12 1.66 1.03H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"
        stroke="currentColor"
        strokeWidth={1.45}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Bouton Options du menu principal — une pastille de verre en haut à
 * droite, posée par-dessus le coffret. Volontairement HORS des plaques 3D
 * du coffre (`ChestButtons3D`) : l'illustration `menu_box_base.webp` n'offre
 * aucun emplacement pour une icône, et ces plaques ne savent que naviguer
 * vers une route, pas ouvrir un dialogue.
 */
export function OptionsButton({ isSignedIn }: OptionsButtonProps) {
  const [open, setOpen] = useState(false);

  // Le menu repasse en « non connecté » après une déconnexion : le bandeau
  // des autres écrans ne doit plus reprendre le compte mémorisé.
  useEffect(() => {
    if (!isSignedIn) forgetProgression();
  }, [isSignedIn]);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          playButtonClick();
          setOpen(true);
        }}
        aria-label="Options"
        aria-haspopup="dialog"
        className="absolute right-4 top-4 z-20 flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-white/[0.08] text-[var(--text-primary)] shadow-[inset_0_1px_1px_rgba(255,255,255,0.35),0_10px_26px_rgba(0,0,0,0.45)] backdrop-blur-xl transition duration-150 ease-out hover:border-[var(--accent)]/50 hover:bg-white/[0.14] hover:text-[var(--accent-hover)] active:scale-95"
      >
        <GearIcon />
      </button>

      {open && <SettingsDialog isSignedIn={isSignedIn} onClose={() => setOpen(false)} />}
    </>
  );
}
