"use client";

import { useState } from "react";
import { getCardDefinition, type CardInstance, type HandDiscardChoice } from "@/game";
import { CardCarousel } from "@/features/match/CardCarousel";

interface HandDiscardPromptProps {
  choice: HandDiscardChoice;
  /** Main du joueur à qui le choix est posé — toutes ses cartes sont éligibles. */
  hand: CardInstance[];
  onConfirm: (instanceIds: string[]) => void;
  /** « Ne rien défausser », seulement si le texte dit « vous pouvez ». */
  onRefuse: () => void;
}

/**
 * « Défaussez N cartes » : c'est le JOUEUR qui désigne lesquelles.
 *
 * Avant, le moteur prenait le début de la main — ce qui transformait un coût
 * en loterie de tri, et rendait injouable tout un pan du Lot 13, bâti sur la
 * défausse volontaire. Même forme que `GraveyardPickPrompt`, puisque c'est
 * la même question posée à l'autre bout : une rangée de grandes cartes, un
 * clic sélectionne (ou désélectionne), un bouton confirme.
 *
 * Pas de croix de fermeture : tant que le choix est ouvert, `dispatch`
 * refuse toute autre action. Seul un texte en « vous POUVEZ défausser »
 * offre une sortie, et elle est explicite.
 */
export function HandDiscardPrompt({ choice, hand, onConfirm, onRefuse }: HandDiscardPromptProps) {
  const [selected, setSelected] = useState<string[]>([]);
  const complete = selected.length === choice.count;

  function toggle(card: CardInstance) {
    setSelected((current) => {
      if (current.includes(card.instanceId)) return current.filter((id) => id !== card.instanceId);
      // Une carte de trop chasse la plus ancienne : sélectionner reste un
      // geste, jamais une erreur à corriger avant de continuer.
      const next = [...current, card.instanceId];
      return next.length > choice.count ? next.slice(next.length - choice.count) : next;
    });
  }

  const source = choice.sourceInstanceId ? hand.find((c) => c.instanceId === choice.sourceInstanceId) : undefined;

  return (
    <div className="fixed inset-0 z-[85] flex items-center justify-center bg-black/70 p-6 backdrop-blur-md">
      <div
        role="dialog"
        aria-label="Choisir les cartes à défausser"
        className="relative flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-white/15 bg-white/[0.06] shadow-[0_8px_40px_rgba(0,0,0,0.6)] backdrop-blur-2xl"
      >
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-white/20 to-transparent" />
        <div className="relative flex flex-col items-center gap-1 px-6 pb-3 pt-7 text-center">
          {source && <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{getCardDefinition(source.cardId).name}</p>}
          <h2 className="text-2xl font-semibold text-white [font-family:var(--font-card-title)]">
            {choice.count > 1 ? `Choisis ${choice.count} cartes à défausser` : "Choisis la carte à défausser"}
          </h2>
          <p className="max-w-2xl text-sm text-slate-300">Elles rejoignent ton Cimetière.</p>
        </div>

        <div className="relative pb-2">
          <CardCarousel cards={hand} selectedInstanceIds={selected} onSelect={toggle} emptyLabel="Ta main est vide." />
        </div>

        <div className="relative flex items-center justify-end gap-2 border-t border-white/10 px-6 py-4">
          <span className="mr-auto text-sm text-slate-400">
            {complete
              ? selected.map((id) => getCardDefinition(hand.find((c) => c.instanceId === id)!.cardId).name).join(", ")
              : `${selected.length} / ${choice.count} sélectionnée${choice.count > 1 ? "s" : ""}`}
          </span>
          {choice.refusable && (
            <button
              type="button"
              onClick={onRefuse}
              className="rounded-md px-3 py-2 text-sm text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
            >
              Ne rien défausser
            </button>
          )}
          <button
            type="button"
            disabled={!complete}
            onClick={() => complete && onConfirm(selected)}
            className="rounded-md bg-sky-600/80 px-4 py-2 text-sm font-semibold text-white shadow-[inset_0_0_0_1px_rgba(125,211,252,0.4)] transition-colors hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Défausser
          </button>
        </div>
      </div>
    </div>
  );
}
