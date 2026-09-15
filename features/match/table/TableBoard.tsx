"use client";

import { useEffect, useRef, type ReactNode } from "react";
import {
  canBeEquipTarget,
  computeEffectiveStats,
  deraisonAnchorDamage,
  eligibleChosenUnits,
  getCardDefinition,
  getShipDefinition,
  isVisibleDuringTide,
  reasonCeiling,
  RULES,
  STATUS_SILENCE,
  TIDE_STATES_ORDER,
  UNIT_CARD_TYPES,
  type CardInstance,
  type GameState,
  type PlayerId,
  type PlayerState,
} from "@/game";
import { AttackImpactLayer } from "@/features/match/AttackImpactLayer";
import { useCardBackSrc } from "@/features/cosmetics/CardBackProvider";
import { CardTile } from "@/features/match/CardTile";
import { TIDE_STATE_LABELS } from "@/features/match/cardDisplay";
import { EquipLinkOverlay } from "@/features/match/EquipLinkOverlay";
import { needsPlayTarget } from "@/features/match/needsPlayTarget";
import type { AttackAnimation } from "@/features/match/useAttackPresentation";
import styles from "@/features/board-preview/BoardPreview.module.css";
import { BackgroundLayer } from "@/features/board-preview/BackgroundLayer";
import { CenterZone } from "@/features/board-preview/CenterZone";
import { DecorLayer } from "@/features/board-preview/DecorLayer";
import { DragLayer, type AimTone } from "@/features/board-preview/DragLayer";
import { GameStage } from "@/features/board-preview/GameStage";
import { GameViewport } from "@/features/board-preview/GameViewport";
import { MotionLayer } from "@/features/board-preview/MotionLayer";
import { OpponentZone } from "@/features/board-preview/OpponentZone";
import { PlayerZone } from "@/features/board-preview/PlayerZone";
import { PreviewHand } from "@/features/board-preview/PreviewHand";
import { PhaseButton, PreviewHud } from "@/features/board-preview/PreviewHud";
import { PreviewOpponentHand } from "@/features/board-preview/PreviewOpponentHand";
import type { PreviewCardModel } from "@/features/board-preview/previewFixtures";
import { useBoardPreviewMetrics, type BoardPreviewBreakpoint } from "@/features/board-preview/useBoardPreviewMetrics";
import { useTableGestures } from "@/features/board-preview/useTableGestures";
import { useTableMotion } from "@/features/match/table/useTableMotion";

/** Ciblage en cours côté conteneur (clic sur une carte de main à effet, bris ciblé, réaction ciblée, attaque). */
export type TableTargeting = { kind: "playCard" | "break" | "reaction" | "attack"; sourceInstanceId: string } | null;

export interface TableBoardProps {
  /** État AFFICHÉ (retenu pendant une attaque, cf. `useAttackPresentation`). */
  state: GameState;
  viewerId: PlayerId;
  /** « À vous », « Au bot », « À l'adversaire »… */
  turnOwnerLabel: string;
  attacks: AttackAnimation[];
  /** Journal (`EventFeed` variante colonne). */
  journal: ReactNode;

  /** Le joueur peut poser / Saborder / Briser (sa Phase principale, rien en attente). */
  canPlayCards: boolean;
  /** Le joueur peut attaquer (sa Phase de combat, rien en attente). */
  canAttack: boolean;
  targeting: TableTargeting;
  /** Unités du joueur dont une réaction est proposée (pulsation). */
  reactionSourceIds?: readonly string[];
  /** Consigne sous la piste de Marée, avec un bouton Annuler. */
  hint?: string | null;
  onCancelHint?: () => void;

  phaseButton: { label: string; icon: string; disabled: boolean; onClick?: () => void };
  onMenu: () => void;

