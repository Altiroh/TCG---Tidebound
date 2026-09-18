"use client";

import type { ActionToast } from "@/features/match/useActionToasts";

/**
 * Pile de notifications d'action (pioche/défausse/Sabordage/destruction),
 * empilées verticalement et s'effaçant automatiquement — voir
 * `useActionToasts`. Rendue hors de `BoardStage` (comme `PhaseBanner`,
 * `DragTargetingTrail`) pour occuper de vraies coordonnées viewport,
 * toujours lisible quel que soit le zoom du plateau.
 *
 * ANGLE HAUT-GAUCHE, et pas le centre. Centrées, ces bulles se posaient en
 * plein sur le plateau adverse : sur un téléphone en paysage, deux pioches
 * d'affilée masquaient la rangée de l'adversaire au moment précis où on
 * regardait ce qu'il jouait, et la bannière de phase leur passait dessus.
 * Un coin les met hors du champ de jeu sans les rendre discrètes — c'est
 * de l'information de second plan, elle n'a pas à couvrir le premier.
 * Le coin est le même sur toutes les tailles : une notification qui change
 * de place entre le téléphone et le web s'apprend deux fois.
 */
export function ActionToastStack({ toasts }: { toasts: ActionToast[] }) {
  if (toasts.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed z-50 flex max-w-[60vw] flex-col items-start gap-1.5"
      style={{
        top: "calc(var(--tb-safe-top) + 0.75rem)",
        left: "calc(var(--tb-safe-left) + 0.75rem)",
      }}
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="animate-toast-in max-w-full truncate rounded-full border border-white/15 bg-black/85 px-3.5 py-1.5 text-sm text-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.5)] [font-family:var(--font-card-title)]"
        >
          {toast.text}
        </div>
      ))}
    </div>
  );
}
