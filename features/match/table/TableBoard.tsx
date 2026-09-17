"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
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
import { useCardBackSrcFor } from "@/features/cosmetics/MatchCosmeticsProvider";
import { CardTile } from "@/features/match/CardTile";
import { TIDE_STATE_LABELS } from "@/features/match/cardDisplay";
import { EquipLinkOverlay } from "@/features/match/EquipLinkOverlay";
import { needsPlayTarget } from "@/features/match/needsPlayTarget";
import type { AttackAnimation } from "@/features/match/useAttackPresentation";
import styles from "@/features/match/table/Table.module.css";
import { BackgroundLayer } from "@/features/match/table/BackgroundLayer";
import { CenterZone } from "@/features/match/table/CenterZone";
import { DecorLayer } from "@/features/match/table/DecorLayer";
import { DragLayer, type AimTone } from "@/features/match/table/DragLayer";
import { GameStage } from "@/features/match/table/GameStage";
import { GameViewport } from "@/features/match/table/GameViewport";
import { HoverCardPreview } from "@/features/match/table/HoverCardPreview";
import { MotionLayer } from "@/features/match/table/MotionLayer";
import { OpponentZone } from "@/features/match/table/OpponentZone";
import { PlayerZone } from "@/features/match/table/PlayerZone";
import { RainLayer } from "@/features/match/table/RainLayer";
import { ShipInfoSheet } from "@/features/match/table/ShipInfoSheet";
import { TableHand } from "@/features/match/table/TableHand";
import { PhaseButton, TableHud } from "@/features/match/table/TableHud";
import { TableOpponentHand } from "@/features/match/table/TableOpponentHand";
import type { TableCardModel } from "@/features/match/table/tableModel";
import { useTableMetrics, type BoardPreviewBreakpoint } from "@/features/match/table/useTableMetrics";
import { useTableGestures } from "@/features/match/table/useTableGestures";
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
  /**
   * Restreint les cartes de la main réellement jouables, par `instanceId`.
   * `null`/absent = aucune restriction, comportement normal.
   *
   * Sert au TUTORIEL : pendant une étape « pose un Objet », le reste de la
   * main est inerte, pour que le joueur ne dépense pas la carte dont
   * l'étape suivante a besoin.
   */
  playableHandCards?: ReadonlySet<string> | null;
  /** Le joueur peut attaquer (sa Phase de combat, rien en attente). */
  canAttack: boolean;
  targeting: TableTargeting;
  /** Unités du joueur dont une réaction est proposée (pulsation). */
  reactionSourceIds?: readonly string[];
  /** Consigne sous la piste de Marée, avec un bouton Annuler. */
  hint?: string | null;
  onCancelHint?: () => void;

  phaseButton: { label: string; phaseLabel?: string; icon: string; disabled: boolean; onClick?: () => void };
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

const toModel = (instance: CardInstance): TableCardModel => ({ id: instance.instanceId, cardId: instance.cardId });

/**
 * NOUVEAU PLATEAU de partie — rendu partagé par la partie locale
 * (`MatchBoard`) et la partie en ligne (`OnlineBoard`).
 *
 * Grille fluide sans mise à l'échelle globale, vrais assets, gestes au
 * pointeur (souris ET doigt), mouvements de cartes. Le laboratoire de
 * layout (`/game/board-preview`) rend ces mêmes composants sur des données
 * factices : il importe d'ici, jamais l'inverse.
 *
 * Ne connaît aucune règle d'action : il décide seulement quels gestes sont
 * PROPOSÉS (à partir de l'état et de `canPlayCards` / `canAttack`) et rend
 * chaque intention au conteneur, qui valide et envoie l'action — localement
 * (`dispatch`) ou au serveur. Les invites, menus, fiches et écrans de fin
 * restent dans les conteneurs.
 */
