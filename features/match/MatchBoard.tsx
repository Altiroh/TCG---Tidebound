"use client";

import { useEffect, useState } from "react";
import {
  computeEffectiveStats,
  deraisonAnchorDamage,
  reasonCeiling,
  dispatch,
  eligibleCandidatesFor,
  getCardDefinition,
  getShipDefinition,
  isVisibleDuringTide,
  stepBotTurn,
  STATUS_SILENCE,
  UNIT_CARD_TYPES,
  type BotDifficulty,
  type CardInstance,
  type GameState,
  type PendingReactionCandidate,
  type PlayerAction,
  type PlayerId,
} from "@/game";
import { needsPlayTarget } from "@/features/match/needsPlayTarget";
import { Button } from "@/components/ui/Button";
import { GlassAlert } from "@/components/ui/GlassAlert";
import { ActionToastStack } from "@/features/match/ActionToastStack";
import { AttackImpactLayer } from "@/features/match/AttackImpactLayer";
import { BoardBackdrop } from "@/features/match/BoardBackdrop";
import { BoardCardTile } from "@/features/match/BoardCardTile";
import { BoardStage } from "@/features/match/BoardStage";
import { CardDetailModal } from "@/features/match/CardDetailModal";
import { CardFlightLayer } from "@/features/match/CardFlightLayer";
import { CargoCluster } from "@/features/match/CargoCluster";
import { DragTargetingTrail } from "@/features/match/DragTargetingTrail";
import { EquipLinkOverlay } from "@/features/match/EquipLinkOverlay";
import { EventFeed } from "@/features/match/EventFeed";
import { GraveyardViewer } from "@/features/match/GraveyardViewer";
import { HandFan } from "@/features/match/HandFan";
import { OpponentHandFan } from "@/features/match/OpponentHandFan";
import { PhaseActionButton } from "@/features/match/PhaseActionButton";
import { PendingChoicePrompt } from "@/features/match/PendingChoicePrompt";
import { PhaseBanner } from "@/features/match/PhaseBanner";
import { ReactionPrompt } from "@/features/match/ReactionPrompt";
import { ShipInstrumentCluster } from "@/features/match/ShipInstrumentCluster";
import { VictoryScreen } from "@/features/match/VictoryScreen";
import { useDisplayNames } from "@/features/match/useDisplayNames";
import { TideOrientationTile } from "@/features/match/TideOrientationTile";
import { TideProgressBar } from "@/features/match/TideProgressBar";
import { useActionToasts } from "@/features/match/useActionToasts";
import { useAttackPresentation } from "@/features/match/useAttackPresentation";
import { pendingDrawCount, pendingDrawIds, useCardFlights, type CardFlight } from "@/features/match/useCardFlights";
import { useDeraisonWarning } from "@/features/match/useDeraisonWarning";
import { usePhaseBannerEvent } from "@/features/match/usePhaseBannerEvent";

/** Pause entre deux actions du bot (`stepBotTurn`) — assez long pour voir chaque pioche/pose/Sabordage se jouer (animation de vol ~650ms) avant l'action suivante, sans donner l'impression d'attendre. */
const BOT_ACTION_DELAY_MS = 1100;

/** Centres approximatifs (repère `BoardStage`, 1672×941) des zones pioche/main/cimetière de chaque côté — repris des coordonnées déjà posées pour `CargoCluster`/les mains/le plateau, pour l'animation `CardFlightLayer`. */
const OWN_DECK_POS = { x: 1310, y: 640 };
const OWN_GRAVEYARD_POS = { x: 1430, y: 640 };
const OWN_HAND_POS = { x: 836, y: 872 };
const OWN_BOARD_POS = { x: 740, y: 640 };
const OPPONENT_DECK_POS = { x: 1310, y: 233 };
const OPPONENT_GRAVEYARD_POS = { x: 1430, y: 233 };
const OPPONENT_HAND_POS = { x: 836, y: 40 };
const OPPONENT_BOARD_POS = { x: 740, y: 233 };

interface MatchBoardProps {
  initialState: GameState;
  onExit: () => void;
  /** Si défini, ce joueur est joué automatiquement par le bot (`runBotTurn`) plutôt qu'en hot-seat. */
  botPlayerId?: PlayerId;
  botDifficulty?: BotDifficulty;
}

type Pending =
  | { kind: "playCard"; instanceId: string; needsTarget: boolean }
  | { kind: "attack"; attackerId: string }
  | { kind: "break"; instanceId: string; needsTarget: boolean }
  | { kind: "reaction"; sourceInstanceId: string; abilityIndex: number; needsTarget: boolean };

function isUnitType(type: string): boolean {
  return (UNIT_CARD_TYPES as readonly string[]).includes(type);
}

/** Instance de MAIN en cours de glissement, décodée depuis `DataTransfer` au drop. */
const DRAG_MIME_HAND = "application/x-tidebound-card-instance";
/** Unité de PLATEAU (à soi) en cours de glissement — vers une cible (attaque) ou vers le cimetière (Sabordage). */
const DRAG_MIME_UNIT = "application/x-tidebound-board-unit";

/**
 * Plateau d'une partie locale (hot-seat ou contre un bot).
 *
 * "Perspective du viewer" : en hot-seat pur (`botPlayerId` absent), le bas
 * de l'écran suit le joueur actif (on se passe l'appareil) — comportement
 * historique, inchangé. Contre un bot, le joueur humain reste TOUJOURS en
 * bas, même pendant le tour du bot : l'écran ne doit pas se réorganiser
 * pendant que l'adversaire joue.
 */
