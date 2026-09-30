"use client";

import { useState } from "react";
import { getCardDefinition, type CardInstance, type HandDiscardChoice } from "@/game";
import { CardCarousel } from "@/features/match/CardCarousel";
import { CarouselPromptFrame } from "@/features/match/CarouselPromptFrame";

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
  // « jusqu'à N » : n'importe quelle quantité jusqu'au plafond convient,
  // là où un compte exact n'est atteint qu'au dernier clic.
  const complete = choice.atMost ? selected.length > 0 : selected.length === choice.count;
  // Sous la pioche, ce n'est pas une défausse : ni le titre, ni la phrase,
  // ni le bouton ne doivent le dire.
  const versPioche = choice.destination === "deckBottom";

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
    <CarouselPromptFrame
      ariaLabel="Choisir les cartes à défausser"
      eyebrow={source ? getCardDefinition(source.cardId).name : undefined}
      title={
        versPioche
          ? choice.count > 1
            ? `Choisis jusqu'à ${choice.count} cartes à remettre`
            : "Choisis la carte à remettre"
          : choice.count > 1
            ? `Choisis ${choice.count} cartes à défausser`
            : "Choisis la carte à défausser"
      }
      description={
        versPioche
          ? choice.drawBackAfterwards
            ? "Elles repassent sous ta pioche, et tu en repioches autant."
            : "Elles repassent sous ta pioche."
          : "Elles rejoignent ton Cimetière."
      }
      status={
        selected.length > 0
          ? selected.map((id) => getCardDefinition(hand.find((c) => c.instanceId === id)!.cardId).name).join(", ")
          : `${selected.length} / ${choice.count} sélectionnée${choice.count > 1 ? "s" : ""}`
      }
      actions={
        <>
          {choice.refusable && (
            <button
              type="button"
              onClick={onRefuse}
              className="rounded-md px-3 py-2 text-sm text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
            >
              {versPioche ? "Ne rien remettre" : "Ne rien défausser"}
            </button>
          )}
          <button
            type="button"
            disabled={!complete}
            onClick={() => complete && onConfirm(selected)}
            className="rounded-md bg-sky-600/80 px-4 py-2 text-sm font-semibold text-white shadow-[inset_0_0_0_1px_rgba(125,211,252,0.4)] transition-colors hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {versPioche ? "Remettre" : "Défausser"}
          </button>
        </>
      }
    >
      <CardCarousel cards={hand} selectedInstanceIds={selected} onSelect={toggle} emptyLabel="Ta main est vide." />
    </CarouselPromptFrame>
  );
}
