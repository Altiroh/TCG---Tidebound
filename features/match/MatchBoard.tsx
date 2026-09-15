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
  previewHandBreakReason,
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
  const [pending, setPending] = useState<Pending | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Carte de main en cours de glisser : l'avertissement de Déraison s'affiche pendant tout le glisser. */
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [graveyardViewerPlayerId, setGraveyardViewerPlayerId] = useState<PlayerId | null>(null);
  const [detailInstance, setDetailInstance] = useState<CardInstance | null>(null);
  /** Objet glissé sur le crâne : on demande s'il faut activer son effet de bris (cf. `ObjectBreakPrompt`). */
  const [breakPrompt, setBreakPrompt] = useState<{ card: CardInstance; source: "hand" | "board" } | null>(null);
  /** Bris qui demande de choisir une carte de sa défausse (ex: Grappin de Récupération). */
  const [graveyardPick, setGraveyardPick] = useState<{ card: CardInstance; fromHand: boolean } | null>(null);
  /** Menu de pause (ÉCHAP ou bouton Menu) : options audio + abandon. */
  const [showPauseMenu, setShowPauseMenu] = useState(false);
  /** Candidats à cible restant à traiter après celui en cours — sélection multiple dans `ReactionPrompt`. */
  const [reactionQueue, setReactionQueue] = useState<PendingReactionCandidate[]>([]);
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
  const deraison = useDeraisonWarning(state, viewerPlayer, draggingId);

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
      setPending(null);
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

  // Menu de pause via ÉCHAP. Toute surcouche déjà ouverte intercepte la touche en priorité.
  useEffect(() => {
    const overlayOpen = Boolean(detailInstance || graveyardViewerPlayerId || breakPrompt || graveyardPick);
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (overlayOpen) return;
      setShowPauseMenu((current) => !current);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [detailInstance, graveyardViewerPlayerId, breakPrompt, graveyardPick]);

  function clearSelection() {
    setPending(null);
    setReactionQueue([]);
  }

  /** Abandon depuis le menu de pause : la partie se termine proprement, sur l'écran de victoire de l'adversaire. */
  function concedeMatch() {
    const result = dispatch(liveState, { type: "concede", playerId: viewerPlayerId });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setShowPauseMenu(false);
    setError(null);
    setState(result.state);
    clearSelection();
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
    clearSelection();
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
    clearSelection();
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

    const [first, ...rest] = queued;
    if (first) {
      setPending({ kind: "reaction", sourceInstanceId: first.sourceInstanceId, abilityIndex: first.abilityIndex, needsTarget: true });
      setReactionQueue(rest);
    } else {
      clearSelection();
    }
  }

  /** Clic sur une carte de main : la joue, ou entre en choix de cible. Le glisser-déposer passe `confirmed`. */
  function handleHandCardClick(instanceId: string, confirmed = false) {
    if (!canPlayCards) return;
    const card = viewerPlayer.hand.find((c) => c.instanceId === instanceId);
    if (!card) return;
    if (!confirmed && deraison.interceptClick(instanceId)) return;
    const needsTarget = needsPlayTarget(getCardDefinition(card.cardId), viewerPlayer.board);
    setError(null);
    if (pending?.kind === "playCard" && pending.instanceId === instanceId) {
      clearSelection();
      return;
    }
    if (needsTarget) setPending({ kind: "playCard", instanceId, needsTarget: true });
    else runAction({ type: "playCard", playerId: activePlayerId, instanceId });
  }

  function handleAnyBoardCardClick(instanceId: string, ownerId: PlayerId) {
    if (pending?.kind === "reaction" && pending.needsTarget) {
      const result = dispatch(liveState, {
        type: "activateReaction",
        playerId: viewerPlayerId,
        sourceInstanceId: pending.sourceInstanceId,
        abilityIndex: pending.abilityIndex,
        targetInstanceId: instanceId,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setError(null);
      setState(result.state);
      const [next, ...rest] = reactionQueue;
      if (next) {
        setPending({ kind: "reaction", sourceInstanceId: next.sourceInstanceId, abilityIndex: next.abilityIndex, needsTarget: true });
        setReactionQueue(rest);
      } else {
        clearSelection();
      }
      return;
    }
    if (pending?.kind === "playCard" && pending.needsTarget) {
      runAction({ type: "playCard", playerId: activePlayerId, instanceId: pending.instanceId, targetInstanceId: instanceId });
      return;
    }
    if (pending?.kind === "break" && pending.needsTarget) {
      runAction({ type: "breakObject", playerId: activePlayerId, instanceId: pending.instanceId, targetInstanceId: instanceId, fromHand: pending.fromHand });
      return;
    }
    if (pending?.kind === "attack" && ownerId !== viewerPlayerId) {
      runAction({ type: "attack", playerId: activePlayerId, attackerInstanceId: pending.attackerId, defenderInstanceId: instanceId });
    }
  }

  /** Brise un Objet, posé ou depuis la main : cible ou carte de défausse à choisir d'abord si l'effet en demande. */
  function requestBreak(card: CardInstance, fromHand: boolean) {
    if (!isViewerTurn) return;
    setBreakPrompt(null);
    const def = getCardDefinition(card.cardId);
    if ((def.onBreakEffects ?? []).some((e) => e.target.kind === "chosenUnit")) {
      setPending({ kind: "break", instanceId: card.instanceId, needsTarget: true, fromHand });
      return;
    }
    if (graveyardChoicesForBreak(liveState, activePlayerId, def).length > 0) {
      setGraveyardPick({ card, fromHand });
      return;
    }
    runAction({ type: "breakObject", playerId: activePlayerId, instanceId: card.instanceId, fromHand });
  }

  /** Carte lâchée sur le crâne : un Objet propose Briser / Saborder, tout autre permanent est Sabordé. */
  function handleDropOnGraveyard(instanceId: string, from: "hand" | "board") {
    const zone = from === "hand" ? viewerPlayer.hand : viewerPlayer.board;
    const card = zone.find((c) => c.instanceId === instanceId);
    if (!card) return;
    if (getCardDefinition(card.cardId).type === "objet") {
      setBreakPrompt({ card, source: from });
      return;
    }
    if (from === "board") runAction({ type: "saborder", playerId: activePlayerId, instanceId });
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

  return (
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
        targeting={
          pending
            ? { kind: pending.kind, sourceInstanceId: pending.kind === "attack" ? pending.attackerId : pending.kind === "reaction" ? pending.sourceInstanceId : pending.instanceId }
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
          disabled: !isViewerTurn || !noPendingWindow,
          onClick: () => {
            playButtonClick();
            if (phase.action === "advance") runAction({ type: "advancePhase", playerId: activePlayerId });
            else if (phase.action === "endTurn") runAction({ type: "endTurn", playerId: activePlayerId });
          },
        }}
        onMenu={() => setShowPauseMenu(true)}
        onHandCardClick={(id) => handleHandCardClick(id)}
        onPlayCard={(instanceId, targetInstanceId) => {
          // Le lâcher a déjà montré l'avertissement de Déraison : il vaut confirmation.
          if (targetInstanceId) runAction({ type: "playCard", playerId: activePlayerId, instanceId, targetInstanceId });
          else handleHandCardClick(instanceId, true);
        }}
        onAttack={(attackerInstanceId, defenderInstanceId) =>
          runAction({ type: "attack", playerId: activePlayerId, attackerInstanceId, defenderInstanceId })
        }
        onBreakOnTarget={(instanceId, targetInstanceId) => runAction({ type: "breakObject", playerId: activePlayerId, instanceId, targetInstanceId })}
        onDropOnGraveyard={handleDropOnGraveyard}
        onBoardCardClick={handleAnyBoardCardClick}
        onShipClick={() => pending?.kind === "attack" && runAction({ type: "attack", playerId: activePlayerId, attackerInstanceId: pending.attackerId })}
        onInspect={setDetailInstance}
        onOpenGraveyard={setGraveyardViewerPlayerId}
        onHandDragChange={setDraggingId}
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
          reasonLossAmount={state.pendingChoice.reasonLossAmount}
          anchorDamageAmount={state.pendingChoice.anchorDamageAmount}
          onChoose={(choice) => runReactionAction({ type: "resolveChoice", playerId: viewerPlayerId, choice })}
        />
      )}

      <ActionToastStack toasts={actionToasts} />
      {error ? (
        <GlassAlert message={error} severity="error" onDismiss={() => setError(null)} />
      ) : (
        <GlassAlert message={deraison.warning} severity="warning" onDismiss={deraison.dismiss} />
      )}
      <PhaseBanner text={bannerText} bannerKey={bannerEvent?.id ?? null} />
      {breakPrompt && (
        <ObjectBreakPrompt
          card={breakPrompt.card}
          source={breakPrompt.source}
          handCost={breakPrompt.source === "hand" ? previewHandBreakReason(liveState, activePlayerId, breakPrompt.card.instanceId) : undefined}
          onBreak={() => requestBreak(breakPrompt.card, breakPrompt.source === "hand")}
          onScuttle={
            breakPrompt.source === "board"
              ? () => {
                  setBreakPrompt(null);
                  runAction({ type: "saborder", playerId: activePlayerId, instanceId: breakPrompt.card.instanceId });
                }
              : undefined
          }
          onCancel={() => setBreakPrompt(null)}
        />
      )}
      {graveyardPick && (
        <GraveyardPickPrompt
          sourceCardId={graveyardPick.card.cardId}
          choices={graveyardChoicesForBreak(liveState, activePlayerId, getCardDefinition(graveyardPick.card.cardId))}
          onConfirm={(chosen) => {
            setGraveyardPick(null);
            runAction({
              type: "breakObject",
              playerId: activePlayerId,
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
          playerLabel={graveyardViewerPlayerId === botPlayerId ? "Bot" : graveyardViewerPlayerId === "p1" ? "Joueur 1" : "Joueur 2"}
          cards={state.players.find((p) => p.id === graveyardViewerPlayerId)!.graveyard}
          onClose={() => setGraveyardViewerPlayerId(null)}
        />
      )}
      {detailInstance && (
        <CardDetailModal
          instance={detailInstance}
          tideState={state.environment.tideState}
          boardUnits={state.players.flatMap((p) => p.board)}
          auraContext={auraContextFor(viewerPlayer.board.some((u) => u.instanceId === detailInstance.instanceId) ? viewerPlayer : otherPlayer)}
          onClose={() => setDetailInstance(null)}
        />
      )}
      {showPauseMenu && <MatchPauseMenu onResume={() => setShowPauseMenu(false)} onConcede={concedeMatch} onQuit={onExit} />}
    </>
  );
}
