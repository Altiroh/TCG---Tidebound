"use client";

import { useEffect, useState } from "react";
import {
  computeEffectiveStats,
  eligibleCandidatesFor,
  getCardDefinition,
  getShipDefinition,
  graveyardChoicesForBreak,
  isMainPhase,
  previewHandBreakReason,
  UNIT_CARD_TYPES,
  type CardInstance,
  type GameState,
  type PendingReactionCandidate,
  type PlayerAction,
  type PlayerId,
} from "@/game";
import { GlassAlert } from "@/components/ui/GlassAlert";
import { ActionToastStack } from "@/features/match/ActionToastStack";
import { CardDetailModal } from "@/features/match/CardDetailModal";
import { EventFeed } from "@/features/match/EventFeed";
import { GraveyardPickPrompt } from "@/features/match/GraveyardPickPrompt";
import { GraveyardViewer } from "@/features/match/GraveyardViewer";
import { MatchEndScreen } from "@/features/match/MatchEndScreen";
import { MatchPauseMenu } from "@/features/match/MatchPauseMenu";
import { needsPlayTarget } from "@/features/match/needsPlayTarget";
import { ObjectBreakPrompt } from "@/features/match/ObjectBreakPrompt";
import { PendingChoicePrompt } from "@/features/match/PendingChoicePrompt";
import { PhaseBanner } from "@/features/match/PhaseBanner";
import { ReactionPrompt } from "@/features/match/ReactionPrompt";
import { reactionTargetHint } from "@/features/match/reactionTargetHint";
import { TableBoard } from "@/features/match/table/TableBoard";
import { phaseButtonFor, phaseTitle, targetingHint } from "@/features/match/table/tableLabels";
import { useActionToasts } from "@/features/match/useActionToasts";
import { useAttackPresentation } from "@/features/match/useAttackPresentation";
import { useDeraisonWarning } from "@/features/match/useDeraisonWarning";
import { useDisplayNames } from "@/features/match/useDisplayNames";
import { usePhaseBannerEvent } from "@/features/match/usePhaseBannerEvent";
import { playButtonClick } from "@/lib/sound";

interface OnlineBoardProps {
  state: GameState;
  myUserId: PlayerId;
  /** `OnlineMatch.handleAction` est asynchrone (aller-retour serveur) — attendu séquentiellement lors d'une
      activation multiple de réactions (`activateSelectedReactions`). */
  onAction: (action: PlayerAction) => void | Promise<void>;
  pending: boolean;
  error: string | null;
  onDismissError: () => void;
  /** Désignation de l'adversaire ("L'adversaire", "Le bot"). */
  opponentName?: string;
  /** Destination du bouton de sortie de l'écran de fin. */
  exitHref?: string;
  /** Partie arbitrée : l'écran de fin y lit le relevé de quêtes. */
  matchId?: string;
}

type Selection =
  | { kind: "playCard"; instanceId: string; needsTarget: boolean }
  | { kind: "attack"; attackerId: string }
  | { kind: "break"; instanceId: string; needsTarget: boolean; fromHand?: boolean }
  | { kind: "reaction"; sourceInstanceId: string; abilityIndex: number; needsTarget: boolean };

function isUnitType(type: string): boolean {
  return (UNIT_CARD_TYPES as readonly string[]).includes(type);
}

/**
 * Plateau d'une partie en ligne (y compris contre le bot arbitré par le
 * serveur), sur le NOUVEAU plateau (`TableBoard`) : "moi" toujours en bas,
 * main adverse cachée, actions envoyées au serveur. L'ancien rendu est
 * conservé dans `features/online/legacy/OnlineBoardLegacy.tsx`
 * (`?plateau=ancien`).
 */
