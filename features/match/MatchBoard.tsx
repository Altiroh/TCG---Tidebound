"use client";

import { useEffect, useRef, useState } from "react";
import {
  computeEffectiveStats,
  dispatch,
  eligibleCandidatesFor,
  getCardDefinition,
  getShipDefinition,
  graveyardChoicesForBreak,
  isMainPhase,
  previewBreakReason,
  stepBotTurn,
  UNIT_CARD_TYPES,
  type BotDifficulty,
  type CardInstance,
  type GameState,
  type PendingReactionCandidate,
  type PlayerAction,
  type PlayerId,
} from "@/game";
import { GlassAlert } from "@/components/ui/GlassAlert";
import { DEFAULT_PLAYER_COSMETICS, MatchCosmeticsProvider } from "@/features/cosmetics/MatchCosmeticsProvider";
import { ActionToastStack } from "@/features/match/ActionToastStack";
import { CardDetailModal } from "@/features/match/CardDetailModal";
import { EventFeed } from "@/features/match/EventFeed";
import { GraveyardPickPrompt } from "@/features/match/GraveyardPickPrompt";
import { GraveyardViewer } from "@/features/match/GraveyardViewer";
import { MatchEndScreen } from "@/features/match/MatchEndScreen";
import { MatchPauseMenu } from "@/features/match/MatchPauseMenu";
import { ObjectBreakPrompt } from "@/features/match/ObjectBreakPrompt";
import { ShipAbilityPrompt } from "@/features/match/ShipAbilityPrompt";
import { PendingChoicePrompt } from "@/features/match/PendingChoicePrompt";
import { HandDiscardPrompt } from "@/features/match/HandDiscardPrompt";
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
import { tableTargetingFor, useBoardInteraction } from "@/features/match/useBoardInteraction";
import { useShipAbility } from "@/features/match/useShipAbility";
import { playButtonClick } from "@/lib/sound";

/** Pause entre deux actions du bot (`stepBotTurn`) — assez long pour voir chaque pioche/pose/Sabordage se jouer avant l'action suivante, sans donner l'impression d'attendre. */
const BOT_ACTION_DELAY_MS = 1100;

interface MatchBoardProps {
  initialState: GameState;
  onExit: () => void;
  /** Si défini, ce joueur est joué automatiquement par le bot (`runBotTurn`) plutôt qu'en hot-seat. */
  botPlayerId?: PlayerId;
  botDifficulty?: BotDifficulty;
  /**
   * Notifié à chaque nouvel état de partie. Sert au compagnon du tutoriel
   * (`features/tutorial/`), qui doit lire l'état RÉEL pour valider ses
   * étapes sans jamais piloter le moteur. Absent partout ailleurs : le
   * plateau reste maître de son état.
   */
  onStateChange?: (state: GameState) => void;
  /**
   * Restreint les cartes de la main jouables (tutoriel). `null`/absent =
   * aucune restriction.
   */
  playableHandCards?: ReadonlySet<string> | null;
  /** Masque l'écran de fin de partie : le tutoriel a le sien. */
  hideEndScreen?: boolean;
}

type Pending =
  | { kind: "playCard"; instanceId: string; needsTarget: boolean }
  | { kind: "attack"; attackerId: string }
  | { kind: "break"; instanceId: string; needsTarget: boolean; fromHand?: boolean }
  | { kind: "reaction"; sourceInstanceId: string; abilityIndex: number; needsTarget: boolean };

function isUnitType(type: string): boolean {
  return (UNIT_CARD_TYPES as readonly string[]).includes(type);
}

/**
 * Plateau d'une partie locale (hot-seat ou contre un bot), rendu par
 * `TableBoard`.
 *
 * Ce composant garde toute la logique de partie — tour du bot, fenêtres de
 * réaction, bris, Déraison, pause, fin de partie — et ne fait que brancher
 * les intentions du plateau (poser, attaquer, saborder…) sur `dispatch`.
 *
 * "Perspective du viewer" : en hot-seat pur (`botPlayerId` absent), le bas
 * de l'écran suit le joueur actif (on se passe l'appareil). Contre un bot,
 * le joueur humain reste TOUJOURS en bas, même pendant le tour du bot.
 */
