"use client";

import { useNoMenuAmbiance } from "@/components/menu/MenuAmbiance";
import { matchAudienceVerdict } from "@/features/audience/verdict";
import { useEndScreenHold } from "@/features/match/useEndScreenHold";
import { useScreenWakeLock } from "@/features/match/useScreenWakeLock";
import { useEffect, useRef, useState } from "react";
import {
  dispatch,
  eligibleCandidatesFor,
  getCardDefinition,
  getShipDefinition,
  graveyardChoicesForBreak,
  isMainPhase,
  previewBreakReason,
  applyBotAction,
  botHasSomethingToDo,
  type BotDifficulty,
  type CardInstance,
  type GameState,
  type PendingReactionCandidate,
  type PlayerAction,
  type PlayerId,
  hasCombatToPlay,
} from "@/game";
import { GlassAlert } from "@/components/ui/GlassAlert";
import { DEFAULT_PLAYER_COSMETICS, MatchCosmeticsProvider } from "@/features/cosmetics/MatchCosmeticsProvider";
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
import { TableDice } from "@/features/match/dice/TableDice";
import { HandDiscardPrompt } from "@/features/match/HandDiscardPrompt";
import { ChoiceBanner } from "@/features/match/ChoiceBanner";
import { useHandLimitDiscard } from "@/features/match/useHandLimitDiscard";
import { useHealAllocation } from "@/features/match/useHealAllocation";
import { useBoardPick } from "@/features/match/useBoardPick";
import { useHeldTarget } from "@/features/match/useHeldTarget";
import { PhaseBanner } from "@/features/match/PhaseBanner";
import { ReactionPrompt } from "@/features/match/ReactionPrompt";
import { ShipWindowHint } from "@/features/match/ShipWindowHint";
import { reactionTargetHint } from "@/features/match/reactionTargetHint";
import { TableBoard } from "@/features/match/table/TableBoard";
import { phaseButtonFor, phaseTitle, targetingHint } from "@/features/match/table/tableLabels";
import { useActionToasts } from "@/features/match/useActionToasts";
import { useAttackPresentation } from "@/features/match/useAttackPresentation";
import { useDeraisonWarning } from "@/features/match/useDeraisonWarning";
import { useAvatarCardId, useDisplayNames, useEquippedTitle } from "@/features/match/useDisplayNames";
import { usePhaseBannerEvent } from "@/features/match/usePhaseBannerEvent";
import { tableTargetingFor, useBoardInteraction } from "@/features/match/useBoardInteraction";
import { useShipAbility } from "@/features/match/useShipAbility";
import { playButtonClick } from "@/lib/sound";
import { thinkBotAction } from "@/features/match/bot/botThinker";

/**
 * Rythme du bot : le temps MINIMUM entre deux de ses actions visibles
 * (pose, attaque, Sabordage…), réflexion comprise — assez pour voir chaque
 * coup se jouer, pas assez pour avoir l'impression d'attendre. Longtemps
 * fixé à 1,1 s, en plus du temps de réflexion : un tour du bot durait plus
 * de dix secondes, et chaque réaction qu'il passait bloquait la table une
 * seconde entière.
 */