export function OnlineBoard({
  state: liveState,
  myUserId,
  onAction,
  pending,
  error,
  onDismissError,
  opponentName = "L'adversaire",
  exitHref = "/en-ligne",
  matchId,
}: OnlineBoardProps) {
  // `state` = état AFFICHÉ, retenu avant le choc pendant une attaque (cf. `useAttackPresentation`).
  const { displayState: state, attacks } = useAttackPresentation(liveState);
  const [selection, setSelection] = useState<Selection | null>(null);
  /** Carte de main en cours de glisser : l'avertissement de Déraison s'affiche pendant tout le glisser. */
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [graveyardViewerPlayerId, setGraveyardViewerPlayerId] = useState<PlayerId | null>(null);
  const [detailInstance, setDetailInstance] = useState<CardInstance | null>(null);
  const [breakPrompt, setBreakPrompt] = useState<{ card: CardInstance; source: "hand" | "board" } | null>(null);
  const [graveyardPick, setGraveyardPick] = useState<{ card: CardInstance; fromHand: boolean } | null>(null);
  const [reactionQueue, setReactionQueue] = useState<PendingReactionCandidate[]>([]);
  const [showPauseMenu, setShowPauseMenu] = useState(false);

  useEffect(() => {
    const overlayOpen = Boolean(detailInstance || graveyardViewerPlayerId || breakPrompt || graveyardPick);
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (overlayOpen) return;
      setShowPauseMenu((current) => !current);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [detailInstance, graveyardViewerPlayerId, breakPrompt, graveyardPick]);

  const me = state.players.find((p) => p.id === myUserId)!;
  const opponent = state.players.find((p) => p.id !== myUserId)!;
  const displayNames = useDisplayNames([me.id, opponent.id]);
  const myShip = getShipDefinition(me.shipId);
  const isMyTurn = state.activePlayerId === myUserId;
  const canRespondToReaction = state.pendingReaction?.awaitingPlayerId === myUserId;
  const canPlay = isMyTurn && !pending && !state.pendingReaction && !state.pendingChoice;
  const canPlayCards = canPlay && isMainPhase(state.phase);
  const canAttack = canPlay && state.phase === "combatPhase";
  const activePlayerBoard = state.players.find((p) => p.id === state.activePlayerId)?.board ?? [];
  const hasAnyAttacker = activePlayerBoard.some((unit) => {
    const def = getCardDefinition(unit.cardId);
    return isUnitType(def.type) && !unit.summoningSick && !unit.hasAttackedThisTurn && !computeEffectiveStats(unit, state.environment.tideState).inactive;
  });
  const myReactionCandidates = canRespondToReaction
    ? eligibleCandidatesFor(state, state.pendingReaction!.events, myUserId, state.pendingReaction!.turnNumber, state.pendingReaction!.usedCandidateKeys)
    : [];

  const auraContextFor = (player: typeof me) => ({
    controllerBoard: player.board,
    controllerReason: player.reason,
    tideOrientation: state.environment.tideOrientation,
  });
  const bannerEvent = usePhaseBannerEvent(state);
  const actionToasts = useActionToasts(state);
  const deraison = useDeraisonWarning(state, me, draggingId);

  const bannerText = bannerEvent
    ? bannerEvent.kind === "combatPhase"
      ? "Phase de combat"
      : bannerEvent.kind === "mainPhase2"
        ? "Phase principale 2"
      : bannerEvent.playerId === myUserId
        ? "Ton tour"
        : "Tour de l'adversaire"
    : null;
  // Court : il tient sous « Tour N » dans la colonne, même en mobile.
  const opponentLabel = opponentName === "Le bot" ? "Au bot" : "Adversaire";

  function clearSelection() {
    setSelection(null);
    setReactionQueue([]);
  }

  function act(action: PlayerAction) {
    onAction(action);
    clearSelection();
  }

  /** Sélection multiple de `ReactionPrompt` : chaque action fait un aller-retour serveur, attendu avant la suivante. */
  async function activateSelectedReactions(selected: PendingReactionCandidate[]) {
    const immediate = selected.filter((c) => !c.needsTarget);
    const queued = selected.filter((c) => c.needsTarget);
    for (const candidate of immediate) {
      await onAction({ type: "activateReaction", playerId: myUserId, sourceInstanceId: candidate.sourceInstanceId, abilityIndex: candidate.abilityIndex });
    }
    const [first, ...rest] = queued;
    if (first) {
      setSelection({ kind: "reaction", sourceInstanceId: first.sourceInstanceId, abilityIndex: first.abilityIndex, needsTarget: true });
      setReactionQueue(rest);
    } else {
      clearSelection();
    }
  }

  function handleHandCardClick(instanceId: string, confirmed = false) {
    if (!canPlayCards) return;
    const card = me.hand.find((c) => c.instanceId === instanceId);
    if (!card) return;
    if (!confirmed && deraison.interceptClick(instanceId)) return;
    if (selection?.kind === "playCard" && selection.instanceId === instanceId) {
      clearSelection();
      return;
    }
    const needsTarget = needsPlayTarget(getCardDefinition(card.cardId), me.board);
    if (needsTarget) setSelection({ kind: "playCard", instanceId, needsTarget: true });
    else act({ type: "playCard", playerId: myUserId, instanceId });
  }

  async function handleAnyBoardCardClick(instanceId: string, ownerId: PlayerId) {
    if (selection?.kind === "reaction" && selection.needsTarget) {
      await onAction({
        type: "activateReaction",
        playerId: myUserId,
        sourceInstanceId: selection.sourceInstanceId,
        abilityIndex: selection.abilityIndex,
        targetInstanceId: instanceId,
      });
      const [next, ...rest] = reactionQueue;
      if (next) {
        setSelection({ kind: "reaction", sourceInstanceId: next.sourceInstanceId, abilityIndex: next.abilityIndex, needsTarget: true });
        setReactionQueue(rest);
      } else {
        clearSelection();
      }
      return;
    }
    if (!canPlay) return;
    if (selection?.kind === "playCard" && selection.needsTarget) {
      act({ type: "playCard", playerId: myUserId, instanceId: selection.instanceId, targetInstanceId: instanceId });
      return;
    }
    if (selection?.kind === "break" && selection.needsTarget) {
      act({ type: "breakObject", playerId: myUserId, instanceId: selection.instanceId, targetInstanceId: instanceId, fromHand: selection.fromHand });
      return;
    }
    if (selection?.kind === "attack" && ownerId !== myUserId) {
      act({ type: "attack", playerId: myUserId, attackerInstanceId: selection.attackerId, defenderInstanceId: instanceId });
    }
  }

  /** Cf. `MatchBoard.requestBreak` : cible ou carte de défausse à choisir d'abord si l'effet en demande une. */
  function requestBreak(card: CardInstance, fromHand: boolean) {
    setBreakPrompt(null);
    const def = getCardDefinition(card.cardId);
    if ((def.onBreakEffects ?? []).some((e) => e.target.kind === "chosenUnit")) {
      setSelection({ kind: "break", instanceId: card.instanceId, needsTarget: true, fromHand });
      return;
    }
    if (graveyardChoicesForBreak(state, myUserId, def).length > 0) {
      setGraveyardPick({ card, fromHand });
      return;
    }
    act({ type: "breakObject", playerId: myUserId, instanceId: card.instanceId, fromHand });
  }

  function handleDropOnGraveyard(instanceId: string, from: "hand" | "board") {
    const zone = from === "hand" ? me.hand : me.board;
    const card = zone.find((c) => c.instanceId === instanceId);
    if (!card) return;
    if (getCardDefinition(card.cardId).type === "objet") {
      setBreakPrompt({ card, source: from });
      return;
    }
    if (from === "board") act({ type: "saborder", playerId: myUserId, instanceId });
  }

  if (state.status === "finished") {
    const iWon = state.winnerId === myUserId;
    return (
      <MatchEndScreen
        outcome={iWon ? "victory" : "defeat"}
        // Toujours le joueur qui regarde, jamais le vainqueur : il se reconnaît sur la plaque, avec son propre Navire.
        player={state.winnerId ? { name: displayNames[myUserId] ?? "Toi", ship: myShip } : undefined}
        exitHref={exitHref}
        matchId={matchId}
      />
    );
  }

  const phase = phaseButtonFor({ isMyTurn, phase: state.phase === "mainPhase" && !hasAnyAttacker ? "mainPhase2" : state.phase });
  const hint = targetingHint(selection?.kind === "reaction" ? null : selection?.kind ?? null);

  return (
    <>
      <TableBoard
        state={state}
        viewerId={myUserId}
        turnOwnerLabel={isMyTurn ? "À toi" : opponentLabel}
        attacks={attacks}
        journal={
          <EventFeed
            variant="rail"
            state={state}
            playerLabel={(id) => (id === myUserId ? (displayNames[id] ?? "Toi") : id ? (displayNames[id] ?? opponentName) : "?")}
          />
        }
        canPlayCards={canPlayCards}
        canAttack={canAttack}
        targeting={
          selection
            ? {
                kind: selection.kind,
                sourceInstanceId: selection.kind === "attack" ? selection.attackerId : selection.kind === "reaction" ? selection.sourceInstanceId : selection.instanceId,
              }
            : null
        }
        reactionSourceIds={myReactionCandidates.map((c) => c.sourceInstanceId)}
        hint={hint}
        onCancelHint={clearSelection}
        phaseButton={{
          label: phase.label,
          // La phase EN COURS, pas celle vers laquelle le bouton mène :
          // c'est ce que l'icône ne dit pas.
          phaseLabel: phaseTitle(state.phase),
          icon: phase.icon,
          disabled: !canPlay,
          onClick: () => {
            playButtonClick();
            if (phase.action === "advance") act({ type: "advancePhase", playerId: myUserId });
            else if (phase.action === "endTurn") act({ type: "endTurn", playerId: myUserId });
          },
        }}
        onMenu={() => setShowPauseMenu(true)}
        onHandCardClick={(id) => handleHandCardClick(id)}
        onPlayCard={(instanceId, targetInstanceId) => {
          if (targetInstanceId) act({ type: "playCard", playerId: myUserId, instanceId, targetInstanceId });
          else handleHandCardClick(instanceId, true);
        }}
        onAttack={(attackerInstanceId, defenderInstanceId) => act({ type: "attack", playerId: myUserId, attackerInstanceId, defenderInstanceId })}
        onBreakOnTarget={(instanceId, targetInstanceId) => act({ type: "breakObject", playerId: myUserId, instanceId, targetInstanceId })}
        onDropOnGraveyard={handleDropOnGraveyard}
        onBoardCardClick={(instanceId, ownerId) => void handleAnyBoardCardClick(instanceId, ownerId)}
        onShipClick={() => selection?.kind === "attack" && act({ type: "attack", playerId: myUserId, attackerInstanceId: selection.attackerId })}
        onInspect={setDetailInstance}
        onOpenGraveyard={setGraveyardViewerPlayerId}
        onHandDragChange={setDraggingId}
      />

      {canRespondToReaction && myReactionCandidates.length > 0 && !(selection?.kind === "reaction" && selection.needsTarget) && (
        <ReactionPrompt candidates={myReactionCandidates} onActivateMany={activateSelectedReactions} onPass={() => act({ type: "passReaction", playerId: myUserId })} />
      )}
      {selection?.kind === "reaction" && selection.needsTarget && (
        <div className="fixed left-1/2 top-6 z-[70] -translate-x-1/2 rounded-full border border-white/25 bg-slate-950/80 px-4 py-2 text-xs text-slate-200 backdrop-blur-md">
          {reactionTargetHint([...me.board, ...opponent.board].find((u) => u.instanceId === selection.sourceInstanceId)?.cardId, selection.abilityIndex)}
        </div>
      )}
      {state.pendingChoice?.playerId === myUserId && (
        <PendingChoicePrompt
          reasonLossAmount={state.pendingChoice.reasonLossAmount}
          anchorDamageAmount={state.pendingChoice.anchorDamageAmount}
          onChoose={(choice) => act({ type: "resolveChoice", playerId: myUserId, choice })}
        />
      )}

      <ActionToastStack toasts={actionToasts} />
      {error ? (
        <GlassAlert message={error} severity="error" onDismiss={onDismissError} />
      ) : (
        <GlassAlert message={deraison.warning} severity="warning" onDismiss={deraison.dismiss} />
      )}
      <PhaseBanner text={bannerText} bannerKey={bannerEvent?.id ?? null} />
      {breakPrompt && (
        <ObjectBreakPrompt
          card={breakPrompt.card}
          source={breakPrompt.source}
          handCost={breakPrompt.source === "hand" ? previewHandBreakReason(state, myUserId, breakPrompt.card.instanceId) : undefined}
          onBreak={() => requestBreak(breakPrompt.card, breakPrompt.source === "hand")}
          onScuttle={
            breakPrompt.source === "board"
              ? () => {
                  setBreakPrompt(null);
                  act({ type: "saborder", playerId: myUserId, instanceId: breakPrompt.card.instanceId });
                }
              : undefined
          }
          onCancel={() => setBreakPrompt(null)}
        />
      )}
      {graveyardPick && (
        <GraveyardPickPrompt
          sourceCardId={graveyardPick.card.cardId}
          choices={graveyardChoicesForBreak(state, myUserId, getCardDefinition(graveyardPick.card.cardId))}
          onConfirm={(chosen) => {
            setGraveyardPick(null);
            act({
              type: "breakObject",
              playerId: myUserId,
              instanceId: graveyardPick.card.instanceId,
              fromHand: graveyardPick.fromHand,
              chosenGraveyardInstanceId: chosen.instanceId,
            });
          }}
          onCancel={() => setGraveyardPick(null)}
        />
      )}
      {graveyardViewerPlayerId && (
        <GraveyardViewer
          playerLabel={graveyardViewerPlayerId === myUserId ? "Toi" : "Adversaire"}
          cards={state.players.find((p) => p.id === graveyardViewerPlayerId)!.graveyard}
          onClose={() => setGraveyardViewerPlayerId(null)}
        />
      )}
      {detailInstance && (
        <CardDetailModal
          instance={detailInstance}
          tideState={state.environment.tideState}
          boardUnits={state.players.flatMap((p) => p.board)}
          auraContext={auraContextFor(me.board.some((u) => u.instanceId === detailInstance.instanceId) ? me : opponent)}
          onClose={() => setDetailInstance(null)}
        />
      )}
      {showPauseMenu && (
        <MatchPauseMenu
          onResume={() => setShowPauseMenu(false)}
          concedePending={pending}
          // Pas de sortie discrète en ligne : un adversaire attend en face — on abandonne, ou on reprend.
          onConcede={() => {
            void Promise.resolve(onAction({ type: "concede", playerId: myUserId })).finally(() => setShowPauseMenu(false));
          }}
        />
      )}
    </>
  );
}