export function TableBoard(props: TableBoardProps) {
  const { state, viewerId, canPlayCards, canAttack, targeting } = props;
  const stageRef = useRef<HTMLDivElement>(null);
  const metrics = useTableMetrics(stageRef);
  const badgeSize = BADGE_SIZE[metrics.breakpoint];

  const viewer = state.players.find((p) => p.id === viewerId)!;
  const opponent = state.players.find((p) => p.id !== viewerId)!;
  // Dos des cartes adverses retournées sur la table : celui de l'ADVERSAIRE.
  const opponentCardBack = useCardBackSrcFor(opponent.id);
  const viewerShip = getShipDefinition(viewer.shipId);
  const opponentShip = getShipDefinition(opponent.shipId);
  const tideState = state.environment.tideState;
  /** Navire dont la fiche est ouverte (clic sur un Navire hors ciblage d'attaque). */
  const [shipInfoFor, setShipInfoFor] = useState<PlayerId | null>(null);

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

  /*
   * Aperçu au survol (`HoverCardPreview`) : la carte sous la souris, rendue
   * en grand à côté d'elle. Armé avec un léger délai pour qu'un balayage de
   * la main n'allume pas cinq aperçus à la suite ; souris seulement.
   */
  const [preview, setPreview] = useState<{ id: string; rect: DOMRect } | null>(null);
  const previewTimer = useRef<number | null>(null);
  const cancelPreview = () => {
    if (previewTimer.current !== null) window.clearTimeout(previewTimer.current);
    previewTimer.current = null;
    setPreview(null);
  };
  function previewHandlers(id: string) {
    return {
      onPointerEnter: (event: React.PointerEvent<HTMLElement>) => {
        if (event.pointerType !== "mouse") return;
        const el = event.currentTarget;
        if (previewTimer.current !== null) window.clearTimeout(previewTimer.current);
        previewTimer.current = window.setTimeout(() => {
          previewTimer.current = null;
          setPreview({ id, rect: el.getBoundingClientRect() });
        }, 90);
      },
      onPointerLeave: cancelPreview,
    };
  }
  useEffect(() => () => {
    if (previewTimer.current !== null) window.clearTimeout(previewTimer.current);
  }, []);

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
  /** La carte est-elle jouable, restriction du tutoriel comprise ? */
  const isPlayable = (instanceId: string) => canPlayCards && (props.playableHandCards?.has(instanceId) ?? true);
  const handTargets = new Map(viewer.hand.map((card) => [card.instanceId, isPlayable(card.instanceId) ? playTargets(card) : null] as const));

  const dropId = (drop: string) => drop.replace(/^(own|unit):/, "");

  const { gesture, hover, startGesture } = useTableGestures({
    isValidDrop: (kind, sourceId, drop) => {
      const entry = byId.get(sourceId);
      if (!entry) return false;
      const { instance } = entry;
      // Un geste qui PART de la main — poser, lancer, ou glisser sur le
      // crâne pour Briser — est soumis à la restriction du tutoriel ; les
      // gestes qui partent du plateau (attaquer, Saborder) n'y sont pas.
      const fromHand = viewer.hand.some((card) => card.instanceId === sourceId);
      if (fromHand && !isPlayable(sourceId)) return false;

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
        // Même règle qu'au glisser : une carte écartée par le tutoriel ne
        // réagit pas non plus au toucher.
        if (!isPlayable(sourceId)) return false;
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
  function renderBoardCard(card: TableCardModel, owner: PlayerState) {
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
        // Une Structure adverse invisible ne s'aperçoit pas non plus : on n'en voit que le dos.
        {...(mine || visible ? previewHandlers(card.id) : {})}
        onPointerDown={startGesture(mine ? "aim" : "inspect", card.id)}
        onContextMenu={(e) => {
          e.preventDefault();
          props.onInspect(instance);
        }}
        className={[
          styles.tableCard,
          styles.boardHoverable,
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
          // eslint-disable-next-line @next/next/no-img-element -- dos de carte de l'adversaire
          <img src={opponentCardBack} alt="" draggable={false} className={styles.boardCardBack} />
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
    // Chaque Navire porte le cadre de SON joueur (`MatchCosmeticsProvider`).
    ownerId: player.id,
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
        <RainLayer tideState={tideState} />
        <DecorLayer />

        {/* `gesturing` : un glisser est en cours quelque part. Il coupe
            l'agrandissement au survol sur TOUT le plateau — une carte qui
            gonfle sous le curseur pendant qu'on en traîne une autre cache
            précisément la zone visée. */}
        <GameStage
          ref={stageRef}
          className={gesture ? styles.gesturing : undefined}
          // Le plus grand des deux Navires fixe la largeur des cartes (cf. `--card-h-fit`).
          style={{ ["--board-slots" as string]: Math.max(5, viewerShip.slotCount, opponentShip.slotCount) }}
        >
          <div aria-hidden className={`${styles.lane} ${styles.laneOpponent}`} />
          <div aria-hidden className={`${styles.lane} ${styles.lanePlayer}`} />

          <TableOpponentHand count={opponent.hand.length} ownerId={opponent.id} />
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
                onClick={() => {
                  // Pendant un ciblage d'attaque, le Navire est une CIBLE ; sinon on consulte sa fiche.
                  if (targeting?.kind === "attack") props.onShipClick(opponent.id);
                  else if (!targeting) setShipInfoFor(opponent.id);
                }}
                onContextMenu={(event) => {
                  event.preventDefault();
                  setShipInfoFor(opponent.id);
                }}
                title={attackTargeting ? undefined : "Fiche du Navire adverse"}
                className={`${styles.shipTarget} ${attackTargeting ? styles.targetable : styles.shipInspectable} ${hover === "ship" ? styles.targetHover : ""}`}
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
              <div
                data-ship-target={viewer.id}
                className={`${styles.shipTarget} ${styles.shipInspectable}`}
                title="Fiche de ton Navire"
                onClick={() => !targeting && setShipInfoFor(viewer.id)}
                onContextMenu={(event) => {
                  event.preventDefault();
                  setShipInfoFor(viewer.id);
                }}
              >
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
          <TableHand
            cards={viewer.hand.map(toModel)}
            dragging={placing !== null || casting !== null}
            renderCard={(card) => {
              const instance = byId.get(card.id)?.instance;
              if (!instance) return null;
              const kind = handTargets.get(card.id) ? "cast" : "place";
              // Carte écartée par le tutoriel : elle reste lisible et
              // consultable (clic droit), mais visiblement hors-jeu —
              // sinon le joueur la tire en vain et croit à une panne.
              const muted = props.playableHandCards ? !props.playableHandCards.has(card.id) : false;
              return (
                <div
                  data-card-id={card.id}
                  data-muted={muted ? "" : undefined}
                  {...previewHandlers(card.id)}
                  onPointerDown={startGesture(kind, card.id)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    props.onInspect(instance);
                  }}
                  className={[
                    styles.tableCard,
                    canPlayCards && !muted ? styles.handGrab : "",
                    muted ? styles.handCardMuted : "",
                    placing?.sourceId === card.id ? styles.dragSource : "",
                    casting?.sourceId === card.id || targeting?.sourceInstanceId === card.id ? styles.castSource : "",
                  ].join(" ")}
                >
                  <CardTile instance={instance} tideState={tideState} widthClassName="w-full" scaleOnHover={false} showStatusBadges={false} />
                </div>
              );
            }}
          />

          <TableHud
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
        {/* Pendant un geste (glisser, viser), pas d'aperçu : c'est le plateau qu'on regarde. */}
        {preview && !gesture && (() => {
          const found = byId.get(preview.id);
          return found ? (
            <HoverCardPreview anchor={preview.rect}>{renderFace(found.instance, found.owner)}</HoverCardPreview>
          ) : null;
        })()}
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
      {shipInfoFor && (
        <ShipInfoSheet
          player={shipInfoFor === viewer.id ? viewer : opponent}
          ship={shipInfoFor === viewer.id ? viewerShip : opponentShip}
          ownerLabel={shipInfoFor === viewer.id ? "Ton Navire" : "Navire adverse"}
          onClose={() => setShipInfoFor(null)}
        />
      )}
      <AttackImpactLayer attacks={props.attacks} />
    </>
  );
}
