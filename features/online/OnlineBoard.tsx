"use client";

import {
  canUnitAttack,
  eligibleCandidatesFor,
  getShipDefinition,
  graveyardChoicesForBreak,
  isMainPhase,
  previewBreakReason,
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
import { AssemblagePrompt } from "@/features/match/AssemblagePrompt";
import { GraveyardViewer } from "@/features/match/GraveyardViewer";
import { MatchEndScreen } from "@/features/match/MatchEndScreen";
import { MatchPauseMenu } from "@/features/match/MatchPauseMenu";
import { ObjectBreakPrompt } from "@/features/match/ObjectBreakPrompt";
import { ShipAbilityPrompt } from "@/features/match/ShipAbilityPrompt";
import { PendingChoicePrompt } from "@/features/match/PendingChoicePrompt";
import { graveyardPickView } from "@/features/match/graveyardPickRequest";
import { DeckLookPrompt } from "@/features/match/DeckLookPrompt";
import { HealAllocationPrompt } from "@/features/match/HealAllocationPrompt";
import { KeepUnitsPrompt } from "@/features/match/KeepUnitsPrompt";
import { PickUnitsPrompt } from "@/features/match/PickUnitsPrompt";
import { HandDiscardPrompt } from "@/features/match/HandDiscardPrompt";
import { PhaseBanner } from "@/features/match/PhaseBanner";
import { ReactionPrompt } from "@/features/match/ReactionPrompt";
import { ShipWindowHint } from "@/features/match/ShipWindowHint";
import { TurnTimerBadge } from "@/features/match/TurnTimerBadge";
import { reactionTargetHint } from "@/features/match/reactionTargetHint";
import { TableBoard } from "@/features/match/table/TableBoard";
import { phaseButtonFor, phaseTitle, targetingHint } from "@/features/match/table/tableLabels";
import { useActionToasts } from "@/features/match/useActionToasts";
import { useAttackPresentation } from "@/features/match/useAttackPresentation";
import { useDeraisonWarning } from "@/features/match/useDeraisonWarning";
import { useDisplayNames } from "@/features/match/useDisplayNames";
import { usePhaseBannerEvent } from "@/features/match/usePhaseBannerEvent";
import { tableTargetingFor, useBoardInteraction } from "@/features/match/useBoardInteraction";
import { useShipAbility } from "@/features/match/useShipAbility";
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
  const { displayState: state, attacks, volleys } = useAttackPresentation(liveState);
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
  const hasAnyAttacker = activePlayerBoard.some((unit) => canUnitAttack(state, state.activePlayerId, unit.instanceId));
  const myReactionCandidates = canRespondToReaction
    ? eligibleCandidatesFor(state, state.pendingReaction!.events, myUserId, state.pendingReaction!.turnNumber, state.pendingReaction!.usedCandidateKeys)
    : [];

  const auraContextFor = (player: typeof me) => ({
    controllerBoard: player.board,
    controllerReason: player.reason,
    tideOrientation: state.environment.tideOrientation,
    // Signal Rouge (Lot 15) : un bonus « pendant votre tour ».
    controllerIsActive: state.activePlayerId === player.id,
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
  const shipAbility = useShipAbility({
    liveState,
    viewerId: myUserId,
    actorId: myUserId,
    act: act,
    selection: selection,
    setSelection: board.setSelection,
  });

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
    for (const candidate of selected.filter((c) => !c.needsTarget && !c.needsGraveyardTarget)) {
      await onAction({ type: "activateReaction", playerId: myUserId, sourceInstanceId: candidate.sourceInstanceId, abilityIndex: candidate.abilityIndex });
    }
    // Une seule question de Cimetière à la fois : la première capacité qui
    // la pose ouvre l'écran, les suivantes attendront la prochaine fenêtre.
    const graveyardFirst = selected.find((c) => !c.needsTarget && c.needsGraveyardTarget);
    if (graveyardFirst) {
      board.setGraveyardPick({ kind: "reaction", candidate: graveyardFirst });
      return;
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
        volleys={volleys}
        journal={
          <EventFeed
            variant="rail"
            state={state}
            playerLabel={(id) => (id === myUserId ? (displayNames[id] ?? "Toi") : id ? (displayNames[id] ?? opponentName) : "?")}
          />
        }
        canPlayCards={canPlayCards}
        canAttack={canAttack}
        targeting={tableTargetingFor(selection)}
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
        onPlayCard={(instanceId, targetInstanceId, boardIndex) => {
          if (targetInstanceId) act({ type: "playCard", playerId: myUserId, instanceId, targetInstanceId, boardIndex });
          else board.handleHandCardClick(instanceId, true, boardIndex);
        }}
        onAttack={(attackerInstanceId, defenderInstanceId) => act({ type: "attack", playerId: myUserId, attackerInstanceId, defenderInstanceId })}
        onBreakOnTarget={(instanceId, targetInstanceId) => act({ type: "breakObject", playerId: myUserId, instanceId, targetInstanceId })}
        onDropOnGraveyard={board.handleDropOnGraveyard}
        onBoardCardClick={(instanceId, ownerId) => void handleAnyBoardCardClick(instanceId, ownerId)}
        shipAbility={shipAbility.panel}
        opponentShipAbility={shipAbility.opponentPanel}
        onActivateAbility={board.requestAbility}
        onAssemblageDrop={board.handleAssemblageDrop}
        onShipClick={(ownerId) => {
          if (selection?.kind === "shipTarget") {
            act({ type: "activateShipAbility", playerId: myUserId, targetPlayerId: ownerId });
            board.clearSelection();
            return;
          }
          if (selection?.kind === "shipShot") {
            // Tir sans cible désignée : le Navire adverse, comme une attaque directe.
            act({ type: "fireShipAbility", playerId: myUserId });
            board.clearSelection();
            return;
          }
          if (selection?.kind === "attack") act({ type: "attack", playerId: myUserId, attackerInstanceId: selection.attackerId });
        }}
        onInspect={board.setDetailInstance}
        onOpenGraveyard={board.setGraveyardViewerPlayerId}
        onHandDragChange={board.setDraggingId}
      />

      {/* Le temps qui reste, sur une partie ARBITRÉE seulement : la partie
          locale n'a pas de serveur pour constater une échéance, et un
          compteur qui ne compte pour rien vaut mieux ne pas être montré. */}
      <TurnTimerBadge state={state} viewerId={myUserId} />

      {canRespondToReaction &&
        myReactionCandidates.length > 0 &&
        !(selection?.kind === "reaction" && selection.needsTarget) && (
          <ReactionPrompt
            candidates={myReactionCandidates}
            onActivateMany={activateSelectedReactions}
            onPass={() => act({ type: "passReaction", playerId: myUserId })}
          />
        )}
      {/* Cf. `MatchBoard` : le Navire seul à répondre s'annonce par son
          halo et un bandeau, jamais par un panneau modal. */}
      {canRespondToReaction && myReactionCandidates.length === 0 && shipAbility.windowEntry && (
        <ShipWindowHint name={shipAbility.windowEntry.name} onPass={() => act({ type: "passReaction", playerId: myUserId })} />
      )}
      {selection?.kind === "reaction" && selection.needsTarget && (
        <div className="fixed left-1/2 top-6 z-[70] -translate-x-1/2 rounded-full border border-white/25 bg-slate-950/80 px-4 py-2 text-xs text-slate-200 backdrop-blur-md">
          {reactionTargetHint([...me.board, ...opponent.board].find((u) => u.instanceId === selection.sourceInstanceId)?.cardId, selection.abilityIndex)}
        </div>
      )}
      {state.pendingChoice?.playerId === myUserId && (
        <PendingChoicePrompt
          choice={state.pendingChoice}
          onChoose={(choice) => act({ type: "resolveChoice", playerId: myUserId, choice })}
        />
      )}
      {state.pendingChoice?.kind === "pickUnits" && state.pendingChoice.playerId === myUserId && (
        <PickUnitsPrompt
          choice={state.pendingChoice}
          allUnits={state.players.flatMap((p) => p.board)}
          onConfirm={(pickInstanceIds) =>
            act({ type: "resolveChoice", playerId: myUserId, choice: { pickInstanceIds } })
          }
        />
      )}
      {state.pendingChoice?.kind === "keepUnits" && state.pendingChoice.playerId === myUserId && (
        <KeepUnitsPrompt
          choice={state.pendingChoice}
          board={me.board}
          onConfirm={(keepInstanceIds) =>
            act({ type: "resolveChoice", playerId: myUserId, choice: { keepInstanceIds } })
          }
        />
      )}
      {state.pendingChoice?.kind === "healAllocation" && state.pendingChoice.playerId === myUserId && (
        <HealAllocationPrompt
          choice={state.pendingChoice}
          board={me.board}
          onConfirm={(healAllocation) =>
            act({ type: "resolveChoice", playerId: myUserId, choice: { healAllocation } })
          }
        />
      )}
      {state.pendingChoice?.kind === "deckLook" && state.pendingChoice.playerId === myUserId && (
        <DeckLookPrompt
          choice={state.pendingChoice}
          onConfirm={(takeInstanceIds) =>
            act({ type: "resolveChoice", playerId: myUserId, choice: { takeInstanceIds } })
          }
          onRefuse={() => act({ type: "resolveChoice", playerId: myUserId, choice: "pass" })}
        />
      )}
      {state.pendingChoice?.kind === "handDiscard" && state.pendingChoice.playerId === myUserId && (
        <HandDiscardPrompt
          choice={state.pendingChoice}
          hand={me.hand}
          onConfirm={(discardInstanceIds) => act({ type: "resolveChoice", playerId: myUserId, choice: { discardInstanceIds } })}
          onRefuse={() => act({ type: "resolveChoice", playerId: myUserId, choice: "pass" })}
        />
      )}

      <ActionToastStack toasts={actionToasts} />
      {error ? (
        <GlassAlert message={error} severity="error" onDismiss={onDismissError} />
      ) : (
        <GlassAlert message={deraison.warning} severity="warning" onDismiss={deraison.dismiss} />
      )}
      <PhaseBanner text={bannerText} bannerKey={bannerEvent?.id ?? null} />
      {shipAbility.prompt && (
        <ShipAbilityPrompt {...shipAbility.prompt} onConfirm={shipAbility.confirm} onCancel={shipAbility.cancel} />
      )}
      {breakPrompt && (
        <ObjectBreakPrompt
          card={breakPrompt.card}
          source={breakPrompt.source}
          handCost={previewBreakReason(state, myUserId, breakPrompt.card.instanceId, breakPrompt.source === "hand")}
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
      {graveyardPick && (() => {
        const view = graveyardPickView(state, myUserId, graveyardPick);
        return (
          <GraveyardPickPrompt
            sourceCardId={view.sourceCardId}
            choices={view.choices}
            onConfirm={(chosen) => {
              board.setGraveyardPick(null);
              act(view.actionFor(chosen));
            }}
            onCancel={() => board.setGraveyardPick(null)}
          />
        );
      })()}
      {board.assemblagePick && (() => {
        const { card, boardIndex, proposal } = board.assemblagePick;
        return (
          <AssemblagePrompt
            card={card}
            proposal={proposal}
            onChooseOthers={() => board.setAssemblagePick({ card, boardIndex })}
            board={state.players.find((p) => p.id === myUserId)?.board ?? []}
            onAssemble={(assemblage) => {
              board.setAssemblagePick(null);
              act({ type: "playCard", playerId: myUserId, instanceId: card.instanceId, boardIndex, assemblage });
            }}
            onPlayNormally={() => {
              board.setAssemblagePick(null);
              act({ type: "playCard", playerId: myUserId, instanceId: card.instanceId, boardIndex });
            }}
            onCancel={() => board.setAssemblagePick(null)}
          />
        );
      })()}
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
