"use client";

import { useEffect, useRef } from "react";
import { playButtonClick } from "@/lib/sound";

/**
 * FENÊTRE DE NAVIRE — le rappel discret, pas le panneau plein écran.
 *
 * Une capacité de Navire qui s'active dans la fenêtre d'annonce de Marée
 * (`activationWindow`) rouvre cette fenêtre à CHAQUE changement d'état tant
 * qu'elle n'a pas servi. Poser un panneau modal au milieu de l'écran à
 * chaque fois, pour une capacité qu'on n'utilisera qu'une fois dans la
 * partie, c'est faire répéter au joueur le même « non » toute la partie.
 *
 * Le geste passe donc par le NAVIRE lui-même : son panneau s'allume
 * (`shipAbilityView.canActivate`, qui n'est vrai que pendant la fenêtre —
 * donc le halo ne s'allume que quand la Marée vient de changer), et ce
 * bandeau se contente de dire pourquoi, et d'offrir la sortie.
 *
 * Il ne bloque rien : le plateau reste visible et lisible derrière lui.
 *
 * Réservé au cas où le NAVIRE est seul à pouvoir répondre. Dès qu'une carte
 * est aussi éligible, c'est `ReactionPrompt` qui prend la main — une carte
 * qui se propose est une vraie question, et elle mérite l'écran.
 */

/** Passé ce délai sans réponse, la fenêtre se referme d'elle-même (équivaut à « Passer »). */
const TIMEOUT_MS = 30_000;

interface ShipWindowHintProps {
  /** Nom de la capacité, tel qu'il est imprimé sur la fiche du Navire. */
  name: string;
  onPass: () => void;
}

export function ShipWindowHint({ name, onPass }: ShipWindowHintProps) {
  const onPassRef = useRef(onPass);
  onPassRef.current = onPass;

  // Monté une seule fois par fenêtre (le parent ne le rend que pendant
  // qu'elle est ouverte) : le minuteur ne se réarme pas à chaque rendu.
  useEffect(() => {
    const id = setTimeout(() => onPassRef.current(), TIMEOUT_MS);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handlePass() {
    playButtonClick();
    onPass();
  }

  return (
    <div className="pointer-events-none fixed left-1/2 top-12 z-[65] flex -translate-x-1/2 items-center gap-3 rounded-full border border-white/20 bg-slate-950/75 px-4 py-2 text-xs text-slate-200 backdrop-blur-md">
      <span>
        Marée annoncée — <span className="font-semibold text-white">{name}</span> peut encore agir.
      </span>
      <button
        type="button"
        onClick={handlePass}
        className="pointer-events-auto rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold text-white outline-none transition-colors hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-white/40"
      >
        Passer
      </button>
    </div>
  );
}
