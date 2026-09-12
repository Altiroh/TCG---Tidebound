"use client";

interface PendingChoicePromptProps {
  reasonLossAmount: number;
  anchorDamageAmount: number;
  onChoose: (choice: "reasonLoss" | "anchorDamage") => void;
}

/**
 * Choix binaire forcé (`GameState.pendingChoice`, ex: Le Fond Vous Regarde,
 * "au début de chaque tour, le joueur actif choisit : perdre X Raison, ou
 * infliger X dégâts d'Ancrage à son propre Navire") — bloque toute autre
 * action tant qu'il reste ouvert (`game/engine.ts`), donc affiché avec la
 * même priorité visuelle que `ReactionPrompt`.
 */
export function PendingChoicePrompt({ reasonLossAmount, anchorDamageAmount, onChoose }: PendingChoicePromptProps) {
  return (
    <div className="fixed left-1/2 top-6 z-[70] flex -translate-x-1/2 flex-col items-center gap-2 rounded-lg border-2 border-amber-400/80 bg-black/90 px-4 py-3 shadow-[0_0_25px_rgba(251,191,36,0.35)]">
      <span className="text-xs font-semibold uppercase tracking-wide text-amber-300">Un choix s&apos;impose à vous</span>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={() => onChoose("reasonLoss")}
          className="rounded-md border border-white/20 bg-white/10 px-3 py-1.5 text-sm text-slate-100 transition-colors hover:bg-white/20"
        >
          Perdre {reasonLossAmount} Raison
        </button>
        <button
          type="button"
          onClick={() => onChoose("anchorDamage")}
          className="rounded-md border border-white/20 bg-white/10 px-3 py-1.5 text-sm text-slate-100 transition-colors hover:bg-white/20"
        >
          Infliger {anchorDamageAmount} dégât{anchorDamageAmount > 1 ? "s" : ""} d&apos;Ancrage à mon Navire
        </button>
      </div>
    </div>
  );
}