  /** Clic / toucher sur une carte de la main (parcours au clic : jouer, ou entrer en choix de cible). */
  onHandCardClick: (instanceId: string) => void;
  /** Carte de main lâchée sur le plateau (sans cible) ou sur sa cible. Le lâcher vaut confirmation. */
  onPlayCard: (instanceId: string, targetInstanceId?: string) => void;
  /** Attaque — sans défenseur : le Navire adverse. */
  onAttack: (attackerInstanceId: string, defenderInstanceId?: string) => void;
  /** Objet posé lâché sur une cible (effet de bris ciblé). */
  onBreakOnTarget: (objectInstanceId: string, targetInstanceId: string) => void;
  /** Carte lâchée sur le crâne du joueur : Sabordage, ou invite de bris pour un Objet. */
  onDropOnGraveyard: (instanceId: string, from: "hand" | "board") => void;
  /** Clic sur une carte en jeu quand un ciblage est en cours (le conteneur résout). */
  onBoardCardClick: (instanceId: string, ownerId: PlayerId) => void;
  /** Clic sur le Navire adverse pendant un ciblage d'attaque. */
  onShipClick: (ownerId: PlayerId) => void;
  /** Fiche détaillée d'une carte (appui long, clic droit). */
  onInspect: (instance: CardInstance) => void;
  onOpenGraveyard: (playerId: PlayerId) => void;
  /** Carte de main en cours de glisser (avertissement de Déraison). */
  onHandDragChange?: (instanceId: string | null) => void;
}

const BADGE_SIZE: Record<BoardPreviewBreakpoint, number> = {
  "mobile-landscape": 20,
  laptop: 30,
  "desktop-large": 38,
};

function isUnit(instance: CardInstance) {
  return (UNIT_CARD_TYPES as readonly string[]).includes(getCardDefinition(instance.cardId).type);
}

const toModel = (instance: CardInstance): PreviewCardModel => ({ id: instance.instanceId, cardId: instance.cardId });

/**
 * NOUVEAU PLATEAU de partie — rendu partagé par la partie locale
 * (`MatchBoard`) et la partie en ligne (`OnlineBoard`).
 *
 * Construit sur le laboratoire `/game/board-preview` (mêmes composants, même
 * feuille de style) : grille fluide sans mise à l'échelle globale, vrais
 * assets, gestes au pointeur (souris ET doigt), mouvements de cartes.
 *
 * Ne connaît aucune règle d'action : il décide seulement quels gestes sont
 * PROPOSÉS (à partir de l'état et de `canPlayCards` / `canAttack`) et rend
 * chaque intention au conteneur, qui valide et envoie l'action — localement
 * (`dispatch`) ou au serveur. Les invites, menus, fiches et écrans de fin
 * restent dans les conteneurs.
 */
