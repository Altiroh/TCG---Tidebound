"use client";

import type { ActionToast } from "@/features/match/useActionToasts";

/**
 * Pile de notifications d'action (pioche/défausse/Sabordage/destruction),
 * empilées verticalement et s'effaçant automatiquement — voir
 * `useActionToasts`. Rendue hors de `BoardStage` (comme `PhaseBanner`,
 * `DragTargetingTrail`) pour occuper de vraies coordonnées viewport,
 * toujours bien centrée et lisible quel que soit le zoom du plateau.
 */
export function ActionToastStack({ toasts }: { toasts: ActionToast[] }) {
  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed left-1/2 top-20 z-50 flex -translate-x-1/2 flex-col items-center gap-1.5">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="animate-toast-in whitespace-nowrap rounded-full border border-white/15 bg-black/85 px-4 py-1.5 text-sm text-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.5)] [font-family:var(--font-card-title)]"
        >
          {toast.text}
        </div>
      ))}
    </div>
  );
}
