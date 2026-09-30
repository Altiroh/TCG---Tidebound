"use client";

import { useState } from "react";
import { getCardDefinition, type CardInstance, type KeepUnitsChoice, UNIT_CARD_TYPES } from "@/game";
import { CardCarousel } from "@/features/match/CardCarousel";
import { CarouselPromptFrame } from "@/features/match/CarouselPromptFrame";

interface KeepUnitsPromptProps {
  choice: KeepUnitsChoice;
  /** Plateau du joueur à qui la question est posée. */
  board: CardInstance[];
  onConfirm: (instanceIds: string[]) => void;
}

/**
 * « Chaque joueur choisit jusqu'à N unités qu'il contrôle. Détruisez toutes
 * les autres. » (Lot 14 — Chacun sa Place, Abandonnez le Navire !).
 *
 * Un board wipe À CHOIX : c'est ce qui le distingue d'une destruction
 * totale, et ce qui en fait une carte jouable des deux côtés de la table.
 * Chacun répond à son tour, et rien ne part avant que les deux aient
 * répondu — l'écran doit donc dire clairement que ce qu'on ne garde pas est
 * perdu, sans quoi on croit choisir ce qu'on détruit.
 *
 * Même forme que les autres écrans de désignation : une rangée de grandes
 * cartes, un clic sélectionne, un bouton confirme.
 */
export function KeepUnitsPrompt({ choice, board, onConfirm }: KeepUnitsPromptProps) {
  const [selected, setSelected] = useState<string[]>([]);

  const unites = board.filter((unit) => UNIT_CARD_TYPES.includes(getCardDefinition(unit.cardId).type));

  function toggle(card: CardInstance) {
    setSelected((current) => {
      if (current.includes(card.instanceId)) return current.filter((id) => id !== card.instanceId);
      const next = [...current, card.instanceId];
      // Une de trop chasse la plus ancienne : sélectionner reste un geste.
      return next.length > choice.keep ? next.slice(next.length - choice.keep) : next;
    });
  }

  const perdues = unites.length - selected.length;

  return (
    <CarouselPromptFrame
      ariaLabel="Choisir les unités à garder"
      eyebrow="Sauve ce que tu peux"
      title={choice.keep > 1 ? `Garde jusqu'à ${choice.keep} unités` : "Garde une unité"}
      description={unites.length === 0 ? "Tu ne contrôles aucune unité." : "Toutes celles que tu ne gardes pas seront détruites."}
      status={
        perdues > 0
          ? `${perdues} unité${perdues > 1 ? "s" : ""} sera${perdues > 1 ? "ont" : ""} détruite${perdues > 1 ? "s" : ""}`
          : "Tout ton plateau est sauvé."
      }
      actions={
        <button
          type="button"
          onClick={() => onConfirm(selected)}
          className="rounded-md bg-sky-600/80 px-4 py-2 text-sm font-semibold text-white shadow-[inset_0_0_0_1px_rgba(125,211,252,0.4)] transition-colors hover:bg-sky-500"
        >
          Confirmer
        </button>
      }
    >
      <CardCarousel cards={unites} selectedInstanceIds={selected} onSelect={toggle} emptyLabel="Aucune unité sur ton plateau." />
    </CarouselPromptFrame>
  );
}
