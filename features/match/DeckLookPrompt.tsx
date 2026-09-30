"use client";

import { useState } from "react";
import { deckLookRefusal, getCardDefinition, isDeckLookTakeable, type CardInstance, type DeckLookChoice } from "@/game";
import { CARD_TYPE_LABELS } from "@/features/match/cardDisplay";
import { CardCarousel } from "@/features/match/CardCarousel";
import { CarouselPromptFrame } from "@/features/match/CarouselPromptFrame";

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
 * elles », « une Sentinelle »), les autres cartes restent AFFICHÉES — il
 * les a regardées, c'est l'intérêt de la carte — mais grisées, barrées d'un
 * symbole « non prenable », et ne se sélectionnent pas.
 */
export function DeckLookPrompt({ choice, onConfirm, onRefuse }: DeckLookPromptProps) {
  const [selected, setSelected] = useState<string[]>([]);

  const prenable = (instanceId: string) => {
    const carte = choice.revealed.find((c) => c.instanceId === instanceId);
    return carte !== undefined && isDeckLookTakeable(choice, carte);
  };

  /** Ce que le texte demande, pour dire pourquoi une carte ne se prend pas. */
  function raison(card: CardInstance): string | null {
    const refus = deckLookRefusal(choice, card);
    if (refus === "type") return `Ce texte ne permet de prendre que : ${choice.takeableCardTypes!.map((t) => CARD_TYPE_LABELS[t]).join(", ")}.`;
    if (refus === "archetype") return "Ce texte ne permet de prendre qu'une carte de cette famille.";
    if (refus === "color") return "Ce texte ne permet de prendre qu'une carte de cette couleur.";
    return null;
  }

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
    <CarouselPromptFrame
      ariaLabel="Regarder le dessus de sa pioche"
      eyebrow="Dessus de ta pioche"
      title={choice.take > 1 ? `Prends jusqu'à ${choice.take} cartes` : "Prends une carte"}
      description={
        aucunePrenable
          ? "Aucune de ces cartes ne correspond : elles repassent toutes sous ta pioche."
          : "Les autres repassent sous ta pioche, dans l'ordre."
      }
      status={
        selected.length > 0
          ? selected.map((id) => getCardDefinition(choice.revealed.find((c) => c.instanceId === id)!.cardId).name).join(", ")
          : `${selected.length} / ${choice.take} sélectionnée${choice.take > 1 ? "s" : ""}`
      }
      actions={
        <>
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
        </>
      }
    >
      <CardCarousel
        cards={choice.revealed}
        selectedInstanceIds={selected}
        onSelect={toggle}
        unavailableReason={raison}
        emptyLabel="Ta pioche est vide."
      />
    </CarouselPromptFrame>
  );
}
