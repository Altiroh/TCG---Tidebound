"use client";

import { useEffect } from "react";
import { getCardDefinition, type CardInstance } from "@/game";
import { CardTile } from "@/features/match/CardTile";
import { PromptActions, PromptButton, PromptEffect, PromptEyebrow, PromptQuestion, PromptShell } from "@/features/match/PromptShell";

interface ObjectBreakPromptProps {
  card: CardInstance;
  /** "hand" : Bris depuis la main (coût réduit). "board" : Objet posé — le Sabordage reste proposé en alternative. */
  source: "hand" | "board";
  /** Coût réellement dû et Raison résultante (`previewHandBreakReason`) — taxe adverse comprise. */
  handCost?: { cost: number; reasonAfter: number; allowed: boolean };
  onBreak: () => void;
  onScuttle?: () => void;
  onCancel: () => void;
}

/**
 * Confirmation ouverte quand un Objet est glissé sur le crâne (retour de test
 * du 13/09) : on demande si l'on veut ACTIVER son effet de bris, plutôt que
 * de le défausser ou de le saborder en silence — un Sabordage ne résout jamais
 * l'effet de bris ("Briser ≠ Saborder").
 *
 * Même verre et mêmes pastilles que la fenêtre de réaction
 * (`PromptShell`, retour de test du 17/09) ; le fond s'assombrit ici, parce
 * que c'est un geste du joueur qui ouvre cette demande et qu'elle attend une
 * réponse avant de rendre le plateau.
 */
export function ObjectBreakPrompt({ card, source, handCost, onBreak, onScuttle, onCancel }: ObjectBreakPromptProps) {
  const def = getCardDefinition(card.cardId);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        onCancel();
      }
    }
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [onCancel]);

  const blocked = source === "hand" && handCost !== undefined && !handCost.allowed;
  const deraison = handCost !== undefined && handCost.allowed && handCost.reasonAfter < 0;

  return (
    <PromptShell ariaLabel={`Briser ${def.name}`} onClose={onCancel} closeLabel="Annuler" width="wide" dim>
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start sm:text-left">
        <div className="pointer-events-none mx-auto w-36 shrink-0">
          <CardTile instance={card} tideState="calme" widthClassName="w-36" scaleOnHover={false} badgeSize={38} />
        </div>

        <div className="flex flex-1 flex-col items-center gap-3 sm:items-start">
          <PromptEyebrow>{source === "hand" ? "Briser depuis la main" : "Objet sur le plateau"}</PromptEyebrow>
          {def.text && <PromptEffect>{def.text}</PromptEffect>}
          <PromptQuestion>Activer l&apos;effet de bris de {def.name} ?</PromptQuestion>

          {handCost && handCost.cost > 0 && (
            <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-[11px] font-medium text-white/70">
              {handCost.cost} Raison
            </span>
          )}
          {deraison && (
            <PromptQuestion>
              Ta Raison passera à {handCost!.reasonAfter} : tu entreras en Déraison.
            </PromptQuestion>
          )}
          {blocked && <p className="text-xs leading-snug text-rose-300">Pas assez de Raison pour briser cet Objet depuis la main.</p>}
          {source === "board" && <PromptQuestion>Saborder l&apos;envoie au cimetière sans résoudre son effet.</PromptQuestion>}

          <PromptActions>
            <PromptButton tone="accept" onClick={onBreak} disabled={blocked}>
              Briser et activer
            </PromptButton>
            {onScuttle && (
              <PromptButton tone="danger" onClick={onScuttle}>
                Saborder sans effet
              </PromptButton>
            )}
            <PromptButton onClick={onCancel}>Annuler</PromptButton>
          </PromptActions>
        </div>
      </div>
    </PromptShell>
  );
}