const BOT_ACTION_DELAY_MS = 550;
/** Passer une réaction, changer de phase : rien à regarder, le bot enchaîne presque aussitôt. */
const BOT_QUICK_DELAY_MS = 120;
const BOT_QUICK_ACTIONS: ReadonlySet<PlayerAction["type"]> = new Set(["passReaction", "advancePhase"]);

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
  // En partie, la musique du menu se tait.
  useNoMenuAmbiance();
  const [liveState, setState] = useState<GameState>(initialState);
  // L'écran reste allumé pendant la partie, pas sur l'écran de fin.
  useScreenWakeLock(liveState.status !== "finished");
  // `state` = état AFFICHÉ (retenu avant le choc pendant une attaque, cf. `useAttackPresentation`) ; toute
  // action se valide et s'applique sur `liveState`, l'état de jeu réel.
  const { displayState: state, attacks, volleys, holding } = useAttackPresentation(liveState);
  // Observateur externe (tutoriel) : notifié de l'état RÉEL, pas de l'état
  // affiché — une étape ne doit pas attendre la fin d'une animation.
  useEffect(() => {
    onStateChange?.(liveState);
  }, [liveState, onStateChange]);
  /** Seule erreur propre à la partie locale : le moteur refuse ici, tout de suite, au lieu du serveur. */
  const [error, setError] = useState<string | null>(null);
  // Contre le bot, le joueur humain est le compte connecté (s'il y en a un) ; en hot-seat, personne n'est identifiable.
  const displayNames = useDisplayNames(botPlayerId ? ["me"] : []);
  // Contre le bot, la plaque de fin est celle du compte connecté : son titre y figure. En hot-seat, personne.
  const myTitle = useEquippedTitle(botPlayerId ? "me" : null);
  const myAvatar = useAvatarCardId(botPlayerId ? "me" : null);

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
  // Défausse depuis la main (limite de main comme effet) : les cartes se glissent au Cimetière.
  const handLimit = useHandLimitDiscard(state, viewerPlayerId, (answer) =>
    runReactionAction({ type: "resolveChoice", playerId: viewerPlayerId, choice: answer })
  );
  // Répartition de soins : sur le plateau, toucher = +1 (bandeau en haut, une minute).
  const healAllocation = useHealAllocation(state, viewerPlayerId, (allocation) =>
    runReactionAction({ type: "resolveChoice", playerId: viewerPlayerId, choice: { healAllocation: allocation } })
  );
  // Plusieurs unités à désigner : sur le plateau, toucher = désigner / reprendre.
  const boardPick = useBoardPick(state, viewerPlayerId, (answer) =>
    runReactionAction({ type: "resolveChoice", playerId: viewerPlayerId, choice: answer })
  );
  // La première cible d'une action qui n'est pas allée au bout reste marquée.
  const heldTarget = useHeldTarget(state);
  const myReactionCandidates =
    state.pendingReaction?.awaitingPlayerId === viewerPlayerId
      ? eligibleCandidatesFor(state, state.pendingReaction.events, viewerPlayerId, state.pendingReaction.turnNumber, state.pendingReaction.usedCandidateKeys)
      : [];

  // Une seule capacité à proposer, et elle vise une unité : pas de question
  // « Oui / Non » d'abord — on passe DIRECTEMENT à la désignation sur le
  // plateau (bandeau en haut, « Ne rien faire », une minute).
  const directTarget = myReactionCandidates.length === 1 && myReactionCandidates[0]!.needsTarget ? myReactionCandidates[0]! : null;
  const directTargetKey = directTarget ? `${directTarget.sourceInstanceId}:${directTarget.abilityIndex}:${state.pendingReaction?.usedCandidateKeys.length ?? 0}` : null;
  useEffect(() => {
    if (directTarget && !(pending?.kind === "reaction" && pending.needsTarget)) board.beginReactionTargeting([directTarget]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [directTargetKey]);

  const auraContextFor = (player: typeof viewerPlayer) => ({
    controllerBoard: player.board,
    controllerReason: player.reason,
    tideOrientation: state.environment.tideOrientation,
    // Signal Rouge (Lot 15) : un bonus « pendant votre tour ».
    controllerIsActive: state.activePlayerId === player.id,
  });
  const bannerEvent = usePhaseBannerEvent(state, viewerPlayerId);
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
  // réaction l'attend. UNE action à la fois (`applyBotAction`), avec un délai entre chaque : chaque
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

  // « Le bot a-t-il quelque chose à décider ? » — son tour, une fenêtre de
  // réaction ou un choix qui l'attend. C'est CETTE bascule qui relance la
  // boucle, pas le joueur actif : quand le bot ouvre une fenêtre au joueur
  // pendant son propre tour, il doit reprendre la main une fois qu'on y a
  // répondu, alors que le joueur actif, lui, n'a pas changé.
  // Un dé qui roule encore retient l'issue de son jet (`dicePresentation.ts`),
  // une attaque ou un sort retient l'état d'avant le choc : le bot attend
  // qu'ils aient touché avant de rejouer, sinon son coup suivant les coupe.
  const botToAct = Boolean(botPlayerId) && !holding && liveState.status === "active" && botHasSomethingToDo(liveState, botPlayerId!);
  useEffect(() => {
    if (!botToAct || !botDifficulty || !botPlayerId) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    // Réfléchir (hors du fil principal, `thinkBotAction`) PENDANT que le
    // délai court : la réflexion ne s'ajoute plus au rythme, elle s'y fond.
    async function step() {
      const current = liveRef.current;
      if (cancelled || current.status !== "active" || !botHasSomethingToDo(current, botPlayerId!)) return;

      const startedAt = performance.now();
      const action = await thinkBotAction(current, botPlayerId!, botDifficulty!);
      if (cancelled) return;
      const pace = BOT_QUICK_ACTIONS.has(action.type) ? BOT_QUICK_DELAY_MS : BOT_ACTION_DELAY_MS;
      timer = setTimeout(() => {
        if (cancelled) return;
        // L'état a bougé pendant la réflexion (abandon, fin de délai…) :
        // l'action choisie ne vaut plus rien, on repart de l'état courant.
        if (liveRef.current !== current) {
          void step();
          return;
        }
        const result = applyBotAction(current, botPlayerId!, action);
        liveRef.current = result.state;
        setState(result.state);
        board.clearSelection();
        setError(null);
        if (!result.done) void step();
      }, Math.max(0, pace - (performance.now() - startedAt)));
    }

    void step();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ne doit réagir qu'aux transitions "c'est au bot d'agir".
  }, [botToAct, botPlayerId, botDifficulty]);

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
    heldTarget.note(liveState, action);
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
    heldTarget.note(liveState, action);
    setError(null);
    setState(result.state);
    board.clearSelection();
  }

  /** Sélection multiple de `ReactionPrompt` : sans cible appliquées d'un coup, avec cible mises en file. */
  function activateSelectedReactions(selected: PendingReactionCandidate[]) {
    const immediate = selected.filter((c) => !c.needsTarget && !c.needsGraveyardTarget);
    const queued = selected.filter((c) => c.needsTarget);
    // « choisissez une unité dans votre Cimetière » : une seule question à la
    // fois, donc la première capacité qui la pose ouvre l'écran et les
    // suivantes attendront la prochaine fenêtre.
    const graveyardFirst = selected.find((c) => !c.needsTarget && c.needsGraveyardTarget);

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

    if (graveyardFirst) {
      board.setGraveyardPick({ kind: "reaction", candidate: graveyardFirst });
      return;
    }
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

  // La partie finie, la table reste le temps de VOIR le coup qui l'a finie.
  const endHold = useEndScreenHold(state);
  const tableLabel = (id?: string) =>
    id === botPlayerId ? "Le bot" : id === humanPlayerId ? (displayNames.me ?? "Joueur 1") : id === "p1" ? "Joueur 1" : id === "p2" ? "Joueur 2" : "?";

  if (state.status === "finished" && !hideEndScreen && endHold.showEnd) {
    // Contre un bot, l'écran appartient au joueur humain ; en hot-seat, c'est
    // celui du vainqueur — ou, sur un match nul, celui qui a la main.
    const subjectId = humanPlayerId ?? state.winnerId ?? viewerPlayer.id;
    const isDefeat = Boolean(humanPlayerId && state.winnerId && state.winnerId !== humanPlayerId);
    const genericName = subjectId === "p1" ? "Joueur 1" : "Joueur 2";
    const subjectName = humanPlayerId ? (displayNames.me ?? genericName) : genericName;
    const subjectShip = getShipDefinition(state.players.find((p) => p.id === subjectId)?.shipId ?? viewerPlayer.shipId);
    return (
      // Partie LOCALE (hot-seat, ou bot hors connexion) : jouée entièrement dans le navigateur, elle ne rapporte jamais rien.
      <MatchEndScreen
        outcome={!state.winnerId ? "draw" : isDefeat ? "defeat" : "victory"}
        player={{ name: subjectName, ship: subjectShip, title: humanPlayerId ? myTitle : null, avatarCardId: humanPlayerId ? myAvatar : null }}
        onExit={onExit}
        audience={matchAudienceVerdict(state, subjectId)}
      />
    );
  }

  // Pas de fin de tour en Phase principale 1 (règle du 08/10/2026) : le bouton mène au combat d'abord —
  // sauf au tout premier tour, où l'on ne peut pas attaquer : il propose directement la fin du tour.
  const phase = phaseButtonFor({ isMyTurn: isViewerTurn, phase: state.phase === "mainPhase" && !hasCombatToPlay(state, state.activePlayerId) ? "mainPhase2" : state.phase });
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
        volleys={volleys}
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
        handLimitDiscard={handLimit.mode}
        boardAllocation={healAllocation.mode}
        boardPick={boardPick.mode}
        heldTargets={[...boardPick.locked, ...(heldTarget.held ? [heldTarget.held] : [])]}
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
          onAdvance: () => {
            playButtonClick();
            runAction({ type: "advancePhase", playerId: activePlayerId });
          },
          onEndTurn: () => {
            playButtonClick();
            runAction({ type: "endTurn", playerId: activePlayerId });
          },
          secondary: phase.secondary && {
            label: phase.secondary.label,
            onClick: () => {
              playButtonClick();
              runAction({ type: "endTurn", playerId: activePlayerId });
            },
          },
        }}
        onMenu={() => board.setShowPauseMenu(true)}
        onHandCardClick={(id, options) => board.handleHandCardClick(id, { fromZoom: options?.fromZoom })}
        onPlayCard={(instanceId, targetInstanceId, boardSlot) => {
          // Le lâcher a déjà montré l'avertissement de Déraison : il vaut confirmation.
          if (targetInstanceId) runAction({ type: "playCard", playerId: activePlayerId, instanceId, targetInstanceId, boardSlot });
          else board.handleHandCardClick(instanceId, { dropped: true, boardSlot });
        }}
        onAttack={(attackerInstanceId, defenderInstanceId) =>
          runAction({ type: "attack", playerId: activePlayerId, attackerInstanceId, defenderInstanceId })
        }
        onBreakOnTarget={(instanceId, targetInstanceId) => runAction({ type: "breakObject", playerId: activePlayerId, instanceId, targetInstanceId })}
        onDropOnGraveyard={board.handleDropOnGraveyard}
        onBoardCardClick={handleAnyBoardCardClick}
        shipAbility={shipAbility.panel}
        opponentShipAbility={shipAbility.opponentPanel}
        onActivateAbility={board.requestAbility}
        onAbilityDrop={board.activateAbilityOn}
        onAssemblageDrop={board.handleAssemblageDrop}
        onShipClick={(ownerId) => {
          if (pending?.kind === "shipTarget") {
            runAction({ type: "activateShipAbility", playerId: activePlayerId, targetPlayerId: ownerId });
            board.clearSelection();
            return;
          }
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
      {state.pendingReaction?.awaitingPlayerId === viewerPlayerId &&
        myReactionCandidates.length > 0 &&
        !directTarget &&
        !(pending?.kind === "reaction" && pending.needsTarget) && (
          <ReactionPrompt
            candidates={myReactionCandidates}
            onActivateMany={activateSelectedReactions}
            onPass={() => runReactionAction({ type: "passReaction", playerId: viewerPlayerId })}
          />
        )}
      {/* Le NAVIRE seul à pouvoir répondre : son panneau s'allume, et ce
          bandeau dit pourquoi sans couper la partie. Un panneau modal à
          chaque changement de Marée ferait répéter le même « non » toute la
          partie, pour une capacité qui ne sert qu'une fois. */}
      {state.pendingReaction?.awaitingPlayerId === viewerPlayerId &&
        myReactionCandidates.length === 0 &&
        shipAbility.windowEntry && (
          <ShipWindowHint
            name={shipAbility.windowEntry.name}
            onPass={() => runReactionAction({ type: "passReaction", playerId: viewerPlayerId })}
          />
        )}
      {pending?.kind === "reaction" && pending.needsTarget && (() => {
        // Un Objet réactif peut répondre depuis la MAIN (règle du 29/09/2026).
        const sourceCardId = [...viewerPlayer.board, ...viewerPlayer.hand, ...otherPlayer.board].find((u) => u.instanceId === pending.sourceInstanceId)?.cardId;
        const decline = () => {
          board.clearSelection();
          runReactionAction({ type: "passReaction", playerId: viewerPlayerId });
        };
        return (
          <ChoiceBanner
            choiceKey={`${pending.sourceInstanceId}:${pending.abilityIndex}`}
            source={sourceCardId ? getCardDefinition(sourceCardId).name : null}
            title={reactionTargetHint(sourceCardId, pending.abilityIndex)}
            detail="Touche l'unité sur le plateau. Sans réponse, l'effet ne s'applique pas."
            actions={[{ label: "Ne rien faire", onClick: decline }]}
            onExpire={decline}
          />
        );
      })()}
      {!state.pendingReaction && state.pendingChoice?.playerId === viewerPlayerId && (
        <PendingChoicePrompt
          choice={state.pendingChoice}
          onChoose={(choice) => runReactionAction({ type: "resolveChoice", playerId: viewerPlayerId, choice })}
        />
      )}
      {boardPick.banner && (
        <ChoiceBanner
          choiceKey={boardPick.banner.choiceKey}
          source={boardPick.banner.source}
          title={boardPick.banner.title}
          detail={boardPick.banner.detail}
          actions={boardPick.banner.actions}
          onExpire={boardPick.banner.onExpire}
        />
      )}
      {healAllocation.banner && (
        <ChoiceBanner
          choiceKey={healAllocation.banner.choiceKey}
          source={healAllocation.banner.source}
          title={healAllocation.banner.title}
          detail={healAllocation.banner.detail}
          actions={healAllocation.banner.actions}
          onExpire={healAllocation.banner.onExpire}
        />
      )}
      {/* Les dés se lancent SUR la table, pour les deux joueurs ; le jet ouvert y garde ses gestes. */}
      {/* L'état RÉEL : le dé part dès le tirage, pendant que le plateau retient son issue. */}
      <TableDice state={liveState} viewerId={viewerPlayerId} onAction={runReactionAction} />
      {!state.pendingReaction && state.pendingChoice?.kind === "deckLook" && state.pendingChoice.playerId === viewerPlayerId && (
        <DeckLookPrompt
          choice={state.pendingChoice}
          onConfirm={(takeInstanceIds, restOrder) =>
            runReactionAction({ type: "resolveChoice", playerId: viewerPlayerId, choice: { takeInstanceIds, ...(restOrder ? { restOrder } : {}) } })
          }
          onRefuse={() => runReactionAction({ type: "resolveChoice", playerId: viewerPlayerId, choice: "pass" })}
        />
      )}
      {/* Défausse au Cimetière : sur la table (bandeau + glisser). Sous la pioche : la fenêtre. */}
      {handLimit.banner && (
        <ChoiceBanner
          choiceKey={handLimit.banner.choiceKey}
          source={handLimit.banner.source}
          title={handLimit.banner.title}
          detail={handLimit.banner.detail}
          actions={handLimit.banner.actions}
          onExpire={handLimit.banner.onExpire}
        />
      )}
      {!state.pendingReaction && state.pendingChoice?.kind === "handDiscard" && state.pendingChoice.destination === "deckBottom" && state.pendingChoice.playerId === viewerPlayerId && (
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
        <GlassAlert message={deraison.warning} severity="warning" onDismiss={deraison.dismiss} onExpire={deraison.hide} />
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
      {graveyardPick && (() => {
        // Une réaction ne part pas comme une action normale (elle peut
        // survenir hors de son tour) : `runReactionAction` pour elle,
        // `runAction` pour le Bris et la pose.
        const view = graveyardPickView(liveState, viewerPlayerId, graveyardPick);
        const submit = graveyardPick.kind === "reaction" ? runReactionAction : runAction;
        return (
          <GraveyardPickPrompt
            sourceCardId={view.sourceCardId}
            choices={view.choices}
            onConfirm={(chosen) => {
              board.setGraveyardPick(null);
              submit(view.actionFor(chosen));
            }}
            onCancel={() => board.setGraveyardPick(null)}
          />
        );
      })()}
      {board.assemblagePick && (() => {
        const { card, boardSlot, proposal } = board.assemblagePick;
        return (
          <AssemblagePrompt
            card={card}
            proposal={proposal}
            onChooseOthers={() => board.setAssemblagePick({ card, boardSlot })}
            board={liveState.players.find((p) => p.id === activePlayerId)?.board ?? []}
            onAssemble={(assemblage) => {
              board.setAssemblagePick(null);
              runAction({ type: "playCard", playerId: activePlayerId, instanceId: card.instanceId, boardSlot, assemblage });
            }}
            onPlayNormally={() => {
              board.setAssemblagePick(null);
              runAction({ type: "playCard", playerId: activePlayerId, instanceId: card.instanceId, boardSlot });
            }}
            onCancel={() => board.setAssemblagePick(null)}
          />
        );
      })()}
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
          turnNumber={state.turnNumber}
          auraContext={auraContextFor(viewerPlayer.board.some((u) => u.instanceId === detailInstance.instanceId) ? viewerPlayer : otherPlayer)}
          onClose={() => board.setDetailInstance(null)}
        />
      )}
      {board.showPauseMenu && <MatchPauseMenu onResume={() => board.setShowPauseMenu(false)} onConcede={concedeMatch} onQuit={onExit} />}
    </>
  );
}
