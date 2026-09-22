"use client";

import { getCardDefinition, type PendingChoice, type ResolveChoiceAction } from "@/game";
import { PromptActions, PromptButton, PromptEffect, PromptEyebrow, PromptQuestion, PromptShell } from "@/features/match/PromptShell";

interface PendingChoicePromptProps {
  choice: PendingChoice;
  onChoose: (choice: ResolveChoiceAction["choice"]) => void;
}

/**
 * Choix en attente (`GameState.pendingChoice`) — même verre et mêmes
 * pastilles que la fenêtre de réaction (`PromptShell`), puisque c'est la
 * même sorte de question. Pas de croix de fermeture : on répond par les
 * boutons, et `dispatch` refuse toute autre action tant que le choix est
 * ouvert.
 *
 * Deux formes, qui ne se refusent pas de la même façon :
 * - « choisissez : A ou B » d'une capacité (ex. Horloge de Marée au
 *   Sabordage) se DÉCLINE — « le joueur peut choisir de ne pas appliquer un
 *   effet » (décision du 17/09/2026) ;
 * - le choix binaire d'une Anomalie (ex. Le Fond Vous Regarde, « perdre X
 *   Raison ou infliger X dégâts d'Ancrage à son propre Navire ») s'IMPOSE :
 *   son texte ne laisse pas sortir, et le moteur refuse « pass ».
 */
export function PendingChoicePrompt({ choice, onChoose }: PendingChoicePromptProps) {
  if (choice.kind === "abilityOption") {
    const def = getCardDefinition(choice.cardId);
    return (
      <PromptShell ariaLabel={`Choisir un effet de ${def.name}`}>
        <div className="flex flex-col items-center gap-3 pt-1">
          <PromptEyebrow>{def.name}</PromptEyebrow>
          <PromptEffect>Choisissez l&apos;effet à appliquer</PromptEffect>
          <PromptActions>
            {choice.abilityIndexes.map((abilityIndex, position) => (
              <PromptButton
                key={abilityIndex}
                tone={position === 0 ? "accept" : "neutral"}
                onClick={() => onChoose({ abilityIndex })}
              >
                {def.abilities?.[abilityIndex]?.description ?? `Option ${position + 1}`}
              </PromptButton>
            ))}
            {/* Refuser reste une réponse : rien ne se résout. */}
            <PromptButton tone="neutral" onClick={() => onChoose("pass")}>
              Ne rien appliquer
            </PromptButton>
          </PromptActions>
        </div>
      </PromptShell>
    );
  }

  // La défausse au choix et le regard de pioche ont leurs propres écrans
  // (`HandDiscardPrompt`, `DeckLookPrompt`) : ils ne se répondent pas par un
  // bouton mais en désignant des cartes.
  if (
    choice.kind === "handDiscard" ||
    choice.kind === "deckLook" ||
    choice.kind === "healAllocation" ||
    choice.kind === "keepUnits" ||
    choice.kind === "pickUnits"
  ) {
    return null;
  }

  return (
    <PromptShell ariaLabel="Un choix s'impose à vous">
      <div className="flex flex-col items-center gap-3 pt-1">
        <PromptEyebrow>Un choix s&apos;impose à vous</PromptEyebrow>
        <PromptQuestion>Les deux coûtent quelque chose : à vous de dire lequel.</PromptQuestion>
        <PromptActions>
          <PromptButton tone="accept" onClick={() => onChoose("reasonLoss")}>
            Perdre {choice.reasonLossAmount} Raison
          </PromptButton>
          <PromptButton tone="danger" onClick={() => onChoose("anchorDamage")}>
            {choice.anchorDamageAmount} dégât{choice.anchorDamageAmount > 1 ? "s" : ""} d&apos;Ancrage
          </PromptButton>
        </PromptActions>
      </div>
    </PromptShell>
  );
}