export function MatchBoard({
  initialState,
  onExit,
  botPlayerId,
  botDifficulty,
  onStateChange,
  playableHandCards,
  hideEndScreen = false,
}: MatchBoardProps) {
  const [liveState, setState] = useState<GameState>(initialState);
  // `state` = état AFFICHÉ (retenu avant le choc pendant une attaque, cf. `useAttackPresentation`) ; toute
  // action se valide et s'applique sur `liveState`, l'état de jeu réel.
  const { displayState: state, attacks } = useAttackPresentation(liveState);
  // Observateur externe (tutoriel) : notifié de l'état RÉEL, pas de l'état
  // affiché — une étape ne doit pas attendre la fin d'une animation.
  useEffect(() => {
    onStateChange?.(liveState);
  }, [liveState, onStateChange]);
  /** Seule erreur propre à la partie locale : le moteur refuse ici, tout de suite, au lieu du serveur. */
  const [error, setError] = useState<string | null>(null);
  // Contre le bot, le joueur humain est le compte connecté (s'il y en a un) ; en hot-seat, personne n'est identifiable.
  const displayNames = useDisplayNames(botPlayerId ? ["me"] : []);

  const activePlayerId = state.activePlayerId;
  const humanPlayerId = botPlayerId ? state.players.find((p) => p.id !== botPlayerId)!.id : null;
  // En hot-seat pur, l'écran suit qui doit agir MAINTENANT (le joueur actif, ou celui qu'attend une
  // fenêtre de réaction). Contre un bot, le joueur humain reste toujours en bas.
  const respondingPlayerId = state.pendingReaction?.awaitingPlayerId ?? activePlayerId;
  const viewerPlayerId = humanPlayerId ?? respondingPlayerId;
  const viewerPlayer = state.players.find((p) => p.id === viewerPlayerId)!;
  const otherPlayer = state.players.find((p) => p.id !== viewerPlayerId)!;
  const isViewerTurn = activePlayerId === viewerPlayerId;
  const noPendingWindow = !state.pendingReaction && !state.pendingChoice;
  const canPlayCards = isViewerTurn && isMainPhase(state.phase) && noPendingWindow;
  const canAttackNow = isViewerTurn && state.phase === "combatPhase" && noPendingWindow;
  // Si aucune unité du joueur actif ne peut attaquer, le bouton unique saute directement à "Fin de tour".
  const activePlayerBoard = state.players.find((p) => p.id === activePlayerId)?.board ?? [];
  const hasAnyAttacker = activePlayerBoard.some((unit) => {
    const def = getCardDefinition(unit.cardId);
    return isUnitType(def.type) && !unit.summoningSick && !unit.hasAttackedThisTurn && !computeEffectiveStats(unit, state.environment.tideState).inactive;
  });
  const myReactionCandidates =
    state.pendingReaction?.awaitingPlayerId === viewerPlayerId
      ? eligibleCandidatesFor(state, state.pendingReaction.events, viewerPlayerId, state.pendingReaction.turnNumber, state.pendingReaction.usedCandidateKeys)
      : [];

  const auraContextFor = (player: typeof viewerPlayer) => ({
    controllerBoard: player.board,
    controllerReason: player.reason,
    tideOrientation: state.environment.tideOrientation,
  });
  const bannerEvent = usePhaseBannerEvent(state);
  const actionToasts = useActionToasts(state);
  const board = useBoardInteraction({
    liveState,
    viewer: viewerPlayer,
    // Les actions normales portent le nom du joueur ACTIF : en hot-seat,
    // c'est celui qui tient l'appareil, et ce n'est pas toujours le même.
    actorId: activePlayerId,
    canPlayCards,
    canAct: isViewerTurn,
    act: runAction,
    interceptDeraison: (instanceId) => deraison.interceptClick(instanceId),
    onGestureStart: () => setError(null),
  });
  const { selection: pending } = board;
  const deraison = useDeraisonWarning(state, viewerPlayer, board.draggingId);
  const shipAbility = useShipAbility({
    liveState,
    viewerId: viewerPlayerId,
    actorId: activePlayerId,
    act: runAction,
    selection: pending,
    setSelection: board.setSelection,
  });

  function playerLabel(id: PlayerId): string {
    if (id === botPlayerId) return "du Bot";
    return id === "p1" ? "du Joueur 1" : "du Joueur 2";
  }
  const bannerText = bannerEvent
    ? bannerEvent.kind === "combatPhase"
      ? "Phase de combat"
      : bannerEvent.kind === "mainPhase2"
        ? "Phase principale 2"
        : `Tour ${playerLabel(bannerEvent.playerId)}`
    : null;
  // Court : il tient sous « Tour N » dans la colonne, même en mobile.
  const turnOwnerLabel = botPlayerId ? (isViewerTurn ? "À vous" : "Au bot") : `Joueur ${activePlayerId === "p1" ? "1" : "2"}`;

  // Joue automatiquement le tour du bot dès qu'il devient actif, ET chaque fois qu'une fenêtre de
  // réaction l'attend. UNE action à la fois (`stepBotTurn`), avec un délai entre chaque : chaque
  // pioche/pose/Sabordage a le temps d'être animé.
  //
  // TOUT ce qui suit se lit sur `liveState`, jamais sur `state` (l'état
  // AFFICHÉ). Pendant une attaque, l'affichage est volontairement retenu sur
  // l'état d'AVANT le choc : un bot qui s'y fierait rejouerait depuis un
  // plateau périmé et remettrait en jeu une carte déjà partie au cimetière —
  // c'est exactement ce qu'on voyait, la carte détruite revenant encaisser
  // le coup avant de repartir.
  //
  // `liveRef` sert à la même fin dans le temps : la minuterie démarre après
  // un délai, et doit repartir de l'état COURANT, pas de celui capturé au
  // moment où l'effet a été posé.
  const liveRef = useRef(liveState);
  liveRef.current = liveState;

  const botAwaitingReaction = liveState.pendingReaction?.awaitingPlayerId === botPlayerId;
  const liveActivePlayerId = liveState.activePlayerId;
  useEffect(() => {
    if (liveRef.current.status !== "active" || !botDifficulty) return;
    if (liveActivePlayerId !== botPlayerId && !botAwaitingReaction) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    function tick(current: GameState) {
      if (cancelled) return;
      if (current.status !== "active" || !botPlayerId) return;
      const ownTurn = current.activePlayerId === botPlayerId;
      const ownReaction = current.pendingReaction?.awaitingPlayerId === botPlayerId;
      if (!ownTurn && !ownReaction) return;

      const step = stepBotTurn(current, botPlayerId, botDifficulty!);
      setState(step.state);
      board.clearSelection();
      setError(null);
      if (!step.done) {
        timer = setTimeout(() => tick(step.state), BOT_ACTION_DELAY_MS);
      }
    }

    timer = setTimeout(() => tick(liveRef.current), BOT_ACTION_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ne doit réagir qu'aux transitions "c'est au bot d'agir" (cf. l'ancien MatchBoard).
  }, [liveActivePlayerId, botAwaitingReaction, liveState.status, botPlayerId, botDifficulty]);

  /** Abandon depuis le menu de pause : la partie se termine proprement, sur l'écran de victoire de l'adversaire. */
  function concedeMatch() {
    const result = dispatch(liveState, { type: "concede", playerId: viewerPlayerId });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    board.setShowPauseMenu(false);
    setError(null);
    setState(result.state);
    board.clearSelection();
  }

  function runAction(action: PlayerAction) {
    if (!isViewerTurn) return;
    const result = dispatch(liveState, action);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    setState(result.state);
    board.clearSelection();
  }

  /** Pendant une fenêtre de réaction, celui qui répond n'est pas forcément le joueur actif. */
  function runReactionAction(action: PlayerAction) {
    const result = dispatch(liveState, action);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    setState(result.state);
    board.clearSelection();
  }

  /** Sélection multiple de `ReactionPrompt` : sans cible appliquées d'un coup, avec cible mises en file. */
  function activateSelectedReactions(selected: PendingReactionCandidate[]) {
    const immediate = selected.filter((c) => !c.needsTarget);
    const queued = selected.filter((c) => c.needsTarget);

    let currentState = liveState;
    for (const candidate of immediate) {
      const result = dispatch(currentState, {
        type: "activateReaction",
        playerId: viewerPlayerId,
        sourceInstanceId: candidate.sourceInstanceId,
        abilityIndex: candidate.abilityIndex,
      });
      if (!result.ok) {
        setError(result.error);
        setState(currentState);
        return;
      }
      currentState = result.state;
    }
    setError(null);
    setState(currentState);

    board.beginReactionTargeting(queued);
  }

  /**
   * Cible désignée sur le plateau.
   *
   * Le hook traite tout sauf les RÉACTIONS, qu'il remonte : en local, elles
   * se dispatchent même quand ce n'est pas son tour, par un chemin qui doit
   * rester distinct des actions normales (`runReactionAction`).
   */
  function handleAnyBoardCardClick(instanceId: string, ownerId: PlayerId) {
    const reaction = board.resolveBoardCardClick(instanceId, ownerId);
    if (!reaction) return;
    const result = dispatch(liveState, reaction);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    setState(result.state);
    board.beginReactionTargeting(board.reactionQueue);
  }

  if (state.status === "finished" && !hideEndScreen) {
    // Contre un bot, l'écran appartient au joueur humain ; en hot-seat, c'est celui du vainqueur.
    const subjectId = humanPlayerId ?? state.winnerId;
    const isDefeat = Boolean(humanPlayerId && state.winnerId && state.winnerId !== humanPlayerId);
    const genericName = subjectId === "p1" ? "Joueur 1" : "Joueur 2";
    const subjectName = humanPlayerId ? (displayNames.me ?? genericName) : genericName;
    const subjectShip = getShipDefinition(state.players.find((p) => p.id === subjectId)?.shipId ?? viewerPlayer.shipId);
    return (
      // Partie LOCALE (hot-seat, ou bot hors connexion) : jouée entièrement dans le navigateur, elle ne rapporte jamais rien.
      <MatchEndScreen outcome={isDefeat ? "defeat" : "victory"} player={state.winnerId ? { name: subjectName, ship: subjectShip } : undefined} onExit={onExit} />
    );
  }

  // Rien à attaquer : le bouton saute le combat ET la Phase principale 2 (on y est déjà, en pratique) et propose la fin du tour.
  const phase = phaseButtonFor({ isMyTurn: isViewerTurn, phase: state.phase === "mainPhase" && !hasAnyAttacker ? "mainPhase2" : state.phase });
  const hint = targetingHint(pending?.kind === "reaction" ? null : pending?.kind ?? null);

  // Objets d'invite en constantes locales : `board.breakPrompt` ne se
  // rétrécit pas à travers une fermeture, une constante si.
  const { breakPrompt, graveyardPick, detailInstance, graveyardViewerPlayerId } = board;

  /*
   * Cosmétiques par camp. Contre le bot : le bot n'a rien équipé, il joue
   * avec le dos et le cadre d'origine, le joueur humain avec les siens. En
   * hot-seat, les deux camps sont sur le même appareil : aucun contexte,
   * chacun garde les cosmétiques locaux comme avant.
   */
  const withCosmetics = (node: React.ReactElement) =>
    botPlayerId && humanPlayerId ? (
      <MatchCosmeticsProvider viewerId={humanPlayerId} byPlayer={{ [botPlayerId]: DEFAULT_PLAYER_COSMETICS }}>
        {node}
      </MatchCosmeticsProvider>
    ) : (
      node
    );

  return withCosmetics(
    <>
      <TableBoard
        state={state}
        viewerId={viewerPlayerId}
        turnOwnerLabel={turnOwnerLabel}
        attacks={attacks}
        journal={
          <EventFeed
            variant="rail"
            state={state}
            playerLabel={(id) =>
              id === botPlayerId ? "Le bot" : id === humanPlayerId ? (displayNames.me ?? "Joueur 1") : id === "p1" ? "Joueur 1" : id === "p2" ? "Joueur 2" : "?"
            }
          />
        }
        canPlayCards={canPlayCards}
        playableHandCards={playableHandCards}
        canAttack={canAttackNow}
        targeting={tableTargetingFor(pending)}
        reactionSourceIds={myReactionCandidates.map((c) => c.sourceInstanceId)}
        hint={hint}
        onCancelHint={board.clearSelection}
        phaseButton={{
          label: phase.label,
          // La phase EN COURS, pas celle vers laquelle le bouton mène :
          // c'est ce que l'icône ne dit pas.
          phaseLabel: phaseTitle(state.phase),
          icon: phase.icon,
          disabled: !isViewerTurn || !noPendingWindow,
          onClick: () => {
            playButtonClick();
            if (phase.action === "advance") runAction({ type: "advancePhase", playerId: activePlayerId });
            else if (phase.action === "endTurn") runAction({ type: "endTurn", playerId: activePlayerId });
          },
        }}
        onMenu={() => board.setShowPauseMenu(true)}
        onHandCardClick={(id) => board.handleHandCardClick(id)}
        onPlayCard={(instanceId, targetInstanceId) => {
          // Le lâcher a déjà montré l'avertissement de Déraison : il vaut confirmation.
          if (targetInstanceId) runAction({ type: "playCard", playerId: activePlayerId, instanceId, targetInstanceId });
          else board.handleHandCardClick(instanceId, true);
        }}
        onAttack={(attackerInstanceId, defenderInstanceId) =>
          runAction({ type: "attack", playerId: activePlayerId, attackerInstanceId, defenderInstanceId })
        }
        onBreakOnTarget={(instanceId, targetInstanceId) => runAction({ type: "breakObject", playerId: activePlayerId, instanceId, targetInstanceId })}
        onDropOnGraveyard={board.handleDropOnGraveyard}
        onBoardCardClick={handleAnyBoardCardClick}
        shipAbility={shipAbility.panel}
        opponentShipAbility={shipAbility.opponentPanel}
        onShipClick={() => {
          if (pending?.kind === "shipShot") {
            // Tir sans cible désignée : le Navire adverse, comme une attaque directe.
            runAction({ type: "fireShipAbility", playerId: activePlayerId });
            board.clearSelection();
            return;
          }
          if (pending?.kind === "attack") runAction({ type: "attack", playerId: activePlayerId, attackerInstanceId: pending.attackerId });
        }}
        onInspect={board.setDetailInstance}
        onOpenGraveyard={board.setGraveyardViewerPlayerId}
        onHandDragChange={board.setDraggingId}
      />

      {/* Invitation à réagir — priorité sur tout le reste tant qu'elle reste ouverte ; repliée dès qu'une
          capacité ciblée est choisie, remplacée par un petit rappel non bloquant. */}
      {state.pendingReaction?.awaitingPlayerId === viewerPlayerId && myReactionCandidates.length > 0 && !(pending?.kind === "reaction" && pending.needsTarget) && (
        <ReactionPrompt
          candidates={myReactionCandidates}
          onActivateMany={activateSelectedReactions}
          onPass={() => runReactionAction({ type: "passReaction", playerId: viewerPlayerId })}
        />
      )}
      {pending?.kind === "reaction" && pending.needsTarget && (
        <div className="fixed left-1/2 top-6 z-[70] -translate-x-1/2 rounded-full border border-white/25 bg-slate-950/80 px-4 py-2 text-xs text-slate-200 backdrop-blur-md">
          {reactionTargetHint([...viewerPlayer.board, ...otherPlayer.board].find((u) => u.instanceId === pending.sourceInstanceId)?.cardId, pending.abilityIndex)}
        </div>
      )}
      {state.pendingChoice?.playerId === viewerPlayerId && (
        <PendingChoicePrompt
          choice={state.pendingChoice}
          onChoose={(choice) => runReactionAction({ type: "resolveChoice", playerId: viewerPlayerId, choice })}
        />
      )}
      {state.pendingChoice?.kind === "handDiscard" && state.pendingChoice.playerId === viewerPlayerId && (
        <HandDiscardPrompt
          choice={state.pendingChoice}
          hand={viewerPlayer.hand}
          onConfirm={(discardInstanceIds) =>
            runReactionAction({ type: "resolveChoice", playerId: viewerPlayerId, choice: { discardInstanceIds } })
          }
          onRefuse={() => runReactionAction({ type: "resolveChoice", playerId: viewerPlayerId, choice: "pass" })}
        />
      )}

      <ActionToastStack toasts={actionToasts} />
      {error ? (
        <GlassAlert message={error} severity="error" onDismiss={() => setError(null)} />
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
          handCost={previewBreakReason(liveState, activePlayerId, breakPrompt.card.instanceId, breakPrompt.source === "hand")}
          onBreak={() => board.requestBreak(breakPrompt.card, breakPrompt.source === "hand")}
          onScuttle={
            breakPrompt.source === "board"
              ? () => {
                  board.setBreakPrompt(null);
                  runAction({ type: "saborder", playerId: activePlayerId, instanceId: breakPrompt.card.instanceId });
                }
              : undefined
          }
          onCancel={() => board.setBreakPrompt(null)}
        />
      )}
      {graveyardPick && (
        <GraveyardPickPrompt
          sourceCardId={graveyardPick.card.cardId}
          choices={graveyardChoicesForBreak(liveState, activePlayerId, getCardDefinition(graveyardPick.card.cardId))}
          onConfirm={(chosen) => {
            board.setGraveyardPick(null);
            runAction({
              type: "breakObject",
              playerId: activePlayerId,
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
          playerLabel={graveyardViewerPlayerId === botPlayerId ? "Bot" : graveyardViewerPlayerId === "p1" ? "Joueur 1" : "Joueur 2"}
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
          auraContext={auraContextFor(viewerPlayer.board.some((u) => u.instanceId === detailInstance.instanceId) ? viewerPlayer : otherPlayer)}
          onClose={() => board.setDetailInstance(null)}
        />
      )}
      {board.showPauseMenu && <MatchPauseMenu onResume={() => board.setShowPauseMenu(false)} onConcede={concedeMatch} onQuit={onExit} />}
    </>
  );
}
