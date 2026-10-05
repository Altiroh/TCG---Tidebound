"use client";

import {
  dieOutcomeOf,
  dieRollOptions,
  getCardDefinition,
  handBreakCost,
  type DieRollChoice,
  type GameState,
  type PlayerAction,
} from "@/game";
import { PromptActions, PromptButton, PromptEffect, PromptEyebrow, PromptQuestion, PromptShell } from "@/features/match/PromptShell";

interface DieRollPromptProps {
  state: GameState;
  choice: DieRollChoice;
  /** `resolveChoice` (garder, relancer, ajuster, valider) ou `breakObject` (une carte Chaîne). */
  onAction: (action: PlayerAction) => void;
}

const ISSUES: Record<ReturnType<typeof dieOutcomeOf>, { label: string; tone: string }> = {
  criticalSuccess: { label: "Réussite critique", tone: "text-amber-300" },
  success: { label: "Réussite", tone: "text-emerald-300" },
  failure: { label: "Échec", tone: "text-white/70" },
  criticalFailure: { label: "Échec critique", tone: "text-rose-300" },
};

function signe(delta: number): string {
  return delta > 0 ? `+${delta}` : `${delta}`;
}

/**
 * JET DE DÉ OUVERT (Lot 17) — la Chaîne. Le moteur ne garde un jet ouvert que
 * si le joueur peut encore le changer (`dieRollOptions`) : garder l'un de deux
 * dés, relancer (Le Donjon de Ladalle), ajuster par une carte en jeu (Miss
 * Franche-Comté 1987), Briser une carte « Chaîne » de sa main ou de son
 * plateau. Les critiques ne se lisent qu'à la fermeture : c'est le joueur qui
 * valide, jamais le moteur à sa place.
 *
 * Le plateau reste visible derrière (pas de voile) : c'est en le regardant
 * qu'on décide de dépenser un Dé pipé.
 */
export function DieRollPrompt({ state, choice, onAction }: DieRollPromptProps) {
  const options = dieRollOptions(state, choice);
  const repondre = (reponse: Extract<PlayerAction, { type: "resolveChoice" }>["choice"]) =>
    onAction({ type: "resolveChoice", playerId: choice.playerId, choice: reponse });
  const source = choice.cardId ? getCardDefinition(choice.cardId).name : null;
  const issue = choice.value !== undefined ? ISSUES[dieOutcomeOf(choice, choice.value)] : null;
  const raison = state.players.find((p) => p.id === choice.playerId)?.reason ?? 0;

  return (
    <PromptShell ariaLabel="Jet de dé en cours" width="wide">
      <div className="flex flex-col items-center gap-3 pt-1">
        <PromptEyebrow>{source ? `Jet de dé — ${source}` : "Jet de dé"}</PromptEyebrow>

        {options.pick && choice.candidates ? (
          <>
            <PromptEffect>Deux D{choice.die} : gardez-en un.</PromptEffect>
            <PromptActions>
              {choice.candidates.map((face, index) => (
                <PromptButton key={index} tone="accept" onClick={() => repondre({ dieKeep: index })}>
                  Garder {face}
                </PromptButton>
              ))}
            </PromptActions>
          </>
        ) : (
          <>
            <p className="font-serif text-5xl font-bold leading-none text-white" aria-live="polite">
              {choice.value}
              <span className="ml-2 text-lg font-semibold text-white/50">/ D{choice.die}</span>
            </p>
            {issue && <p className={`text-sm font-semibold ${issue.tone}`}>{issue.label}</p>}
            <PromptQuestion>
              Réussite à partir de {choice.successAt}. Les critiques ne se jugent qu&apos;à la validation.
            </PromptQuestion>

            {(options.reroll || options.adjusters.length > 0) && (
              <div className="flex flex-wrap items-center justify-center gap-2">
                {options.reroll && (
                  <PromptButton onClick={() => repondre({ dieReroll: true })}>Relancer (Lande)</PromptButton>
                )}
                {options.adjusters.flatMap((unit) => {
                  const nom = getCardDefinition(unit.cardId).name.split(",")[0];
                  return [1, -1].map((delta) => (
                    <PromptButton key={`${unit.instanceId}:${delta}`} onClick={() => repondre({ dieAdjust: { sourceInstanceId: unit.instanceId, delta } })}>
                      {signe(delta)} ({nom})
                    </PromptButton>
                  ));
                })}
              </div>
            )}

            {options.chain.length > 0 && (
              <div className="flex w-full flex-col gap-2">
                <PromptQuestion>Chaîne — Briser :</PromptQuestion>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  {options.chain.flatMap(({ card, fromHand }) => {
                    const def = getCardDefinition(card.cardId);
                    const cout = fromHand ? handBreakCost(def) : 0;
                    const deltas = def.onBreakEffects?.find((e) => e.dieDeltas)?.dieDeltas;
                    const libelle = `${def.name}${fromHand ? ` · ${cout} Raison` : ""}`;
                    const briser = (dieDelta?: number) =>
                      onAction({
                        type: "breakObject",
                        playerId: choice.playerId,
                        instanceId: card.instanceId,
                        ...(fromHand ? { fromHand: true } : {}),
                        ...(dieDelta !== undefined ? { dieDelta } : {}),
                      });
                    if (!deltas?.length) {
                      return [
                        <PromptButton key={card.instanceId} disabled={cout > raison} onClick={() => briser()}>
                          {libelle}
                        </PromptButton>,
                      ];
                    }
                    return deltas.map((delta) => (
                      <PromptButton key={`${card.instanceId}:${delta}`} disabled={cout > raison} onClick={() => briser(delta)}>
                        {libelle} ({signe(delta)})
                      </PromptButton>
                    ));
                  })}
                </div>
              </div>
            )}

            <PromptActions>
              <PromptButton tone="accept" onClick={() => repondre({ dieResolve: true })}>
                Valider le résultat
              </PromptButton>
            </PromptActions>
          </>
        )}
      </div>
    </PromptShell>
  );
}
