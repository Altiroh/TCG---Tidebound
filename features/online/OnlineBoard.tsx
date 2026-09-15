"use client";

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
import { useBoardInteraction } from "@/features/match/useBoardInteraction";
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

function isUnitType(type: string): boolean {
  return (UNIT_CARD_TYPES as readonly string[]).includes(type);
}

/**
 * Plateau d'une partie en ligne (y compris contre le bot arbitré par le
 * serveur), sur le NOUVEAU plateau (`TableBoard`) : "moi" toujours en bas,
 * main adverse cachée, actions envoyées au serveur. L'ancien rendu est
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
  const board = useBoardInteraction({
    liveState,
    viewer: me,
    actorId: myUserId,
    canPlayCards,
    canAct: canPlay,
    act: (action) => {
      onAction(action);
      board.clearSelection();
    },
    interceptDeraison: (instanceId) => deraison.interceptClick(instanceId),
  });
  const { selection } = board;
  const deraison = useDeraisonWarning(state, me, board.draggingId);

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

  /** Envoie une action au serveur, et referme la sélection en cours. */
  function act(action: PlayerAction) {
    onAction(action);
    board.clearSelection();
  }

  /**
   * Sélection multiple de `ReactionPrompt`.
   *
   * Propre à l'écran EN LIGNE : chaque activation est un aller-retour
   * serveur, attendu avant la suivante — là où la partie locale les plie en
   * un seul enchaînement de `dispatch`. C'est la seule raison pour laquelle
   * ce geste n'est pas dans `useBoardInteraction`.
   */
  async function activateSelectedReactions(selected: PendingReactionCandidate[]) {
    for (const candidate of selected.filter((c) => !c.needsTarget)) {
      await onAction({ type: "activateReaction", playerId: myUserId, sourceInstanceId: candidate.sourceInstanceId, abilityIndex: candidate.abilityIndex });
    }
    board.beginReactionTargeting(selected.filter((c) => c.needsTarget));
  }

  /** Cible désignée : le hook traite tout sauf les réactions, qu'il remonte pour qu'on les envoie au serveur. */
  async function handleAnyBoardCardClick(instanceId: string, ownerId: PlayerId) {
    const reaction = board.resolveBoardCardClick(instanceId, ownerId);
    if (!reaction) return;
    await onAction(reaction);
    board.beginReactionTargeting(board.reactionQueue);
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

  // Objets d'invite en constantes locales : `board.breakPrompt` ne se
  // rétrécit pas à travers une fermeture, une constante si.
  const { breakPrompt, graveyardPick, detailInstance, graveyardViewerPlayerId } = board;

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
        onCancelHint={board.clearSelection}
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
        onMenu={() => board.setShowPauseMenu(true)}
        onHandCardClick={(id) => board.handleHandCardClick(id)}
        onPlayCard={(instanceId, targetInstanceId) => {
          if (targetInstanceId) act({ type: "playCard", playerId: myUserId, instanceId, targetInstanceId });
          else board.handleHandCardClick(instanceId, true);
        }}
        onAttack={(attackerInstanceId, defenderInstanceId) => act({ type: "attack", playerId: myUserId, attackerInstanceId, defenderInstanceId })}
        onBreakOnTarget={(instanceId, targetInstanceId) => act({ type: "breakObject", playerId: myUserId, instanceId, targetInstanceId })}
        onDropOnGraveyard={board.handleDropOnGraveyard}
        onBoardCardClick={(instanceId, ownerId) => void handleAnyBoardCardClick(instanceId, ownerId)}
        onShipClick={() => selection?.kind === "attack" && act({ type: "attack", playerId: myUserId, attackerInstanceId: selection.attackerId })}
        onInspect={board.setDetailInstance}
        onOpenGraveyard={board.setGraveyardViewerPlayerId}
        onHandDragChange={board.setDraggingId}
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
          onBreak={() => board.requestBreak(breakPrompt.card, breakPrompt.source === "hand")}
          onScuttle={
            breakPrompt.source === "board"
              ? () => {
                  board.setBreakPrompt(null);
                  act({ type: "saborder", playerId: myUserId, instanceId: breakPrompt.card.instanceId });
                }
              : undefined
          }
          onCancel={() => board.setBreakPrompt(null)}
        />
      )}
      {graveyardPick && (
        <GraveyardPickPrompt
          sourceCardId={graveyardPick.card.cardId}
          choices={graveyardChoicesForBreak(state, myUserId, getCardDefinition(graveyardPick.card.cardId))}
          onConfirm={(chosen) => {
            board.setGraveyardPick(null);
            act({
              type: "breakObject",
              playerId: myUserId,
              instanceId: graveyardPick.card.instanceId,
              fromHand: graveyardPick.fromHand,
              chosenGraveyardInstanceId: chosen.instanceId,
            });
          }}
          onCancel={() => board.setGraveyardPick(null)}
        />
      )}
      {graveyardViewerPlayerId && (
        <GraveyardViewer
          playerLabel={graveyardViewerPlayerId === myUserId ? "Toi" : "Adversaire"}
          cards={state.players.find((p) => p.id === graveyardViewerPlayerId)!.graveyard}
          onClose={() => board.setGraveyardViewerPlayerId(null)}
          onInspect={board.setDetailInstance}
        />
      )}
      {detailInstance && (
        <CardDetailModal
          instance={detailInstance}
          tideState={state.environment.tideState}
          boardUnits={state.players.flatMap((p) => p.board)}
          auraContext={auraContextFor(me.board.some((u) => u.instanceId === detailInstance.instanceId) ? me : opponent)}
          onClose={() => board.setDetailInstance(null)}
        />
      )}
      {board.showPauseMenu && (
        <MatchPauseMenu
          onResume={() => board.setShowPauseMenu(false)}
          concedePending={pending}
          // Pas de sortie discrète en ligne : un adversaire attend en face — on abandonne, ou on reprend.
          onConcede={() => {
            void Promise.resolve(onAction({ type: "concede", playerId: myUserId })).finally(() => board.setShowPauseMenu(false));
          }}
        />
      )}
    </>
  );
}
