"use client";

import { useState } from "react";
import { getCardDefinition, type DeckLookChoice } from "@/game";
import { CardCarousel } from "@/features/match/CardCarousel";

interface DeckLookPromptProps {
  choice: DeckLookChoice;
  onConfirm: (instanceIds: string[]) => void;
  /** « Ne rien prendre », seulement si le texte dit « vous pouvez ». */
  onRefuse: () => void;
}

/**
 * « Regardez les N premières cartes de votre pioche. Ajoutez-en une à votre
 * main. Placez les autres sous votre pioche. » (Lot 14).
 *
 * Même forme que `HandDiscardPrompt` et `GraveyardPickPrompt` — une rangée
 * de grandes cartes, un clic sélectionne, un bouton confirme : c'est la même
 * question posée à un autre endroit du jeu, elle n'a aucune raison de se
 * présenter autrement.
 *
 * Ce que l'écran doit rendre lisible et que les autres n'ont pas à dire :
 * les cartes NON prises ne sont pas perdues, elles repassent sous la pioche
 * dans l'ordre où elles étaient. Sans cette phrase, le joueur hésite à
 * cliquer.
 *
 * Quand le texte restreint ce qui est prenable (« une Structure parmi
 * elles »), les cartes hors-type restent AFFICHÉES — il les a regardées,
 * c'est l'intérêt de la carte — mais ne se sélectionnent pas.
 */
export function DeckLookPrompt({ choice, onConfirm, onRefuse }: DeckLookPromptProps) {
  const [selected, setSelected] = useState<string[]>([]);

  const prenable = (instanceId: string) => {
    const carte = choice.revealed.find((c) => c.instanceId === instanceId);
    if (!carte) return false;
    if (!choice.takeableCardTypes) return true;
    return choice.takeableCardTypes.includes(getCardDefinition(carte.cardId).type);
  };

  function toggle(card: { instanceId: string }) {
    if (!prenable(card.instanceId)) return;
    setSelected((current) => {
      if (current.includes(card.instanceId)) return current.filter((id) => id !== card.instanceId);
      // Une carte de trop chasse la plus ancienne, comme à la défausse :
      // sélectionner reste un geste, jamais une erreur à corriger.
      const next = [...current, card.instanceId];
      return next.length > choice.take ? next.slice(next.length - choice.take) : next;
    });
  }

  const aucunePrenable = choice.revealed.every((c) => !prenable(c.instanceId));
  const complete = selected.length === choice.take || (choice.refusable && selected.length > 0);

  return (
    <div className="fixed inset-0 z-[85] flex items-center justify-center bg-black/70 p-6 backdrop-blur-md">
      <div
        role="dialog"
        aria-label="Regarder le dessus de sa pioche"
        className="relative flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-white/15 bg-white/[0.06] shadow-[0_8px_40px_rgba(0,0,0,0.6)] backdrop-blur-2xl"
      >
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-white/20 to-transparent" />
        <div className="relative flex flex-col items-center gap-1 px-6 pb-3 pt-7 text-center">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Dessus de ta pioche
          </p>
          <h2 className="text-2xl font-semibold text-white [font-family:var(--font-card-title)]">
            {choice.take > 1 ? `Prends jusqu'à ${choice.take} cartes` : "Prends une carte"}
          </h2>
          <p className="max-w-2xl text-sm text-slate-300">
            {aucunePrenable
              ? "Aucune de ces cartes ne correspond : elles repassent toutes sous ta pioche."
              : "Les autres repassent sous ta pioche, dans l'ordre."}
          </p>
        </div>

        <div className="relative pb-2">
          <CardCarousel
            cards={choice.revealed}
            selectedInstanceIds={selected}
            onSelect={toggle}
            emptyLabel="Ta pioche est vide."
          />
        </div>

        <div className="relative flex items-center justify-end gap-2 border-t border-white/10 px-6 py-4">
          <span className="mr-auto text-sm text-slate-400">
            {selected.length > 0
              ? selected
                  .map((id) => getCardDefinition(choice.revealed.find((c) => c.instanceId === id)!.cardId).name)
                  .join(", ")
              : `${selected.length} / ${choice.take} sélectionnée${choice.take > 1 ? "s" : ""}`}
          </span>
          {(choice.refusable || aucunePrenable) && (
            <button
              type="button"
              onClick={onRefuse}
              className="rounded-md px-3 py-2 text-sm text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
            >
              Ne rien prendre
            </button>
          )}
          <button
            type="button"
            disabled={!complete}
            onClick={() => complete && onConfirm(selected)}
            className="rounded-md bg-sky-600/80 px-4 py-2 text-sm font-semibold text-white shadow-[inset_0_0_0_1px_rgba(125,211,252,0.4)] transition-colors hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Prendre
          </button>
        </div>
      </div>
    </div>
  );
}
