"use client";

import type { GamePhase } from "@/game";

interface PhaseActionButtonProps {
  /** Si `false`, affiche l'icône "en attente" (sablier), non cliquable — l'adversaire (humain, bot ou en ligne) joue. */
  isMyTurn: boolean;
  phase: GamePhase;
  onAdvancePhase: () => void;
  onEndTurn: () => void;
  size?: number;
}

const ICONS = {
  wait: "/assets/board/phase-buttons/icon-wait.png",
  combat: "/assets/board/phase-buttons/icon-combat.png",
  endTurn: "/assets/board/phase-buttons/icon-end-turn.png",
} as const;

/**
 * Bouton d'action de phase unique (assets fournis : `cadre_btn_phase` +
 * 3 icônes) : son icône ET son action changent selon l'état de la partie
 * plutôt que d'avoir un bouton "Combat" et un bouton "Fin de tour"
 * séparés — Phase principale → Phase de combat → Fin de tour, ou "en
 * attente" tant que ce n'est pas mon tour. Le libellé ne s'affiche qu'au
 * survol (positionné en absolu sous le bouton, hors flux) pour ne jamais
 * décaler le centrage du bouton lui-même selon la longueur du texte.
 */
export function PhaseActionButton({ isMyTurn, phase, onAdvancePhase, onEndTurn, size = 112 }: PhaseActionButtonProps) {
  const icon = !isMyTurn ? ICONS.wait : phase === "combatPhase" ? ICONS.endTurn : ICONS.combat;
  const label = !isMyTurn ? "En attente…" : phase === "combatPhase" ? "Fin de tour" : "Combat";
  const onClick = !isMyTurn ? undefined : phase === "combatPhase" ? onEndTurn : onAdvancePhase;

  return (
    <div className="group/phase relative flex shrink-0 flex-col items-center" style={{ width: size }}>
      <button
        type="button"
        onClick={onClick}
        disabled={!onClick}
        aria-label={label}
        className="group relative shrink-0 disabled:cursor-default"
        style={{ width: size, height: size }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- bouton composite décoratif, taille fixe */}
        <img
          src="/assets/board/phase-buttons/frame.png"
          alt=""
          aria-hidden
          draggable={false}
          className="absolute inset-0 h-full w-full select-none"
        />
        {/* eslint-disable-next-line @next/next/no-img-element -- idem */}
        <img
          src={icon}
          alt=""
          aria-hidden
          draggable={false}
          className={`absolute inset-[15%] h-[70%] w-[70%] select-none rounded-full transition-transform duration-150 ${
            onClick ? "group-hover:scale-110 group-active:scale-95" : "opacity-60"
          }`}
        />
      </button>
      <span className="pointer-events-none absolute top-full mt-1.5 whitespace-nowrap text-sm font-medium uppercase tracking-wide text-slate-200 opacity-0 transition-opacity duration-150 [text-shadow:0_1px_3px_rgba(0,0,0,0.9)] group-hover/phase:opacity-100">
        {label}
      </span>
    </div>
  );
}