export function MatchBoard({ initialState, onExit, botPlayerId, botDifficulty }: MatchBoardProps) {
  const [liveState, setState] = useState<GameState>(initialState);
  // `state` = état AFFICHÉ (retenu avant le choc pendant une attaque, cf. `useAttackPresentation`) ; toute
  // action se valide et s'applique sur `liveState`, l'état de jeu réel.
  const { displayState: state, attacks } = useAttackPresentation(liveState);
  const [pending, setPending] = useState<Pending | null>(null);
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [draggingUnitId, setDraggingUnitId] = useState<string | null>(null);
  /** Origine (viewport) du glisser-déposer en cours (main ou unité de plateau) — alimente `DragTargetingTrail`. */
  const [dragAnchor, setDragAnchor] = useState<{ x: number; y: number } | null>(null);
  const [dragOverTargetId, setDragOverTargetId] = useState<string | null>(null);
  const [dragOverOtherBoard, setDragOverOtherBoard] = useState(false);
  const [dragOverGraveyard, setDragOverGraveyard] = useState(false);
  const [graveyardViewerPlayerId, setGraveyardViewerPlayerId] = useState<PlayerId | null>(null);
  const [detailInstance, setDetailInstance] = useState<CardInstance | null>(null);
  const [showQuitConfirm, setShowQuitConfirm] = useState(false);
  /** Candidats à cible restant à traiter après celui en cours — sélection multiple dans `ReactionPrompt` :
      les capacités sans cible sont appliquées d'un coup, celles avec cible s'enchaînent une par une. */
  const [reactionQueue, setReactionQueue] = useState<PendingReactionCandidate[]>([]);
  // Contre le bot, le joueur humain est le compte connecté (s'il y en a un) ; en hot-seat, personne n'est identifiable.
  const displayNames = useDisplayNames(botPlayerId ? ["me"] : []);

  const activePlayerId = state.activePlayerId;
  const humanPlayerId = botPlayerId ? state.players.find((p) => p.id !== botPlayerId)!.id : null;
  // En hot-seat pur (pas de bot), l'écran suit qui doit agir MAINTENANT —
  // le joueur actif normalement, mais celui attendu par une fenêtre de
  // réaction si elle diffère (l'adversaire vient de jouer une carte
  // ouvrant une réaction pour l'autre joueur). Contre un bot, le joueur
  // humain reste toujours en bas, dans les deux cas.
  const respondingPlayerId = state.pendingReaction?.awaitingPlayerId ?? activePlayerId;
  const viewerPlayerId = humanPlayerId ?? respondingPlayerId;
  const viewerPlayer = state.players.find((p) => p.id === viewerPlayerId)!;
  const otherPlayer = state.players.find((p) => p.id !== viewerPlayerId)!;
  const viewerShip = getShipDefinition(viewerPlayer.shipId);
  const otherShip = getShipDefinition(otherPlayer.shipId);
  const isViewerTurn = activePlayerId === viewerPlayerId;
  const canPlayCards = isViewerTurn && state.phase === "mainPhase" && !state.pendingReaction && !state.pendingChoice;
  // Si aucune unité du joueur actif ne peut attaquer (toutes engourdies,
  // ayant déjà attaqué, ou rendues inactives par la Marée), proposer la
  // Phase de combat n'aurait aucun intérêt : le bouton unique saute
  // directement à "Fin de tour", sans passage à vide par une Phase de
  // combat sans aucune action possible.
  const activePlayerBoard = state.players.find((p) => p.id === activePlayerId)?.board ?? [];
  const hasAnyAttacker = activePlayerBoard.some((unit) => {
    const def = getCardDefinition(unit.cardId);
    return (
      isUnitType(def.type) &&
      !unit.summoningSick &&
      !unit.hasAttackedThisTurn &&
      !computeEffectiveStats(unit, state.environment.tideState).inactive
    );
  });
  const myReactionCandidates = state.pendingReaction?.awaitingPlayerId === viewerPlayerId
    ? eligibleCandidatesFor(state, state.pendingReaction.events, viewerPlayerId, state.pendingReaction.turnNumber, state.pendingReaction.usedCandidateKeys)
    : [];

  const bannerEvent = usePhaseBannerEvent(state);
  const actionToasts = useActionToasts(state);
  const cardFlights = useCardFlights(state);
  // Cartes piochées encore en vol depuis le deck : absentes de la main jusqu'à leur atterrissage.
  const viewerDrawing = pendingDrawIds(cardFlights, viewerPlayerId);
  const deraison = useDeraisonWarning(state, viewerPlayer, draggingId);

  function getFlightCoords(flight: CardFlight) {
    const isViewer = flight.playerId === viewerPlayerId;
    if (flight.kind === "draw") {
      return isViewer ? { from: OWN_DECK_POS, to: OWN_HAND_POS } : { from: OPPONENT_DECK_POS, to: OPPONENT_HAND_POS };
    }
    if (flight.kind === "play") {
      return isViewer ? { from: OWN_HAND_POS, to: OWN_BOARD_POS } : { from: OPPONENT_HAND_POS, to: OPPONENT_BOARD_POS };
    }
    return isViewer
      ? { from: OWN_BOARD_POS, to: OWN_GRAVEYARD_POS }
      : { from: OPPONENT_BOARD_POS, to: OPPONENT_GRAVEYARD_POS };
  }

  function playerLabel(id: PlayerId): string {
    if (id === botPlayerId) return "du Bot";
    return id === "p1" ? "du Joueur 1" : "du Joueur 2";
  }
  const bannerText = bannerEvent
    ? bannerEvent.kind === "combatPhase"
      ? "Phase de combat"
      : `Tour ${playerLabel(bannerEvent.playerId)}`
    : null;

  // Joue automatiquement le tour du bot dès qu'il devient actif, ET
  // chaque fois qu'une fenêtre de réaction l'attend — même hors de son
  // propre tour (l'humain vient de jouer une carte à laquelle le bot a
  // une réaction facultative éligible). UNE action à la fois
  // (`stepBotTurn`, pas `runBotTurn`), avec un délai entre chaque : le
  // tour entier appliqué d'un coup faisait "téléporter" les cartes du
  // bot directement à leur état final (une seule transition React, donc
  // aucune animation de pioche/pose/Sabordage n'avait de tour à jouer).
  const botAwaitingReaction = state.pendingReaction?.awaitingPlayerId === botPlayerId;
  useEffect(() => {
    if (state.status !== "active" || !botDifficulty) return;
    if (activePlayerId !== botPlayerId && !botAwaitingReaction) return;

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
      setSelectedBoardId(null);
      setError(null);
      if (!step.done) {
        timer = setTimeout(() => tick(step.state), BOT_ACTION_DELAY_MS);
      }
    }

    timer = setTimeout(() => tick(liveState), BOT_ACTION_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `state` volontairement absent : ne doit réagir qu'aux transitions "c'est au bot d'agir", pas à chaque changement d'état (sinon la boucle se relancerait en double à chaque `setState` qu'elle déclenche elle-même) — `tick` capture l'état voulu via son propre paramètre plutôt que via la closure.
  }, [activePlayerId, botAwaitingReaction, state.status, botPlayerId, botDifficulty]);

  // Abandonner la partie via ÉCHAP plutôt qu'un bouton visible en permanence
  // à l'écran — libère l'espace pour le board pleine page. Une fiche de
  // carte ouverte (`detailInstance`) intercepte la touche en priorité : elle
  // se ferme seule, sans déclencher la confirmation de sortie derrière.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (detailInstance) {
        setDetailInstance(null);
        return;
      }
      // Bascule : une pression ouvre la confirmation, une seconde l'annule (Échap = "annuler", pas "confirmer").
      setShowQuitConfirm((current) => !current);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [detailInstance]);

  function clearSelection() {
    setPending(null);
    setSelectedBoardId(null);
    setReactionQueue([]);
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

  /**
   * Pendant une fenêtre de réaction, celui qui doit répondre n'est pas
   * forcément le joueur actif (`isViewerTurn`) — jamais garder ce garde-
   * fou ici : l'UI n'affiche les boutons Activer/Passer que si
   * `state.pendingReaction?.awaitingPlayerId === viewerPlayerId` de
   * toute façon.
   */
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

  /**
   * Sélection multiple de `ReactionPrompt` : les capacités sans cible sont appliquées d'un coup (`dispatch`
   * enchaîné sur l'état retourné par le précédent, un seul `setState` final — jamais coup par coup sur `state`,
   * qui resterait figé à sa valeur de ce rendu entre deux appels synchrones). Celles qui demandent une cible
   * sont mises en file (`reactionQueue`) et proposées une par une via le mécanisme existant de clic sur le
   * plateau, sans rouvrir toute la fenêtre entre chacune.
   */
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

  function handleHandCardClick(instanceId: string, confirmed = false) {
    if (!canPlayCards) return;
    const card = viewerPlayer.hand.find((c) => c.instanceId === instanceId);
    if (!card) return;
    if (!confirmed && deraison.interceptClick(instanceId)) return;
    const def = getCardDefinition(card.cardId);
    const needsTarget = needsPlayTarget(def, viewerPlayer.board);
    setError(null);
    if (needsTarget) {
      setSelectedBoardId(null);
      setPending({ kind: "playCard", instanceId, needsTarget: true });
    } else {
      runAction({ type: "playCard", playerId: activePlayerId, instanceId });
    }
  }

  function handleOwnBoardCardClick(instanceId: string) {
    if (!isViewerTurn) return;
    if (pending?.kind === "attack") {
      // Un clic sur son propre plateau pendant une sélection de cible d'attaque : annule.
      setPending(null);
      return;
    }
    setSelectedBoardId((current) => (current === instanceId ? null : instanceId));
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
      // File de sélection multiple (`activateSelectedReactions`) : enchaîne sur la prochaine capacité à cible
      // sans rouvrir toute la fenêtre, jusqu'à épuisement de la file.
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
      runAction({
        type: "playCard",
        playerId: activePlayerId,
        instanceId: pending.instanceId,
        targetInstanceId: instanceId,
      });
      return;
    }
    if (pending?.kind === "break" && pending.needsTarget) {
      runAction({ type: "breakObject", playerId: activePlayerId, instanceId: pending.instanceId, targetInstanceId: instanceId });
      return;
    }
    if (pending?.kind === "attack") {
      if (ownerId === viewerPlayerId) return; // géré par handleOwnBoardCardClick
      runAction({
        type: "attack",
        playerId: activePlayerId,
        attackerInstanceId: pending.attackerId,
        defenderInstanceId: instanceId,
      });
      return;
    }
    if (ownerId === viewerPlayerId) handleOwnBoardCardClick(instanceId);
  }

  function startBreak(unit: CardInstance) {
    if (!isViewerTurn) return;
    const def = getCardDefinition(unit.cardId);
    const needsTarget = (def.onBreakEffects ?? []).some((e) => e.target.kind === "chosenUnit");
    if (needsTarget) {
      setPending({ kind: "break", instanceId: unit.instanceId, needsTarget: true });
    } else {
      runAction({ type: "breakObject", playerId: activePlayerId, instanceId: unit.instanceId });
    }
  }

  // --- Glisser-déposer depuis la main -------------------------------------
  // Ajouté EN PLUS du clic (jamais à sa place) : le clic reste le parcours
  // principal, notamment tant que le support tactile du drag HTML5 natif
  // reste inégal sur mobile.
  function handleHandDragStart(e: React.DragEvent, instanceId: string) {
    if (!canPlayCards) return;
    e.dataTransfer.setData(DRAG_MIME_HAND, instanceId);
    e.dataTransfer.effectAllowed = "move";
    setDraggingId(instanceId);
    // Le suivi pointillé n'a de sens que pour CHOISIR une cible (effet ciblé) — une simple pose sur le
    // plateau n'a pas de cible, la carte tombe sur le premier Slot libre quel que soit l'endroit du dépôt.
    const card = viewerPlayer.hand.find((c) => c.instanceId === instanceId);
    const needsTarget = card ? needsPlayTarget(getCardDefinition(card.cardId), viewerPlayer.board) : false;
    if (needsTarget) {
      const rect = e.currentTarget.getBoundingClientRect();
      setDragAnchor({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
    }
  }
  function handleHandDragEnd() {
    setDraggingId(null);
    setDragOverTargetId(null);
    setDragAnchor(null);
  }
  function handleOwnBoardDragOver(e: React.DragEvent) {
    if (!draggingId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }
  function handleOwnBoardDrop(e: React.DragEvent) {
    e.preventDefault();
    const instanceId = e.dataTransfer.getData(DRAG_MIME_HAND);
    setDraggingId(null);
    // Le glisser a déjà montré l'avertissement de Déraison : le dépôt vaut confirmation.
    if (instanceId) handleHandCardClick(instanceId, true);
  }

  // --- Glisser-déposer une unité de plateau : attaquer ou Saborder --------
  // Une seule source de glissement pour les deux usages (le geste "prendre
  // l'unité" est le même) — c'est la CIBLE du dépôt qui décide de l'action
  // (adversaire = attaque, cimetière = Sabordage) ; `dispatch` refuse
  // silencieusement toute combinaison illégale (mauvaise Phase, etc.).
  function handleUnitDragStart(e: React.DragEvent, instanceId: string) {
    if (!isViewerTurn) return;
    e.dataTransfer.setData(DRAG_MIME_UNIT, instanceId);
    e.dataTransfer.effectAllowed = "move";
    setDraggingUnitId(instanceId);
    const rect = e.currentTarget.getBoundingClientRect();
    setDragAnchor({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
  }
  function handleUnitDragEnd() {
    setDraggingUnitId(null);
    setDragOverTargetId(null);
    setDragOverOtherBoard(false);
    setDragOverGraveyard(false);
    setDragAnchor(null);
  }
  function handleOtherBoardDragOver(e: React.DragEvent) {
    // En Phase principale, une unité se glisse pour être Sabordée : pas de zone d'attaque à signaler.
    if (!draggingUnitId || state.phase !== "combatPhase") return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverOtherBoard(true);
  }
  function handleOtherBoardDragLeave() {
    setDragOverOtherBoard(false);
  }
  function handleOtherBoardDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOverOtherBoard(false);
    const instanceId = e.dataTransfer.getData(DRAG_MIME_UNIT);
    setDraggingUnitId(null);
    if (instanceId) runAction({ type: "attack", playerId: activePlayerId, attackerInstanceId: instanceId });
  }
  function handleGraveyardDragOver(e: React.DragEvent) {
    if (!draggingUnitId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverGraveyard(true);
  }
  function handleGraveyardDragLeave() {
    setDragOverGraveyard(false);
  }
  function handleGraveyardDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOverGraveyard(false);
    const instanceId = e.dataTransfer.getData(DRAG_MIME_UNIT);
    setDraggingUnitId(null);
    if (instanceId) runAction({ type: "saborder", playerId: activePlayerId, instanceId });
  }

  /** Déposer directement SUR un permanent (à soi ou adverse) résout la cible en un seul geste, sans étape intermédiaire — carte de main (effet ciblé) ou unité de plateau (attaque). */
  function handleBoardTileDragOver(e: React.DragEvent, targetInstanceId: string) {
    if (!draggingId && !draggingUnitId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverTargetId(targetInstanceId);
  }
  function handleBoardTileDrop(e: React.DragEvent, targetInstanceId: string) {
    e.preventDefault();
    e.stopPropagation();
    setDragOverTargetId(null);
    setDragOverOtherBoard(false);

    const draggedUnitId = e.dataTransfer.getData(DRAG_MIME_UNIT);
    if (draggedUnitId) {
      setDraggingUnitId(null);
      const draggedUnit = viewerPlayer.board.find((u) => u.instanceId === draggedUnitId);
      const draggedDef = draggedUnit ? getCardDefinition(draggedUnit.cardId) : undefined;
      // Un Objet glissé sur une cible sert à résoudre son effet de bris ciblé
      // (ex: "Levier de Lest" : Sabordez une Structure) — seuls les Marins/
      // Créatures glissés sur une cible attaquent.
      if (draggedDef?.type === "objet") {
        runAction({ type: "breakObject", playerId: activePlayerId, instanceId: draggedUnitId, targetInstanceId });
      } else {
        runAction({
          type: "attack",
          playerId: activePlayerId,
          attackerInstanceId: draggedUnitId,
          defenderInstanceId: targetInstanceId,
        });
      }
      return;
    }

    const instanceId = e.dataTransfer.getData(DRAG_MIME_HAND);
    setDraggingId(null);
    if (!instanceId) return;
    const card = viewerPlayer.hand.find((c) => c.instanceId === instanceId);
    if (!card) return;
    const def = getCardDefinition(card.cardId);
    const needsTarget = needsPlayTarget(def, viewerPlayer.board);
    setError(null);
    if (needsTarget) {
      runAction({ type: "playCard", playerId: activePlayerId, instanceId, targetInstanceId });
    } else {
      runAction({ type: "playCard", playerId: activePlayerId, instanceId });
    }
  }

  if (state.status === "finished") {
    const genericName = state.winnerId === "p1" ? "Joueur 1" : "Joueur 2";
    const winnerName = state.winnerId === botPlayerId ? "Le bot" : botPlayerId ? (displayNames.me ?? genericName) : genericName;
    const winnerShip = state.winnerId === viewerPlayer.id ? viewerShip : otherShip;
    return (
      // Partie LOCALE (hot-seat, ou bot hors connexion) : jouée entièrement
      // dans le navigateur, elle ne rapporte jamais rien. Les parties contre
      // bot récompensées sont arbitrées côté serveur (`features/bot/actions.ts`).
      <VictoryScreen winner={state.winnerId ? { name: winnerName, ship: winnerShip } : undefined} onExit={onExit} />
    );
  }

  const selectedUnit = selectedBoardId ? viewerPlayer.board.find((u) => u.instanceId === selectedBoardId) : undefined;
  const selectedDef = selectedUnit ? getCardDefinition(selectedUnit.cardId) : undefined;
  const ownEmptySlots = Math.max(0, viewerShip.slotCount - viewerPlayer.board.length);
  const otherEmptySlots = Math.max(0, otherShip.slotCount - otherPlayer.board.length);
  const hasHint = pending?.kind === "playCard" || pending?.kind === "break" || pending?.kind === "attack";

  return (
    <>
      <BoardStage>
        <BoardBackdrop variant="absolute" />

        {/* Main adverse — arc inversé, remontée pour ne pas cacher son plateau. `pointer-events-none` : purement
            décorative (dos de carte, jamais interactive), et sans ça ce conteneur pleine-largeur peut intercepter
            des glisser-déposer destinés au plateau juste en-dessous. */}
        <div
          className="pointer-events-none absolute flex items-start justify-center"
          style={{ left: 0, top: -70, width: 1672, height: 220 }}
        >
          <OpponentHandFan cards={otherPlayer.hand.slice(0, Math.max(0, otherPlayer.hand.length - pendingDrawCount(cardFlights, otherPlayer.id)))} />
        </div>

        {/* Tour, nichée dans le cadre boussole en haut à droite — numéro de TOUR DE TABLE (les deux joueurs ont joué), pas `turnNumber` brut qui compte chaque tour individuel. */}
        <div className="absolute flex items-center justify-center" style={{ left: 1518, top: 272, width: 108 }}>
          <div className="text-center text-xl font-bold uppercase tracking-wide text-slate-100 [font-family:var(--font-card-title)] [text-shadow:0_1px_4px_rgba(0,0,0,0.95),0_0_8px_rgba(0,0,0,0.8)]">
            Tour {Math.ceil(state.turnNumber / 2)}
          </div>
        </div>

        {/* Fil des événements — "pourquoi quelque chose vient de se produire" */}
        <div className="absolute" style={{ left: 1462, top: 350, width: 204, height: 170 }}>
          <EventFeed
            state={state}
            playerLabel={(id) =>
              id === botPlayerId ? "Le bot" : id === humanPlayerId ? (displayNames.me ?? "Joueur 1") : id === "p1" ? "Joueur 1" : id === "p2" ? "Joueur 2" : "?"
            }
          />
        </div>

        {/* Ligne de plateau adverse */}
        <div className="absolute" data-ship-target={otherPlayer.id} style={{ left: 0, top: 125, width: 172 }}>
          <ShipInstrumentCluster
            anchor={otherPlayer.anchor}
            anchorMax={otherShip.startingAnchor}
            reason={otherPlayer.reason}
            reasonMax={reasonCeiling(otherPlayer)}
            illustration={otherShip.illustration}
            deraisonDamage={deraisonAnchorDamage(otherPlayer, otherPlayer.reason)}
          />
        </div>
        <div
          onDragOver={handleOtherBoardDragOver}
          onDragLeave={handleOtherBoardDragLeave}
          onDrop={handleOtherBoardDrop}
          className={`absolute flex items-center justify-center gap-2 rounded-md p-1 transition-colors ${
            dragOverOtherBoard ? "bg-rose-500/10 ring-2 ring-rose-500/60" : ""
          }`}
          style={{ left: 235, top: 130, width: 1010, height: 205 }}
        >
          {otherPlayer.board.map((unit) => (
            <div
              key={unit.instanceId}
              data-board-unit={unit.instanceId}
              onDragOver={(e) => handleBoardTileDragOver(e, unit.instanceId)}
              onDragLeave={() => setDragOverTargetId((id) => (id === unit.instanceId ? null : id))}
              onDrop={(e) => handleBoardTileDrop(e, unit.instanceId)}
              className={dragOverTargetId === unit.instanceId ? "rounded-md ring-2 ring-board-accent" : ""}
            >
              <BoardCardTile
                instance={unit}
                tideState={state.environment.tideState}
                selected={pending?.kind === "attack"}
                onClick={() => handleAnyBoardCardClick(unit.instanceId, otherPlayer.id)}
                onShowDetail={() => setDetailInstance(unit)}
                hiddenFromViewer={!isVisibleDuringTide(getCardDefinition(unit.cardId), state.environment.tideState)}
              />
            </div>
          ))}
          {Array.from({ length: otherEmptySlots }).map((_, i) => (
            <EmptySlot key={`other-empty-${i}`} />
          ))}
        </div>
        <div className="absolute" style={{ left: 1250, top: 143, width: 240 }}>
          <CargoCluster
            deckCount={otherPlayer.deck.length}
            graveyardCount={otherPlayer.graveyard.length}
            width={240}
            onOpenGraveyard={() => setGraveyardViewerPlayerId(otherPlayer.id)}
          />
        </div>

        {/* Bande centrale : tuile de sens de Marée (gauche), progression de la Marée (centre), interaction (droite) */}
        <div className="absolute" style={{ left: 40, top: 350, width: 150, height: 170 }}>
          <TideOrientationTile orientation={state.environment.tideOrientation} />
        </div>

        {/* Invitation à réagir — priorité d'affichage sur tout le reste tant qu'elle reste ouverte (Notion
            "Moteur de partie" : aucune action normale possible tant qu'une réaction est en attente). Repliée dès
            qu'une capacité ciblée est choisie (`pending.kind === "reaction" && needsTarget`) pour laisser cliquer
            une cible sur le plateau — remplacée par un petit rappel non bloquant. */}
        {state.pendingReaction?.awaitingPlayerId === viewerPlayerId &&
          myReactionCandidates.length > 0 &&
          !(pending?.kind === "reaction" && pending.needsTarget) && (
            <ReactionPrompt
              candidates={myReactionCandidates}
              onActivateMany={activateSelectedReactions}
              onPass={() => runReactionAction({ type: "passReaction", playerId: viewerPlayerId })}
            />
          )}
        {pending?.kind === "reaction" && pending.needsTarget && (
          <div className="fixed left-1/2 top-6 z-[70] -translate-x-1/2 rounded-full border border-white/25 bg-slate-950/80 px-4 py-2 text-xs text-slate-200 backdrop-blur-md">
            Choisissez une cible sur le plateau.
          </div>
        )}

        {state.pendingChoice?.playerId === viewerPlayerId && (
          <PendingChoicePrompt
            reasonLossAmount={state.pendingChoice.reasonLossAmount}
            anchorDamageAmount={state.pendingChoice.anchorDamageAmount}
            onChoose={(choice) => runReactionAction({ type: "resolveChoice", playerId: viewerPlayerId, choice })}
          />
        )}

        <div
          className="absolute flex flex-col items-center justify-center gap-2 text-center"
          style={{ left: 290, top: 340, width: 930, height: 190 }}
        >
          <TideProgressBar tideState={state.environment.tideState} tideRemainingTurns={state.environment.tideRemainingTurns} />
          {hasHint && (
            <p className="max-w-md rounded-md bg-black/50 px-3 py-1 text-xs text-slate-300">
              {pending?.kind === "playCard"
                  ? "Choisissez une cible sur le plateau (à vous ou adverse)."
                  : pending?.kind === "break"
                    ? "Choisissez une cible pour l'effet de bris."
                    : "Choisissez une cible adverse, ou attaquez le Navire directement."}
            </p>
          )}
        </div>

        <div className="absolute flex flex-col items-center gap-2" style={{ left: 1473, top: 555, width: 182 }}>
          <PhaseActionButton
            isMyTurn={isViewerTurn}
            phase={state.phase === "mainPhase" && !hasAnyAttacker ? "combatPhase" : state.phase}
            onAdvancePhase={() => runAction({ type: "advancePhase", playerId: activePlayerId })}
            onEndTurn={() => runAction({ type: "endTurn", playerId: activePlayerId })}
            size={120}
          />
          {pending && isViewerTurn && (
            <Button variant="secondary" onClick={clearSelection}>
              Annuler
            </Button>
          )}
        </div>

        {/* Ligne de plateau du viewer */}
        <div className="absolute" data-ship-target={viewerPlayer.id} style={{ left: 0, top: 530, width: 172 }}>
          <ShipInstrumentCluster
            anchor={viewerPlayer.anchor}
            anchorMax={viewerShip.startingAnchor}
            reason={viewerPlayer.reason}
            reasonMax={reasonCeiling(viewerPlayer)}
            illustration={viewerShip.illustration}
            deraisonDamage={deraisonAnchorDamage(viewerPlayer, viewerPlayer.reason)}
          />
        </div>
        <div
          onDragOver={handleOwnBoardDragOver}
          onDrop={handleOwnBoardDrop}
          className="absolute flex items-center justify-center gap-2 rounded-md p-1"
          style={{ left: 235, top: 538, width: 1010, height: 205 }}
        >
          {viewerPlayer.board.map((unit) => {
            // Glisser une carte de son plateau sert à deux choses selon la Phase : en Phase principale, n'importe
            // quel permanent se glisse sur le crâne pour être Sabordé (seul moyen de Saborder — plus de bouton) ;
            // en Phase de combat, seuls les Marins/Créatures qui peuvent attaquer se glissent. Une
            // unité Engourdie (maladie d'invocation), déjà Silencée, déjà attaquée ce tour-ci, ou rendue
            // inactive par la Marée (ex: Masse-Sombre pendant Calme) ne peut pas (encore) attaquer — pas
            // de raison d'être glissée, ni du glow rouge qui indique une cible d'attaque disponible. Pas
            // de mot-clé "attaques multiples" dans le catalogue actuel : `hasAttackedThisTurn` suffit tant
            // qu'aucune carte n'accorde d'attaque supplémentaire (le jour où l'une le ferait, une vraie
            // limite par carte remplacerait ce booléen simple).
            const canAttack =
              isViewerTurn &&
              state.phase === "combatPhase" &&
              isUnitType(getCardDefinition(unit.cardId).type) &&
              !unit.summoningSick &&
              !unit.hasAttackedThisTurn &&
              !unit.statuses?.includes(STATUS_SILENCE) &&
              !computeEffectiveStats(unit, state.environment.tideState).inactive;

            return (
            <div
              key={unit.instanceId}
              data-board-unit={unit.instanceId}
              draggable={canAttack || canPlayCards}
              onDragStart={(e) => handleUnitDragStart(e, unit.instanceId)}
              onDragEnd={handleUnitDragEnd}
              onDragOver={(e) => handleBoardTileDragOver(e, unit.instanceId)}
              onDragLeave={() => setDragOverTargetId((id) => (id === unit.instanceId ? null : id))}
              onDrop={(e) => handleBoardTileDrop(e, unit.instanceId)}
              className={`rounded-xl transition-shadow ${dragOverTargetId === unit.instanceId ? "ring-2 ring-board-accent" : ""} ${
                draggingUnitId === unit.instanceId
                  ? "opacity-50 shadow-[0_0_25px_6px_rgba(125,211,252,0.65)]"
                  : canAttack
                    ? "shadow-[0_0_18px_4px_rgba(239,68,68,0.65)] ring-2 ring-red-500/70"
                    : ""
              } ${myReactionCandidates.some((c) => c.sourceInstanceId === unit.instanceId) ? "animate-reaction-pulse" : ""}`}
            >
              <BoardCardTile
                instance={unit}
                tideState={state.environment.tideState}
                selected={selectedBoardId === unit.instanceId || pending?.kind === "attack"}
                onClick={() => handleAnyBoardCardClick(unit.instanceId, viewerPlayer.id)}
                onShowDetail={() => setDetailInstance(unit)}
                faceDown={!isVisibleDuringTide(getCardDefinition(unit.cardId), state.environment.tideState)}
              />
            </div>
            );
          })}
          {Array.from({ length: ownEmptySlots }).map((_, i) => (
            <EmptySlot key={`own-empty-${i}`} />
          ))}
        </div>
        <div className="absolute" style={{ left: 1250, top: 550, width: 240 }}>
          <CargoCluster
            deckCount={viewerPlayer.deck.length}
            graveyardCount={viewerPlayer.graveyard.length}
            width={240}
            graveyardDropZone={{
              isOver: dragOverGraveyard,
              isAvailable: Boolean(draggingUnitId) && canPlayCards,
              onDragOver: handleGraveyardDragOver,
              onDragLeave: handleGraveyardDragLeave,
              onDrop: handleGraveyardDrop,
            }}
            onOpenGraveyard={() => setGraveyardViewerPlayerId(viewerPlayer.id)}
          />
        </div>

        {selectedUnit && selectedDef && !pending && isViewerTurn && (
          <div
            className="absolute flex flex-wrap items-center justify-center gap-2 rounded-md border border-board-accent/40 bg-black/70 px-3 py-2"
            style={{ left: 336, top: 706, width: 1000 }}
          >
            <span className="text-xs text-slate-300">{selectedDef.name} :</span>
            {state.phase === "combatPhase" &&
              isUnitType(selectedDef.type) &&
              !selectedUnit.summoningSick &&
              !selectedUnit.hasAttackedThisTurn && (
                <>
                  <Button
                    variant="secondary"
                    onClick={() => setPending({ kind: "attack", attackerId: selectedUnit.instanceId })}
                  >
                    Attaquer une cible
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() =>
                      runAction({ type: "attack", playerId: activePlayerId, attackerInstanceId: selectedUnit.instanceId })
                    }
                  >
                    Attaquer le Navire adverse
                  </Button>
                </>
              )}
            {state.phase === "mainPhase" && (
              <>
                {selectedDef.type === "objet" && (
                  <Button variant="secondary" onClick={() => startBreak(selectedUnit)}>
                    Briser
                  </Button>
                )}
                <span className="text-xs text-slate-400">Glissez-la sur le crâne pour la Saborder.</span>
              </>
            )}
            {state.phase === "combatPhase" &&
              !(isUnitType(selectedDef.type) && !selectedUnit.summoningSick && !selectedUnit.hasAttackedThisTurn) && (
                <span className="text-xs text-slate-500">
                  Aucune action disponible en Phase de combat pour cette carte.
                </span>
              )}
          </div>
        )}

        {/* Main du viewer — centrée en bas de l'écran, en éventail. `pointer-events-none` sur ce conteneur
            pleine-largeur (chaque carte se réactive individuellement, `HandFan`) : sinon la zone vide entre les
            cartes peut intercepter des glisser-déposer destinés au plateau juste au-dessus. */}
        <div className="pointer-events-none absolute flex items-end justify-center" style={{ left: 0, top: 775, width: 1672, height: 195 }}>
          <HandFan
            cards={viewerPlayer.hand.filter((card) => !viewerDrawing.has(card.instanceId))}
            tideState={state.environment.tideState}
            selectedInstanceId={pending?.kind === "playCard" ? pending.instanceId : undefined}
            disabled={!canPlayCards}
            draggable={canPlayCards}
            draggingId={draggingId}
            onDragStart={handleHandDragStart}
            onDragEnd={handleHandDragEnd}
            onClick={(instanceId) => handleHandCardClick(instanceId)}
          />
          {viewerPlayer.hand.length === 0 && <p className="text-xs text-slate-600">Main vide.</p>}
        </div>

        {/* Info du viewer, en bas à droite */}
        <div
          className={`absolute truncate rounded-md border px-2.5 py-1 text-xs ${
            isViewerTurn ? "border-board-accent/50 bg-board-accent/10 text-slate-100" : "border-slate-700/70 bg-black/60 text-slate-200"
          }`}
          style={{ left: 1462, top: 906, width: 204 }}
        >
          Joueur {viewerPlayer.id === "p1" ? "1" : "2"} — {viewerShip.name}
          {isViewerTurn ? " (à vous)" : ""}
          <span className="ml-1 text-slate-500">· {viewerPlayer.hand.length} carte(s)</span>
        </div>
        <CardFlightLayer flights={cardFlights} getCoords={getFlightCoords} />
      </BoardStage>

      <DragTargetingTrail anchor={dragAnchor} tone={draggingUnitId && state.phase === "combatPhase" ? "attack" : "effect"} />
      <EquipLinkOverlay state={state} />
      <AttackImpactLayer attacks={attacks} />
      <ActionToastStack toasts={actionToasts} />
      {error ? (
        <GlassAlert message={error} severity="error" onDismiss={() => setError(null)} />
      ) : (
        <GlassAlert message={deraison.warning} severity="warning" onDismiss={deraison.dismiss} />
      )}
      <PhaseBanner text={bannerText} bannerKey={bannerEvent?.id ?? null} />
      {graveyardViewerPlayerId && (
        <GraveyardViewer
          playerLabel={
            graveyardViewerPlayerId === botPlayerId
              ? "Bot"
              : graveyardViewerPlayerId === "p1"
                ? "Joueur 1"
                : "Joueur 2"
          }
          cards={state.players.find((p) => p.id === graveyardViewerPlayerId)!.graveyard}
          onClose={() => setGraveyardViewerPlayerId(null)}
        />
      )}
      {detailInstance && (
        <CardDetailModal
          instance={detailInstance}
          tideState={state.environment.tideState}
          boardUnits={state.players.flatMap((p) => p.board)}
          onClose={() => setDetailInstance(null)}
        />
      )}
      {showQuitConfirm && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4 backdrop-blur-md"
          onClick={() => setShowQuitConfirm(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl border border-white/15 bg-white/[0.07] p-6 shadow-[0_8px_40px_rgba(0,0,0,0.55)] backdrop-blur-2xl"
          >
            <h2 className="text-lg font-semibold text-white">Quitter la partie ?</h2>
            <p className="mt-2 text-sm text-slate-300">La partie en cours ne sera pas sauvegardée.</p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowQuitConfirm(false)}
                className="rounded-md border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium text-slate-100 transition-colors hover:bg-white/20"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={onExit}
                className="rounded-md bg-rose-600 px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
              >
                Quitter
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** Emplacement de Slot inoccupé — rend visible le nombre total de Slots qu'autorise le Navire (4/5/6), pas seulement les permanents déjà posés. */
/**
 * Surbrillance individuelle au survol d'un glisser-déposer (au lieu du
 * plateau entier auparavant) : le joueur voit précisément quels
 * emplacements libres accepteraient la carte. `onDragOver` sans
 * `preventDefault` propre à ce Slot — la propagation vers le conteneur
 * parent (qui l'appelle déjà) suffit à valider la cible de dépôt.
 */
function EmptySlot() {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      aria-hidden
      onDragEnter={() => setHovered(true)}
      onDragLeave={() => setHovered(false)}
      onDrop={() => setHovered(false)}
      className={`aspect-[5/7] w-28 rounded-xl border-[3px] border-dashed transition-colors ${
        hovered ? "border-board-accent bg-board-accent/15" : "border-slate-500/50"
      }`}
    />
  );
}
