"use client";

import { useState } from "react";
import { deckLookRefusal, deckLookSelectionFits, deckLookTakeLimit, getCardDefinition, isDeckLookTakeable, type CardInstance, type DeckLookChoice } from "@/game";
import { CARD_TYPE_LABELS } from "@/features/match/cardDisplay";
import { CardCarousel } from "@/features/match/CardCarousel";
import { CarouselPromptFrame } from "@/features/match/CarouselPromptFrame";

interface DeckLookPromptProps {
  choice: DeckLookChoice;
  /**
   * `restOrder` : seulement quand les cartes remises retournent AU-DESSUS de
   * la pioche dans l'ordre choisi (`restTo: "deckTopChosenOrder"`).
   */
  onConfirm: (instanceIds: string[], restOrder?: string[]) => void;
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
 *
 * Deux variantes (Lot 16) : les cartes viennent du CIMETIÈRE (`zone:
 * "graveyard"`, La Revenante) et celles qu'on ne prend pas y restent ; ou
 * elles retournent AU-DESSUS de la pioche dans l'ordre que le joueur donne
 * (`restTo: "deckTopChosenOrder"`, Ils Étaient Déjà Là) — un panneau sous
 * la rangée les liste, de la future première carte à la dernière, avec de
 * quoi les monter et les descendre.
 */
export function DeckLookPrompt({ choice, onConfirm, onRefuse }: DeckLookPromptProps) {
  const [selected, setSelected] = useState<string[]>([]);
  const sousLaPioche = choice.restTo === "deckBottomChosenOrder";
  const ordonnable = choice.zone !== "graveyard" && (choice.restTo === "deckTopChosenOrder" || sousLaPioche);
  const limite = deckLookTakeLimit(choice);
  // Ordre des cartes remises : celui où elles étaient, tant que le joueur n'y touche pas.
  const [ordre, setOrdre] = useState<string[]>(() => choice.revealed.map((c) => c.instanceId));
  const rendues = ordre.filter((id) => !selected.includes(id));
  const depuisCimetiere = choice.zone === "graveyard";

  function deplacer(instanceId: string, sens: -1 | 1) {
    setOrdre((courant) => {
      const visibles = courant.filter((id) => !selected.includes(id));
      const i = visibles.indexOf(instanceId);
      const j = i + sens;
      if (i < 0 || j < 0 || j >= visibles.length) return courant;
      const echange = [...visibles];
      [echange[i], echange[j]] = [echange[j]!, echange[i]!];
      // Les cartes sélectionnées gardent leur place dans la liste complète : elles ne font que s'en absenter.
      let k = 0;
      return courant.map((id) => (selected.includes(id) ? id : echange[k++]!));
    });
  }
  const confirmer = (ids: string[]) => onConfirm(ids, ordonnable ? ordre.filter((id) => !ids.includes(id)) : undefined);

  const prenable = (instanceId: string) => {
    const carte = choice.revealed.find((c) => c.instanceId === instanceId);
    return carte !== undefined && isDeckLookTakeable(choice, carte);
  };

  /** Ce que le texte demande, pour dire pourquoi une carte ne se prend pas. */
  function raison(card: CardInstance): string | null {
    const refus = deckLookRefusal(choice, card);
    if (refus === "type" && choice.takeGroups) return "Ce texte ne permet pas de prendre une carte de ce type.";
    if (refus === "type") return `Ce texte ne permet de prendre que : ${choice.takeableCardTypes!.map((t) => CARD_TYPE_LABELS[t]).join(", ")}.`;
    if (refus === "archetype") return "Ce texte ne permet de prendre qu'une carte de cette famille.";
    if (refus === "color") return "Ce texte ne permet de prendre qu'une carte de cette couleur.";
    if (refus === "subtype") return "Ce texte ne permet de prendre qu'une carte de ce sous-type.";
    if (refus === "cost") return `Ce texte ne permet de prendre qu'une carte coûtant ${choice.takeableMaxCost} ou moins.`;
    return null;
  }

  function toggle(card: { instanceId: string }) {
    if (!prenable(card.instanceId)) return;
    setSelected((current) => {
      if (current.includes(card.instanceId)) return current.filter((id) => id !== card.instanceId);
      // Une carte de trop chasse la plus ancienne, comme à la défausse :
      // sélectionner reste un geste, jamais une erreur à corriger.
      let next = [...current, card.instanceId];
      // Paniers (Banquet ancestral) : on lâche les plus anciennes tant que la sélection ne tient pas.
      const cartes = (ids: string[]) => ids.map((id) => choice.revealed.find((c) => c.instanceId === id)!);
      while (next.length > 1 && (next.length > limite || !deckLookSelectionFits(choice, cartes(next)))) next = next.slice(1);
      return next;
    });
  }

  const aucunePrenable = choice.revealed.every((c) => !prenable(c.instanceId));
  const complete = selected.length === limite || (choice.refusable && selected.length > 0);

  return (
    <CarouselPromptFrame
      ariaLabel={depuisCimetiere ? "Reprendre une carte de son Cimetière" : "Regarder le dessus de sa pioche"}
      eyebrow={depuisCimetiere ? "Ton Cimetière" : "Dessus de ta pioche"}
      title={limite > 1 ? `Prends jusqu'à ${limite} cartes` : "Prends une carte"}
      description={
        depuisCimetiere
          ? "Les autres restent dans ton Cimetière."
          : ordonnable
            ? aucunePrenable
              ? `Aucune de ces cartes ne correspond : elles retournent toutes ${sousLaPioche ? "sous" : "au-dessus de"} ta pioche, dans l'ordre choisi ci-dessous.`
              : `Les autres retournent ${sousLaPioche ? "sous" : "au-dessus de"} ta pioche, dans l'ordre choisi ci-dessous.`
            : aucunePrenable
              ? "Aucune de ces cartes ne correspond : elles repassent toutes sous ta pioche."
              : "Les autres repassent sous ta pioche, dans l'ordre."
      }
      status={
        selected.length > 0
          ? selected.map((id) => getCardDefinition(choice.revealed.find((c) => c.instanceId === id)!.cardId).name).join(", ")
          : `${selected.length} / ${limite} sélectionnée${limite > 1 ? "s" : ""}`
      }
      actions={
        <>
          {(choice.refusable || aucunePrenable) && (
            <button
              type="button"
              onClick={() => (ordonnable ? confirmer([]) : onRefuse())}
              className="rounded-md px-3 py-2 text-sm text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
            >
              Ne rien prendre
            </button>
          )}
          <button
            type="button"
            disabled={!complete}
            onClick={() => complete && confirmer(selected)}
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
        emptyLabel={depuisCimetiere ? "Ton Cimetière est vide." : "Ta pioche est vide."}
      />
      {ordonnable && rendues.length > 1 && (
        <ol aria-label={sousLaPioche ? "Ordre des cartes remises sous ta pioche" : "Ordre des cartes remises sur ta pioche"} className="mx-auto mt-3 flex max-w-md flex-col gap-1 text-sm text-slate-200">
          {rendues.map((id, index) => {
            const carte = choice.revealed.find((c) => c.instanceId === id)!;
            return (
              <li key={id} className="flex items-center gap-2 rounded bg-white/5 px-2 py-1">
                <span className="w-16 shrink-0 text-xs text-slate-400">{index === 0 ? (sousLaPioche ? "1re dessous" : "Dessus") : `${index + 1}e`}</span>
                <span className="flex-1 truncate">{getCardDefinition(carte.cardId).name}</span>
                <button
                  type="button"
                  aria-label="Monter"
                  disabled={index === 0}
                  onClick={() => deplacer(id, -1)}
                  className="rounded px-2 hover:bg-white/10 disabled:opacity-30"
                >
                  ↑
                </button>
                <button
                  type="button"
                  aria-label="Descendre"
                  disabled={index === rendues.length - 1}
                  onClick={() => deplacer(id, 1)}
                  className="rounded px-2 hover:bg-white/10 disabled:opacity-30"
                >
                  ↓
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </CarouselPromptFrame>
  );
}