export function TableBoard(props: TableBoardProps) {
  const { state, viewerId, canPlayCards, canAttack, targeting } = props;
  const cardBack = useCardBackSrc();
  const stageRef = useRef<HTMLDivElement>(null);
  const metrics = useBoardPreviewMetrics(stageRef);
  const badgeSize = BADGE_SIZE[metrics.breakpoint];

  const viewer = state.players.find((p) => p.id === viewerId)!;
  const opponent = state.players.find((p) => p.id !== viewerId)!;
  const viewerShip = getShipDefinition(viewer.shipId);
  const opponentShip = getShipDefinition(opponent.shipId);
  const tideState = state.environment.tideState;

  const auraContextFor = (player: PlayerState) => ({
    controllerBoard: player.board,
    controllerReason: player.reason,
    tideOrientation: state.environment.tideOrientation,
  });

  const byId = new Map<string, { instance: CardInstance; owner: PlayerState }>();
  for (const player of state.players) {
    for (const instance of [...player.hand, ...player.board]) byId.set(instance.instanceId, { instance, owner: player });
  }

  function renderFace(instance: CardInstance, owner?: PlayerState) {
    return (
      <CardTile
        instance={instance}
        tideState={tideState}
        widthClassName="w-full"
        scaleOnHover={false}
        showStatusBadges={false}
        auraContext={owner ? auraContextFor(owner) : undefined}
      />
    );
  }
  const motion = useTableMotion(state, viewerId, (instance) => renderFace(instance));

  // ── Ce que chaque carte peut faire ─────────────────────────────────
  function attackReady(instance: CardInstance) {
    return (
      canAttack &&
      isUnit(instance) &&
      !instance.summoningSick &&
      !instance.hasAttackedThisTurn &&
      !instance.statuses?.includes(STATUS_SILENCE) &&
      !computeEffectiveStats(instance, tideState).inactive
    );
  }

  /** Cibles légales d'une carte de main à effet ciblé (`null` = se pose sans cible). */
  function playTargets(instance: CardInstance): Set<string> | null {
    const def = getCardDefinition(instance.cardId);
    if (!needsPlayTarget(def, viewer.board)) return null;
    const effect = (def.onPlayEffects ?? []).find((e) => e.target.kind === "chosenUnit");
    if (!effect) return null;
    if (effect.type === "attachEquipment") {
      return new Set(viewer.board.filter((unit) => canBeEquipTarget(def, viewer.board, unit)).map((unit) => unit.instanceId));
    }
    return new Set(eligibleChosenUnits(state, effect.target, viewerId, instance.instanceId).map((c) => c.unit.instanceId));
  }

  /** Objet posé dont l'effet de bris demande une cible : il se glisse sur elle. */
  function breakTargets(instance: CardInstance): Set<string> | null {
    const def = getCardDefinition(instance.cardId);
    if (def.type !== "objet" || !canPlayCards) return null;
    const effect = (def.onBreakEffects ?? []).find((e) => e.target.kind === "chosenUnit");
    if (!effect) return null;
    return new Set(eligibleChosenUnits(state, effect.target, viewerId, instance.instanceId).map((c) => c.unit.instanceId));
  }

  const slotsFree = viewer.board.length < viewerShip.slotCount;
  const handTargets = new Map(viewer.hand.map((card) => [card.instanceId, canPlayCards ? playTargets(card) : null] as const));

  const dropId = (drop: string) => drop.replace(/^(own|unit):/, "");

  const { gesture, hover, startGesture } = useTableGestures({
    isValidDrop: (kind, sourceId, drop) => {
      const entry = byId.get(sourceId);
      if (!entry) return false;
      const { instance } = entry;
      if (kind === "place") {
        if (!canPlayCards) return false;
        if (drop === "board") return slotsFree;
        return drop === "graveyard" && getCardDefinition(instance.cardId).type === "objet";
      }
      if (kind === "cast") {
        const targets = handTargets.get(sourceId);
        return Boolean(canPlayCards && targets && (drop.startsWith("own:") || drop.startsWith("unit:")) && targets.has(dropId(drop)));
      }
      if (kind === "aim") {
        if (drop === "graveyard") return canPlayCards;
        if (drop === "ship") return attackReady(instance);
        if (drop.startsWith("unit:") && attackReady(instance)) return true;
        const targets = breakTargets(instance);
        return Boolean(targets && (drop.startsWith("own:") || drop.startsWith("unit:")) && targets.has(dropId(drop)));
      }
      return false;
    },
    onDrop: (kind, sourceId, drop, point) => {
      props.onHandDragChange?.(null);
      if (kind === "place") {
        if (drop === "graveyard") {
          props.onDropOnGraveyard(sourceId, "hand");
          return;
        }
        const el = document.querySelector<HTMLElement>(`[data-card-id="${sourceId}"]`);
        const width = (el?.offsetWidth ?? 0) * 1.08;
        if (width) motion.rememberDrop(sourceId, { x: point.x - width / 2, y: point.y - (width * 1.4) / 2, width, height: width * 1.4 });
        props.onPlayCard(sourceId);
        return;
      }
      if (kind === "cast") {
        props.onPlayCard(sourceId, dropId(drop));
        return;
      }
      const entry = byId.get(sourceId);
      if (drop === "graveyard") props.onDropOnGraveyard(sourceId, "board");
      else if (drop === "ship") props.onAttack(sourceId);
      else if (entry && drop.startsWith("unit:") && attackReady(entry.instance)) props.onAttack(sourceId, dropId(drop));
      else props.onBreakOnTarget(sourceId, dropId(drop));
    },
    canArm: (sourceId) => {
      const entry = byId.get(sourceId);
      return Boolean(entry && entry.owner.id === viewerId && attackReady(entry.instance));
    },
    onInspect: (sourceId) => {
      const entry = byId.get(sourceId);
      if (entry) props.onInspect(entry.instance);
    },
    onTap: (kind, sourceId) => {
      const entry = byId.get(sourceId);
      if (!entry) return false;
      if (kind === "place" || kind === "cast") {
        props.onHandCardClick(sourceId);
        return true;
      }
      // Un ciblage est en cours côté conteneur : toute carte en jeu touchée lui revient.
      if (targeting) {
        props.onBoardCardClick(sourceId, entry.owner.id);
        return true;
      }
      return false;
    },
  });

  const placing = gesture?.kind === "place" ? gesture : null;
  const casting = gesture?.kind === "cast" ? gesture : null;
  const aiming = gesture?.kind === "aim" ? gesture : null;
  const aimSource = aiming ? byId.get(aiming.sourceId)?.instance : undefined;
  const aimAttacks = aimSource ? attackReady(aimSource) : false;
  const aimBreakTargets = aimSource ? breakTargets(aimSource) : null;
  const castTargets = casting ? handTargets.get(casting.sourceId) ?? null : null;
  const draggedHand = placing?.sourceId ?? casting?.sourceId ?? null;
  const onHandDragChange = props.onHandDragChange;
  useEffect(() => {
    onHandDragChange?.(draggedHand);
  }, [draggedHand, onHandDragChange]);

  const tone: AimTone = casting || (aimSource && !aimAttacks) ? "effect" : hover === "graveyard" ? "sabotage" : "attack";
  const attackTargeting = targeting?.kind === "attack" || aimAttacks;

  // ── Rendu d'une carte en jeu ────────────────────────────────────────
  function renderBoardCard(card: PreviewCardModel, owner: PlayerState) {
    const instance = byId.get(card.id)?.instance;
    if (!instance) return null;
    const mine = owner.id === viewerId;
    const def = getCardDefinition(instance.cardId);
    const visible = isVisibleDuringTide(def, tideState);
    const drop = `${mine ? "own" : "unit"}:${card.id}`;
    const ready = mine && attackReady(instance);
    const effectTarget = (castTargets?.has(card.id) ?? false) || (aimBreakTargets?.has(card.id) ?? false);
    const attackTarget = !mine && attackTargeting;
    const targetable = effectTarget || attackTarget;

    return (
      <div
        data-card-id={card.id}
        data-board-unit={card.id}
        data-drop={drop}
        data-armable={ready ? "" : undefined}
        onPointerDown={startGesture(mine ? "aim" : "inspect", card.id)}
        onContextMenu={(e) => {
          e.preventDefault();
          props.onInspect(instance);
        }}
        className={[
          styles.tableCard,
          mine ? styles.boardGrab : "",
          ready && !gesture ? styles.attacker : "",
          aiming?.sourceId === card.id ? styles.aimSource : "",
          targetable ? `${styles.targetable} ${effectTarget ? styles.effectTone : ""}` : "",
          targetable && hover === drop ? styles.targetHover : "",
          targeting?.sourceInstanceId === card.id ? styles.aimSource : "",
          props.reactionSourceIds?.includes(card.id) ? "animate-reaction-pulse" : "",
        ].join(" ")}
      >
        {!mine && !visible ? (
          // Structure invisible pour cette Marée : l'adversaire ne voit que le dos.
          // eslint-disable-next-line @next/next/no-img-element -- dos de carte standard
          <img src={cardBack} alt="" draggable={false} className={styles.boardCardBack} />
        ) : (
          <CardTile
            instance={instance}
            tideState={tideState}
            widthClassName="w-full"
            scaleOnHover={false}
            badgeSize={badgeSize}
            faceDown={mine && !visible}
            auraContext={auraContextFor(owner)}
          />
        )}
      </div>
    );
  }

  // ── Marée ───────────────────────────────────────────────────────────
  const tideIndex = TIDE_STATES_ORDER.indexOf(tideState);
  const duration = RULES.TIDE_STATE_DURATION[tideState];
  const tide = {
    orientation: state.environment.tideOrientation === "montante" ? ("rising" as const) : ("falling" as const),
    states: TIDE_STATES_ORDER.map((id) => ({ id, label: TIDE_STATE_LABELS[id] })),
    current: tideIndex,
    remainingTurns: state.environment.tideRemainingTurns,
    stageProgress: duration > 0 ? Math.max(0, Math.min(1, (duration - state.environment.tideRemainingTurns) / duration)) : 0,
  };

  const shipView = (player: PlayerState, def: ReturnType<typeof getShipDefinition>) => ({
    name: def.name,
    illustration: def.illustration,
    hull: player.anchor,
    maxHull: def.startingAnchor,
    reason: player.reason,
    // Plafond COURANT, pas le maximum imprimé du Navire : les Abysses le
    // réduisent, et la courbe de début de partie le plafonne encore.
    maxReason: reasonCeiling(player),
    deraisonDamage: deraisonAnchorDamage(player, player.reason),
  });

  return (
    <>
      <GameViewport>
        <BackgroundLayer tideState={tideState} />
        <DecorLayer />

        <GameStage ref={stageRef}>
          <div aria-hidden className={`${styles.lane} ${styles.laneOpponent}`} />
          <div aria-hidden className={`${styles.lane} ${styles.lanePlayer}`} />

          <PreviewOpponentHand count={opponent.hand.length} />
          <OpponentZone
            ship={shipView(opponent, opponentShip)}
            board={opponent.board.map(toModel)}
            capacity={opponentShip.slotCount}
            deck={opponent.deck.length}
            graveyard={opponent.graveyard.length}
            onGraveyardClick={() => props.onOpenGraveyard(opponent.id)}
            renderCard={(card) => renderBoardCard(card, opponent)}
            wrapShip={(ship) => (
              <div
                data-drop="ship"
                data-ship-target={opponent.id}
                onClick={() => targeting?.kind === "attack" && props.onShipClick(opponent.id)}
                className={`${styles.shipTarget} ${attackTargeting ? styles.targetable : ""} ${hover === "ship" ? styles.targetHover : ""}`}
              >
                {ship}
              </div>
            )}
          />
          <CenterZone
            tide={tide}
            hint={
              props.hint ? (
                <div className={styles.centerHint} role="status">
                  <span>{props.hint}</span>
                  {props.onCancelHint && (
                    <button type="button" className={styles.centerHintButton} onClick={props.onCancelHint}>
                      Annuler
                    </button>
                  )}
                </div>
              ) : null
            }
          />
          <PlayerZone
            ship={shipView(viewer, viewerShip)}
            board={viewer.board.map(toModel)}
            capacity={viewerShip.slotCount}
            deck={viewer.deck.length}
            graveyard={viewer.graveyard.length}
            onGraveyardClick={() => props.onOpenGraveyard(viewer.id)}
            wrapShip={(ship) => (
              <div data-ship-target={viewer.id} className={styles.shipTarget}>
                {ship}
              </div>
            )}
            graveyardDropState={
              (aiming && !aiming.armed && canPlayCards) || (placing && getCardDefinition(byId.get(placing.sourceId)?.instance.cardId ?? "").type === "objet")
                ? hover === "graveyard"
                  ? "over"
                  : "ready"
                : "idle"
            }
            dropState={placing && slotsFree ? (hover === "board" ? "over" : "ready") : "idle"}
            renderCard={(card) => renderBoardCard(card, viewer)}
          />
          <PreviewHand
            cards={viewer.hand.map(toModel)}
            dragging={placing !== null || casting !== null}
            renderCard={(card) => {
              const instance = byId.get(card.id)?.instance;
              if (!instance) return null;
              const kind = handTargets.get(card.id) ? "cast" : "place";
              return (
                <div
                  data-card-id={card.id}
                  onPointerDown={startGesture(kind, card.id)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    props.onInspect(instance);
                  }}
                  className={[
                    styles.tableCard,
                    canPlayCards ? styles.handGrab : "",
                    placing?.sourceId === card.id ? styles.dragSource : "",
                    casting?.sourceId === card.id || targeting?.sourceInstanceId === card.id ? styles.castSource : "",
                  ].join(" ")}
                >
                  <CardTile instance={instance} tideState={tideState} widthClassName="w-full" scaleOnHover={false} showStatusBadges={false} />
                </div>
              );
            }}
          />

          <PreviewHud
            turn={Math.ceil(state.turnNumber / 2)}
            turnOwner={props.turnOwnerLabel}
            viewerTurn={state.activePlayerId === viewerId}
            onMenu={props.onMenu}
            journal={props.journal}
            phaseButton={
              <PhaseButton
                label={props.phaseButton.label}
                icon={props.phaseButton.icon}
                disabled={props.phaseButton.disabled}
                onClick={props.phaseButton.onClick}
              />
            }
          />
        </GameStage>

        <MotionLayer flights={motion.flights} />
        <DragLayer
          gesture={gesture}
          onTarget={hover !== null}
          tone={tone}
          renderGhost={(id) => {
            const instance = byId.get(id)?.instance;
            return instance ? renderFace(instance) : null;
          }}
        />
      </GameViewport>

      <EquipLinkOverlay state={state} />
      <AttackImpactLayer attacks={props.attacks} />
    </>
  );
}
