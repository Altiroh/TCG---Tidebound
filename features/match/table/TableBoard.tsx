"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  boardPermanents,
  canActivateAbility,
  isOngoingEffect,
  slotsUsed,
  findAssemblage,
  playCardRefusal,
  previewBreakReason,
  previewPlayCardReason,
  canUnitAttack,
  deraisonAnchorDamage,
  getCardDefinition,
  getShipDefinition,
  hasResistance,
  isVisibleDuringTide,
  reasonCeiling,
  RULES,
  STATUS_SILENCE,
  TIDE_STATES_ORDER,
  type CardInstance,
  type GameState,
  type PlayerId,
  type PlayerState,
} from "@/game";
import { AttackImpactLayer } from "@/features/match/AttackImpactLayer";
import { useCardBackSrcFor } from "@/features/cosmetics/MatchCosmeticsProvider";
import { CardTile, cardStatusLegend } from "@/features/match/CardTile";
import { TIDE_STATE_LABELS } from "@/features/match/cardDisplay";
import { legalTargetsFor, type TableTargeting } from "@/features/match/table/legalTargets";
import { sourcePolarity, type TargetPolarity } from "@/features/match/table/targetPolarity";
import { targetingHint } from "@/features/match/table/tableLabels";
import type { AttackAnimation } from "@/features/match/useAttackPresentation";
import type { EffectVolley } from "@/features/match/effectPresentation";
import type { HandLimitDiscardMode } from "@/features/match/useHandLimitDiscard";
import type { BoardAllocationMode } from "@/features/match/useHealAllocation";
import type { BoardPickMode } from "@/features/match/useBoardPick";
import type { HeldTarget } from "@/features/match/useHeldTarget";
import { EffectFxLayer, reasonAnchor, reasonGaugeOf } from "@/features/match/EffectFxLayer";
import { THICK_TEXT_OUTLINE } from "@/features/match/cardDisplay";
import styles from "@/features/match/table/Table.module.css";
import { BackgroundLayer } from "@/features/match/table/BackgroundLayer";
import { CenterZone } from "@/features/match/table/CenterZone";
import { LandeArrival, LANDE_ARRIVAL } from "@/features/match/landes/LandeArrival";
import { LandeBadge } from "@/features/match/landes/LandeBadge";
import landeStyles from "@/features/match/landes/Landes.module.css";
import { OngoingEffects } from "@/features/match/table/OngoingEffects";
import { LandeLayer } from "@/features/match/landes/LandeLayer";
import { DecorLayer } from "@/features/match/table/DecorLayer";
import { DragLayer, type AimTone } from "@/features/match/table/DragLayer";
import { EquipLinks } from "@/features/match/table/EquipLinks";
import { GameStage } from "@/features/match/table/GameStage";
import { GameViewport } from "@/features/match/table/GameViewport";
import { HoverCardPreview } from "@/features/match/table/HoverCardPreview";
import { MotionLayer } from "@/features/match/table/MotionLayer";
import { OpponentZone } from "@/features/match/table/OpponentZone";
import { PlayerZone } from "@/features/match/table/PlayerZone";
import { RainLayer } from "@/features/match/table/RainLayer";
import { ShipInfoSheet } from "@/features/match/table/ShipInfoSheet";
import { TableCardZoom, type ZoomAction } from "@/features/match/table/TableCardZoom";
import { TableHand } from "@/features/match/table/TableHand";
import { LiveAudience } from "@/features/match/table/LiveAudience";
import { PhaseButton, TableHud } from "@/features/match/table/TableHud";
import { TableOpponentHand } from "@/features/match/table/TableOpponentHand";
import type { TableCardModel } from "@/features/match/table/tableModel";
import { useTableMetrics, type BoardPreviewBreakpoint } from "@/features/match/table/useTableMetrics";
import { useTableGestures } from "@/features/match/table/useTableGestures";
import type { ShipAbilityPanelView } from "@/features/match/table/TableShip";
import { useTableMotion } from "@/features/match/table/useTableMotion";

export type { TableTargeting } from "@/features/match/table/legalTargets";

export interface TableBoardProps {
  /** État AFFICHÉ (retenu pendant une attaque, cf. `useAttackPresentation`). */
  state: GameState;
  viewerId: PlayerId;
  /** « À vous », « Au bot », « À l'adversaire »… */
  turnOwnerLabel: string;
  attacks: AttackAnimation[];
  /** Effets mis en scène : projectiles, voiles de soin, pastilles de gain (cf. `effectPresentation.ts`). */
  volleys: EffectVolley[];
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

  phaseButton: {
    label: string;
    phaseLabel?: string;
    icon: string;
    disabled: boolean;
    onClick?: () => void;
    /** « Fin de tour » dès la Phase de combat, sous le bouton principal. */
    secondary?: { label: string; onClick: () => void };
  };
  onMenu: () => void;

  /**
   * Clic sur une carte de la main (parcours au clic : jouer, ou entrer en
   * choix de cible). `fromZoom` : bouton « Jouer » de la carte agrandie, qui
   * affichait déjà la Déraison — il vaut confirmation, et ne doit pas
   * annuler un ciblage en cours sur cette même carte.
   */
  onHandCardClick: (instanceId: string, options?: { fromZoom?: boolean }) => void;
  /** Carte de main lâchée sur le plateau (sans cible) ou sur sa cible. Le lâcher vaut confirmation. */
  /** `boardIndex` : emplacement visé dans le rang (cf. `PlayCardAction`). */
  onPlayCard: (instanceId: string, targetInstanceId?: string, boardIndex?: number) => void;
  /** Attaque — sans défenseur : le Navire adverse. */
  onAttack: (attackerInstanceId: string, defenderInstanceId?: string) => void;
  /** Objet posé lâché sur une cible (effet de bris ciblé). */
  onBreakOnTarget: (objectInstanceId: string, targetInstanceId: string) => void;
  /** Carte lâchée sur le crâne du joueur : Sabordage, ou invite de bris pour un Objet. */
  onDropOnGraveyard: (instanceId: string, from: "hand" | "board") => void;
  /**
   * Limite de main en fin de tour : les cartes de la main se glissent sur
   * le Cimetière pour être jetées (`useHandLimitDiscard`). Tant qu'il est
   * posé, c'est le SEUL geste que la main accepte.
   */
  handLimitDiscard?: HandLimitDiscardMode | null;
  /** Répartition de soins sur le plateau (`useHealAllocation`) : toucher = +1, clic droit = −1. */
  boardAllocation?: BoardAllocationMode | null;
  /** Désignation de plusieurs unités sur le plateau (`useBoardPick`) : toucher = désigner / reprendre. */
  boardPick?: BoardPickMode | null;
  /**
   * Cibles déjà désignées par une action qui n'est pas allée au bout
   * (`useHeldTarget`, `useBoardPick`) : elles gardent leur marque de cible.
   */
  heldTargets?: readonly HeldTarget[];
  /** Clic sur une carte en jeu quand un ciblage est en cours (le conteneur résout). */
  onBoardCardClick: (instanceId: string, ownerId: PlayerId) => void;
  /**
   * Bouton « Activer » d'une carte du joueur dont la capacité activable est
   * utilisable maintenant (`canActivateAbility`). Absent : pas de bouton.
   */
  onActivateAbility?: (instanceId: string) => void;
  /** Pastille d'une capacité activable glissée jusqu'à la cible de son effet : l'activation part sur cette cible. */
  onAbilityDrop?: (instanceId: string, targetInstanceId: string) => void;
  /**
   * Carte à Assemblage (Le Géant Chromatique) lâchée SUR une de ses
   * Sentinelles : le conteneur pose la question Oui / Non. Lâchée sur un
   * emplacement libre, elle se pose normalement (`onPlayCard`).
   */
  onAssemblageDrop?: (instanceId: string, sentinelId: string) => boolean;
  /** Clic sur un Navire pendant un ciblage : l'adverse (attaque, tir de canon), ou l'un des deux (capacité ciblée). */
  onShipClick: (ownerId: PlayerId) => void;
  /** Panneau de capacité du Navire du JOUEUR — absent si son Navire n'en porte pas. */
  shipAbility?: ShipAbilityPanelView;
  /** Panneau de capacité du Navire ADVERSE, en lecture seule (pas de `onClick`). */
  opponentShipAbility?: ShipAbilityPanelView;
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

const toModel = (instance: CardInstance): TableCardModel => ({ id: instance.instanceId, cardId: instance.cardId });

/**
 * Aperçu du PRIX pendant qu'on glisse une carte de la main : le chiffre
 * flotte au-dessus de la jauge de Raison du Navire, là où il s'abattra si
 * on lâche (`EffectFxLayer`, `ReasonDrop`). En rouge, avec l'Ancrage qu'il
 * coûtera en fin de tour, quand il fait entrer en Déraison — c'est
 * l'avertissement, sans bandeau par-dessus le plateau.
 */
function ReasonCostPreview({ playerId, cost, debtDamage }: { playerId: PlayerId; cost: number; debtDamage: number }) {
  const [anchor, setAnchor] = useState<{ x: number; y: number; size: number } | null>(null);
  useEffect(() => {
    const gauge = reasonGaugeOf(playerId);
    setAnchor(gauge ? reasonAnchor(gauge) : null);
  }, [playerId]);
  if (!anchor || cost <= 0) return null;
  const debt = debtDamage > 0;
  return (
    <div
      aria-live="polite"
      className={`pointer-events-none fixed z-[46] flex flex-col items-center ${styles.reasonPreview}`}
      // La jauge est au bord gauche de l'écran : la ligne de Déraison, plus large que le chiffre, ne doit pas en sortir.
      style={{ left: debt ? Math.max(anchor.x, 96) : anchor.x, top: anchor.y }}
    >
      <span
        style={{
          color: debt ? "#fb7185" : "#fde68a",
          fontFamily: "var(--font-card-title), Georgia, serif",
          fontSize: anchor.size,
          fontWeight: 800,
          lineHeight: 1,
          textShadow: THICK_TEXT_OUTLINE,
        }}
      >
        −{cost}
      </span>
      {debt && (
        <span className="mt-0.5 whitespace-nowrap rounded-full bg-rose-950/85 px-1.5 py-px text-[11px] font-semibold text-rose-100">
          Déraison · ⚓ −{debtDamage} en fin de tour
        </span>
      )}
    </div>
  );
}

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

  // ── Lande ──────────────────────────────────────────────────────────
  // Une Lande qui ARRIVE sous les yeux du joueur se joue en grand
  // (`LandeArrival`) ; celle déjà en jeu au chargement de la partie est là
  // d'emblée, sans animation.
  const lande = state.environment.lande;
  const [landeArrival, setLandeArrival] = useState<NonNullable<typeof lande> | null>(null);
  const seenLande = useRef(lande?.instanceId);
  useEffect(() => {
    if (lande && lande.instanceId !== seenLande.current) setLandeArrival(lande);
    seenLande.current = lande?.instanceId;
    // Seule l'identité de la Lande compte : son décompte change à chaque tour.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lande?.instanceId]);
  /** Navire dont la fiche est ouverte (clic sur un Navire hors ciblage d'attaque). */
  const [shipInfoFor, setShipInfoFor] = useState<PlayerId | null>(null);

  const auraContextFor = (player: PlayerState) => ({
    controllerBoard: player.board,
    controllerReason: player.reason,
    tideOrientation: state.environment.tideOrientation,
    // Signal Rouge (Lot 15) : un bonus « pendant votre tour ».
    controllerIsActive: state.activePlayerId === player.id,
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
  /**
   * La dernière carte du Cimetière, en tuile de plateau — valeurs IMPRIMÉES :
   * une carte défaussée n'a plus de blessure ni de modificateur à montrer.
   */
  function graveyardTile(player: PlayerState) {
    const top = player.graveyard[player.graveyard.length - 1];
    if (!top) return undefined;
    return (
      <CardTile
        instance={{ ...top, damageMarked: 0, modifiers: [], statuses: undefined, summoningSick: false, turnsRemaining: undefined, attachedToInstanceId: undefined }}
        tideState={tideState}
        widthClassName="w-full"
        scaleOnHover={false}
        showStatusBadges={false}
        variant="board"
      />
    );
  }
  const motion = useTableMotion(state, viewerId, (instance) => renderFace(instance));

  // Équipement → porteur, pour le trait qui les relie. L'attachement ne
  // traverse jamais les plateaux (`game/cards/types.ts`), mais les deux
  // camps en posent : on lit les deux.
  const boardKey = state.players.map((p) => p.board.map((u) => u.instanceId).join(",")).join("|");
  const attachments = useMemo(() => {
    const map: Record<string, string> = {};
    for (const player of state.players) {
      for (const unit of player.board) {
        if (unit.attachedToInstanceId) map[unit.instanceId] = unit.attachedToInstanceId;
      }
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- indexé sur la composition des plateaux, pas sur l'objet `state` entier.
  }, [boardKey]);

  /*
   * Aperçu au survol (`HoverCardPreview`) : la carte sous la souris, rendue
   * en grand à côté d'elle. Armé avec un léger délai pour qu'un balayage de
   * la main n'allume pas cinq aperçus à la suite ; souris seulement.
   */
  const [preview, setPreview] = useState<{ id: string; rect: DOMRect } | null>(null);
  /**
   * Carte lue en grand par-dessus le plateau (`TableCardZoom`) — au doigt,
   * c'est aussi là qu'on agit sur elle (Jouer, Défausser, Saborder…), les
   * actions étant recalculées à chaque rendu. `confirmSaborder` : le
   * Sabordage a été demandé une première fois, le bouton attend sa
   * confirmation.
   */
  const [zoom, setZoom] = useState<{ id: string; confirmSaborder?: boolean } | null>(null);
  const zoomId = zoom?.id ?? null;
  const setZoomId = (id: string | null) => setZoom(id ? { id } : null);
  const previewTimer = useRef<number | null>(null);
  const cancelPreview = () => {
    if (previewTimer.current !== null) window.clearTimeout(previewTimer.current);
    previewTimer.current = null;
    setPreview(null);
  };
  /**
   * Les badges de statut flottent au-dessus de la carte mais vivent DANS son
   * bloc : les survoler armait l'aperçu, qui recouvrait leur bulle. Sur un
   * badge (`data-status-badge`), l'aperçu se retire ; revenir sur la carte le
   * rouvre.
   */
  const overStatusBadge = (target: EventTarget) => target instanceof Element && target.closest("[data-status-badge]") !== null;
  function previewHandlers(id: string) {
    const arm = (el: HTMLElement) => {
      if (previewTimer.current !== null) window.clearTimeout(previewTimer.current);
      previewTimer.current = window.setTimeout(() => {
        previewTimer.current = null;
        setPreview({ id, rect: el.getBoundingClientRect() });
      }, 90);
    };
    return {
      onPointerEnter: (event: React.PointerEvent<HTMLElement>) => {
        if (event.pointerType !== "mouse" || overStatusBadge(event.target)) return;
        arm(event.currentTarget);
      },
      onPointerOver: (event: React.PointerEvent<HTMLElement>) => {
        if (event.pointerType !== "mouse") return;
        if (overStatusBadge(event.target)) cancelPreview();
        else if (preview?.id !== id && previewTimer.current === null) arm(event.currentTarget);
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
      // Règle du moteur (Pied marin compris), pour une unité du joueur qui regarde.
      canUnitAttack(state, viewerId, instance.instanceId) &&
      !instance.statuses?.includes(STATUS_SILENCE)
    );
  }

  /** Cibles légales d'une carte de main à effet ciblé (`null` = se pose sans cible). */
  function playTargets(instance: CardInstance): Set<string> | null {
    return legalTargetsFor(state, viewerId, { kind: "playCard", sourceInstanceId: instance.instanceId });
  }

  /** Objet posé dont l'effet de bris demande une cible : il se glisse sur elle. */
  function breakTargets(instance: CardInstance): Set<string> | null {
    if (getCardDefinition(instance.cardId).type !== "objet" || !canPlayCards) return null;
    return legalTargetsFor(state, viewerId, { kind: "break", sourceInstanceId: instance.instanceId });
  }

  /**
   * Cibles légales du ciblage EN COURS côté conteneur (carte de main, bris,
   * réaction, capacité, attaque…) : elles s'éclairent, et un toucher ne
   * désigne qu'elles. `null` : le conteneur tranche seul.
   */
  const selectionTargets = legalTargetsFor(state, viewerId, targeting);
  /** Une carte en jeu qu'on peut agrandir : une Structure adverse invisible ne montre que son dos. */
  const canZoom = (id: string) => {
    const entry = byId.get(id);
    if (!entry) return false;
    return entry.owner.id === viewerId || isVisibleDuringTide(getCardDefinition(entry.instance.cardId), tideState);
  };

  // Les effets en cours (Anomalies) ne prennent pas de Slot.
  const slotsFree = slotsUsed(viewer.board) < viewerShip.slotCount;
  /** La carte est-elle jouable, restriction du tutoriel comprise ? */
  const isPlayable = (instanceId: string) => canPlayCards && (props.playableHandCards?.has(instanceId) ?? true);
  const discardMode = props.handLimitDiscard ?? null;
  const handTargets = new Map(viewer.hand.map((card) => [card.instanceId, isPlayable(card.instanceId) ? playTargets(card) : null] as const));

  const dropId = (drop: string) => drop.replace(/^(own|unit):/, "");

  /**
   * Emplacement désigné par la zone lâchée : une case vide le dit
   * (`board:3`), une carte du plateau vaut « avant celle-ci » — lâcher sur
   * la première carte, c'est passer devant elle. Le rang seul
   * (`board`, entre deux cases) garde le comportement d'avant : fin de rang.
   */
  const slotOf = (drop: string): number | undefined => {
    if (drop.startsWith("board:")) {
      // La case k du RANG (sans les effets en cours) : rendue en indice
      // dans la liste complète du moteur, où les Anomalies durables vivent aussi.
      const k = Number(drop.slice("board:".length));
      const rang = boardPermanents(viewer.board);
      return k < rang.length ? viewer.board.indexOf(rang[k]!) : viewer.board.length;
    }
    if (drop.startsWith("own:")) {
      const index = viewer.board.findIndex((u) => u.instanceId === dropId(drop));
      return index >= 0 ? index : undefined;
    }
    return undefined;
  };
  const isBoardDrop = (drop: string) => drop === "board" || drop.startsWith("board:") || drop.startsWith("own:");

  /**
   * Sentinelles sur lesquelles on peut lâcher cette carte de main pour
   * l'Assembler (`null` : ce n'est pas une carte à Assemblage, ou aucun
   * Assemblage n'est possible). Une Sentinelle en fait partie si au moins un
   * Assemblage passe par elle.
   */
  function assemblageSentinels(instanceId: string): Set<string> | null {
    const instance = viewer.hand.find((c) => c.instanceId === instanceId);
    const requis = instance && getCardDefinition(instance.cardId).chromaticAssemblage?.sentinels;
    if (!requis || !props.onAssemblageDrop || !isPlayable(instanceId)) return null;
    const ids = viewer.board.filter((unit) => findAssemblage(viewer.board, requis, unit.instanceId)).map((unit) => unit.instanceId);
    return ids.length > 0 ? new Set(ids) : null;
  }

  /**
   * Cibles légales de la capacité activable d'une unité du joueur (celles de
   * son effet « unité désignée ») ; `null` : sa capacité ne vise personne.
   */
  function abilityTargetsOf(sourceId: string): Set<string> | null {
    return legalTargetsFor(state, viewerId, { kind: "ability", sourceInstanceId: sourceId });
  }

  // Lâcher refusé : un mot bref au centre de la table, qui s'efface seul.
  const [dropError, setDropError] = useState<string | null>(null);
  useEffect(() => {
    if (!dropError) return;
    const timer = window.setTimeout(() => setDropError(null), 2600);
    return () => window.clearTimeout(timer);
  }, [dropError]);

  const { gesture, hover, startGesture, cancel: cancelGesture } = useTableGestures({
    isValidDrop: (kind, sourceId, drop) => {
      const entry = byId.get(sourceId);
      if (!entry) return false;
      const { instance } = entry;
      // Un geste qui PART de la main — poser, lancer, ou glisser sur le
      // crâne pour Briser — est soumis à la restriction du tutoriel ; les
      // gestes qui partent du plateau (attaquer, Saborder) n'y sont pas.
      const fromHand = viewer.hand.some((card) => card.instanceId === sourceId);
      // Main trop pleine en fin de tour : la carte ne va qu'au Cimetière.
      if (fromHand && discardMode) return kind === "place" && drop === "graveyard" && !discardMode.staged.has(sourceId) && !discardMode.locked.has(sourceId);
      if (fromHand && !isPlayable(sourceId)) return false;

      if (kind === "place") {
        if (!canPlayCards) return false;
        // Une Lande se pose au centre, dans l'emplacement partagé — ou
        // n'importe où sur son rang : elle ne prend pas de Slot.
        if (getCardDefinition(instance.cardId).type === "lande") return drop === "lande" || isBoardDrop(drop);
        // Sur une Sentinelle d'un Assemblage possible : même plateau plein,
        // l'Assemblage libère ses places.
        if (drop.startsWith("own:") && assemblageSentinels(sourceId)?.has(dropId(drop))) return true;
        if (isBoardDrop(drop)) return slotsFree;
        return drop === "graveyard" && getCardDefinition(instance.cardId).type === "objet";
      }
      if (kind === "cast") {
        const targets = handTargets.get(sourceId);
        return Boolean(canPlayCards && targets && (drop.startsWith("own:") || drop.startsWith("unit:")) && targets.has(dropId(drop)));
      }
      if (kind === "ability") {
        return Boolean((drop.startsWith("own:") || drop.startsWith("unit:")) && abilityTargetsOf(sourceId)?.has(dropId(drop)));
      }
      if (kind === "aim") {
        // Une unité ARMÉE pour l'attaque ne vise que l'adversaire : un
        // toucher sur le Cimetière ne la Saborde pas.
        if (drop === "graveyard") return canPlayCards && !gesture?.armed;
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
        if (drop === "graveyard" && discardMode) {
          discardMode.onDiscard(sourceId);
          return;
        }
        if (drop === "graveyard") {
          props.onDropOnGraveyard(sourceId, "hand");
          return;
        }
        if (drop.startsWith("own:") && assemblageSentinels(sourceId)?.has(dropId(drop))) {
          props.onAssemblageDrop?.(sourceId, dropId(drop));
          return;
        }
        if (drop === "lande") {
          props.onPlayCard(sourceId);
          return;
        }
        // La carte part d'où le fantôme était lâché : centré sous la souris,
        // au-dessus du doigt (cf. `.dragGhostTouch`, mêmes 1.3 et 16 px). Sa
        // largeur est celle du fantôme — mesurée au DÉPART du geste : la
        // carte restée dans la main a pu changer de taille depuis.
        const touchGhost = gesture?.touch ?? false;
        const width = (gesture?.origin.width ?? 0) * (touchGhost ? 1.3 : 1.08);
        const height = width * 1.4;
        if (width) motion.rememberDrop(sourceId, { x: point.x - width / 2, y: touchGhost ? point.y - 16 - height : point.y - height / 2, width, height });
        props.onPlayCard(sourceId, undefined, slotOf(drop));
        return;
      }
      if (kind === "cast") {
        props.onPlayCard(sourceId, dropId(drop));
        return;
      }
      if (kind === "ability") {
        props.onAbilityDrop?.(sourceId, dropId(drop));
        return;
      }
      const entry = byId.get(sourceId);
      if (drop === "graveyard") {
        // AU DOIGT, une unité lâchée sur le Cimetière n'est pas Sabordée
        // d'office : un glisser du pouce dérape vite, et la carte est
        // perdue. Elle s'affiche en grand, le Sabordage à confirmer d'un
        // bouton. (Un Objet pose déjà sa question : Briser ou Saborder.)
        if (gesture?.touch && entry && getCardDefinition(entry.instance.cardId).type !== "objet") setZoom({ id: sourceId, confirmSaborder: true });
        else props.onDropOnGraveyard(sourceId, "board");
      } else if (drop === "ship") props.onAttack(sourceId);
      else if (entry && drop.startsWith("unit:") && attackReady(entry.instance)) props.onAttack(sourceId, dropId(drop));
      else props.onBreakOnTarget(sourceId, dropId(drop));
    },
    canArm: (sourceId) => {
      const entry = byId.get(sourceId);
      return Boolean(entry && entry.owner.id === viewerId && attackReady(entry.instance));
    },
    /*
     * Appui long (ou simple toucher là où rien d'autre ne le réclame) :
     * la carte s'affiche EN GRAND par-dessus le plateau, le temps de la
     * lire — pas la fiche détaillée, qui est un second écran et ferme le
     * plateau. La fiche reste à un bouton de là, et au clic droit.
     */
    onInspect: (sourceId) => {
      if (canZoom(sourceId)) setZoomId(sourceId);
    },
    onTap: (kind, sourceId, touch) => {
      const entry = byId.get(sourceId);
      if (!entry) return false;
      // La pastille touchée : l'activation (ou, si l'effet vise une unité, le choix de sa cible).
      if (kind === "ability") {
        props.onActivateAbility?.(sourceId);
        return true;
      }
      if (kind === "place" || kind === "cast") {
        // AU DOIGT, TOUCHER UNE CARTE LA MONTRE, JAMAIS NE LA JOUE : le geste
        // naturel « toucher pour lire » posait la carte et dépensait la Raison
        // (audit mobile du 29/09). La carte s'agrandit, avec ce qu'on peut en
        // faire (« Jouer », « Défausser »…) ; un balayage passe à la voisine.
        // Deux touchers pour jouer. À la souris, le clic joue en un geste.
        if (touch) {
          setZoomId(sourceId);
          return true;
        }
        // Même règle qu'au glisser : une carte écartée par le tutoriel ne
        // réagit pas non plus au clic.
        if (!isPlayable(sourceId)) return false;
        props.onHandCardClick(sourceId);
        return true;
      }
      // Un ciblage est en cours côté conteneur : une cible LÉGALE touchée lui
      // revient. Au doigt, toute autre carte s'affiche en grand : on la
      // touchait pour la lire, pas pour lancer un geste que le moteur
      // refuserait (ou pire, qu'il accepterait sur la mauvaise cible).
      if (targeting) {
        const legal = selectionTargets === null || selectionTargets.has(sourceId);
        if (!legal && touch) {
          if (canZoom(sourceId)) setZoomId(sourceId);
          return true;
        }
        props.onBoardCardClick(sourceId, entry.owner.id);
        return true;
      }
      return false;
    },
    onInvalidDrop: (kind, sourceId, drops) => {
      if (kind !== "ability") return;
      // Relâchée sur place (ou hors de toute zone) : rien, comme on repose un objet.
      if (drops.length === 0) return;
      if (!abilityTargetsOf(sourceId)) {
        setDropError("Cette capacité ne vise personne : touchez la pastille pour l'activer.");
        return;
      }
      setDropError("Cette unité n'est pas une cible possible pour cette capacité.");
    },
  });

  const placing = gesture?.kind === "place" ? gesture : null;
  const placingLande = placing ? getCardDefinition(byId.get(placing.sourceId)?.instance.cardId ?? "").type === "lande" : false;
  const abilityDrag = gesture?.kind === "ability" ? gesture : null;
  const casting = gesture?.kind === "cast" ? gesture : null;
  const aiming = gesture?.kind === "aim" ? gesture : null;
  const aimSource = aiming ? byId.get(aiming.sourceId)?.instance : undefined;
  const aimAttacks = aimSource ? attackReady(aimSource) : false;
  const aimBreakTargets = aimSource ? breakTargets(aimSource) : null;
  const castTargets = casting ? handTargets.get(casting.sourceId) ?? null : null;
  // Le Géant en cours de glisser : ses Sentinelles s'éclairent, c'est là qu'on le lâche pour Assembler.
  const placingAssemblage = placing ? assemblageSentinels(placing.sourceId) : null;
  const draggedHand = placing?.sourceId ?? casting?.sourceId ?? null;
  const onHandDragChange = props.onHandDragChange;
  useEffect(() => {
    onHandDragChange?.(draggedHand);
  }, [draggedHand, onHandDragChange]);
  // La carte agrandie disparaît du jeu (posée, défaussée, détruite) : le calque se ferme avec elle.
  const zoomGone = zoomId !== null && !byId.has(zoomId);
  useEffect(() => {
    if (zoomGone) setZoom(null);
  }, [zoomGone]);

  // SENS du ciblage en cours : rouge s'il nuit à la cible, bleu s'il l'aide.
  const polarityOf = (id: string, kind: "playCard" | "break" | "ability" | "reaction", abilityIndex?: number): TargetPolarity => {
    const cardId = byId.get(id)?.instance.cardId;
    return cardId ? sourcePolarity(cardId, kind, abilityIndex) : "friendly";
  };
  const activePolarity: TargetPolarity = casting
    ? polarityOf(casting.sourceId, "playCard")
    : abilityDrag
      ? polarityOf(abilityDrag.sourceId, "ability")
      : aimSource && !aimAttacks
        ? polarityOf(aimSource.instanceId, "break")
        : targeting?.kind === "playCard" || targeting?.kind === "break" || targeting?.kind === "ability"
          ? polarityOf(targeting.sourceInstanceId, targeting.kind)
          : targeting?.kind === "reaction"
            ? polarityOf(targeting.sourceInstanceId, "reaction", targeting.abilityIndex)
            : "friendly";
  const tone: AimTone =
    casting || abilityDrag || (aimSource && !aimAttacks)
      ? activePolarity === "hostile"
        ? "effect"
        : "boon"
      : hover === "graveyard"
        ? "sabotage"
        : "attack";
  // Le tir du canon désigne exactement les mêmes cibles qu'une attaque —
  // même mise en évidence, donc, plutôt qu'un second vocabulaire visuel.
  const attackTargeting = targeting?.kind === "attack" || targeting?.kind === "shipShot" || aimAttacks;
  // Capacité de Navire ciblée : tout ce qui a une Résistance, des deux
  // côtés, et les deux Navires — le ton « effet », puisque ce n'est pas une attaque.
  const anyTargeting = targeting?.kind === "shipTarget";

  // Capacité activable qui attend sa cible : ce sont SES cibles légales qu'on éclaire.
  // Pendant le glisser de sa pastille aussi.
  const abilityTargets =
    targeting?.kind === "ability" ? abilityTargetsOf(targeting.sourceInstanceId) : abilityDrag ? abilityTargetsOf(abilityDrag.sourceId) : null;

  // ── Rendu d'une carte en jeu ────────────────────────────────────────
  function renderBoardCard(card: TableCardModel, owner: PlayerState) {
    const instance = byId.get(card.id)?.instance;
    if (!instance) return null;
    const mine = owner.id === viewerId;
    const def = getCardDefinition(instance.cardId);
    const visible = isVisibleDuringTide(def, tideState);
    const drop = `${mine ? "own" : "unit"}:${card.id}`;
    const ready = mine && attackReady(instance);
    // Ciblage du conteneur (carte de main touchée, bris, réaction,
    // capacité) : ses cibles légales s'éclairent comme au glisser.
    const selectionTarget =
      targeting !== null && targeting.kind !== "attack" && targeting.kind !== "shipShot" && (selectionTargets?.has(card.id) ?? false);
    const effectTarget =
      selectionTarget ||
      (castTargets?.has(card.id) ?? false) ||
      (aimBreakTargets?.has(card.id) ?? false) ||
      (abilityTargets?.has(card.id) ?? false) ||
      (placingAssemblage?.has(card.id) ?? false) ||
      (anyTargeting && hasResistance(def));
    // Objet posé qui peut être Brisé maintenant (son effet s'applique) : il luit, comme une capacité activable.
    const breakable =
      mine &&
      canPlayCards &&
      !gesture &&
      !targeting &&
      def.type === "objet" &&
      (previewBreakReason(state, viewerId, card.id, false)?.allowed ?? false) &&
      (!def.requiresTideStateForBreak || def.requiresTideStateForBreak.includes(tideState)) &&
      (breakTargets(instance)?.size ?? 1) > 0;
    // « Une fois par tour, vous pouvez… » : proposé seulement quand le moteur l'accepterait.
    const activatable =
      mine &&
      canPlayCards &&
      (!gesture || abilityDrag?.sourceId === card.id) &&
      !targeting &&
      props.onActivateAbility !== undefined &&
      canActivateAbility(state, viewerId, card.id);
    const attackTarget = !mine && attackTargeting;
    const allocation = mine ? (props.boardAllocation ?? null) : null;
    const allocated = allocation?.amounts.get(card.id) ?? 0;
    const allocatable = allocation?.eligible.has(card.id) ?? false;
    const pick = props.boardPick ?? null;
    const pickable = pick?.eligible.has(card.id) ?? false;
    const picked = pick?.picked.has(card.id) ?? false;
    // Marque de cible persistante : désignée dans la sélection en cours, ou
    // tenue par une action qui attend encore sa suite.
    const held = picked ? (pick!.polarity as HeldTarget["tone"]) : props.heldTargets?.find((t) => t.instanceId === card.id)?.tone;
    const targetable = effectTarget || attackTarget || allocatable || pickable;
    // Pendant un ciblage, ce qui n'est pas une cible s'estompe : l'œil va
    // droit aux cartes éclairées, et le doigt aussi.
    const targetingActive =
      pick !== null ||
      (targeting !== null && selectionTargets !== null) ||
      casting !== null ||
      abilityDrag !== null ||
      (aiming !== null && (aimAttacks || aimBreakTargets !== null));
    const dimmed =
      targetingActive && !targetable && !held && targeting?.sourceInstanceId !== card.id && aiming?.sourceId !== card.id && abilityDrag?.sourceId !== card.id;

    return (
      <div
        data-card-id={card.id}
        data-board-unit={card.id}
        data-drop={drop}
        data-armable={ready ? "" : undefined}
        // Une Structure adverse invisible ne s'aperçoit pas non plus : on n'en voit que le dos.
        {...(mine || visible ? previewHandlers(card.id) : {})}
        onPointerDown={
          allocation
            ? (event) => {
                // Répartition en cours : un toucher verse un point, rien d'autre.
                if (event.button !== 0) return;
                event.stopPropagation();
                allocation.onAdd(card.id);
              }
            : pick && pickable
              ? (event) => {
                  // Désignation en cours : un toucher désigne ou reprend, rien d'autre.
                  if (event.button !== 0) return;
                  event.stopPropagation();
                  pick.onToggle(card.id);
                }
              : startGesture(mine && !pick ? "aim" : "inspect", card.id)
        }
        onContextMenu={(e) => {
          e.preventDefault();
          if (allocation && allocated > 0) allocation.onRemove(card.id);
          else props.onInspect(instance);
        }}
        className={[
          styles.tableCard,
          styles.boardHoverable,
          mine ? styles.boardGrab : "",
          ready && !gesture ? styles.attacker : "",
          aiming?.sourceId === card.id ? styles.aimSource : "",
          // Ciblage bienfaisant (soin, bonus, Équipement) : bleu ; nuisible : le rouge de l'attaque.
          targetable && !held
            ? `${styles.targetable} ${(effectTarget && activePolarity === "friendly") || allocatable || (pickable && pick?.polarity === "friendly") ? styles.effectTone : ""}`
            : "",
          targetable && hover === drop ? styles.targetHover : "",
          targeting?.sourceInstanceId === card.id ? styles.aimSource : "",
          dimmed ? styles.targetDim : "",
          props.reactionSourceIds?.includes(card.id) || activatable || breakable ? "animate-reaction-pulse" : "",
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
            turnNumber={state.turnNumber}
            variant="board"
          />
        )}
        {held && (
          <span className={styles.heldMark} data-tone={held} aria-label="Cible désignée">
            <svg viewBox="0 0 40 40" aria-hidden>
              <circle cx="20" cy="20" r="13" />
              <circle cx="20" cy="20" r="3.2" className={styles.heldCore} />
              <path d="M20 2v9M20 29v9M2 20h9M29 20h9" />
            </svg>
          </span>
        )}
        {allocated > 0 && (
          <span className={styles.allocationBadge} aria-label={`${allocated} point${allocated > 1 ? "s" : ""} de Résistance versé${allocated > 1 ? "s" : ""}`}>
            +{allocated}
          </span>
        )}
        {/* APRÈS la carte : posé avant, il était recouvert par elle et ne recevait aucun clic. */}
        {activatable && (
          <button
            type="button"
            className={styles.abilityButton}
            title={`Activer (toucher, ou glisser jusqu'à la cible) — ${getCardDefinition(instance.cardId).text}`}
            aria-label={`Activer ${getCardDefinition(instance.cardId).name}`}
            // Le bouton vit DANS la carte, qui démarre son propre geste au pointeur : c'est
            // celui de la PASTILLE qui part (toucher = activer, glisser = viser la cible).
            onPointerDown={(event) => {
              event.stopPropagation();
              startGesture("ability", card.id)(event);
            }}
            onClick={(event) => {
              event.stopPropagation();
              // Au clavier seulement (Entrée, Espace) : le pointeur passe par le geste.
              if (event.detail === 0) props.onActivateAbility?.(card.id);
            }}
          >
            {/* Un doigt qui touche : « à cliquer », sans bouton qui masque la carte. */}
            <svg viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M9 11V5.5a1.5 1.5 0 013 0V10m0-1.5a1.5 1.5 0 013 0V11m0-1a1.5 1.5 0 013 0v4.5a6 6 0 01-6 6h-.6a6 6 0 01-4.6-2.2L4.6 15.4a1.5 1.5 0 012.2-2L9 15V11"
                stroke="currentColor"
                strokeWidth={1.7}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path d="M6.5 4.5L5 3M10.5 2.5V1M14.5 4.5L16 3" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
            </svg>
          </button>
        )}
      </div>
    );
  }

  // ── Actions de la carte agrandie ────────────────────────────────────
  /**
   * Ce que le joueur peut faire de la carte agrandie, MAINTENANT — recalculé
   * à chaque rendu : le plateau se remplit, la Marée tourne, le tour passe,
   * et le bouton le dit au lieu de promettre un geste que le moteur
   * refuserait. Une action impossible reste affichée, grisée, avec son motif.
   */
  function zoomActions(instance: CardInstance, ownerId: PlayerId, inHand: boolean, confirmSaborder: boolean): ZoomAction[] {
    const id = instance.instanceId;
    const def = getCardDefinition(instance.cardId);
    const close = () => setZoom(null);
    if (ownerId !== viewerId) return [];

    if (inHand) {
      // Main trop pleine en fin de tour : la seule chose à faire d'une carte, c'est la jeter.
      if (discardMode) {
        if (discardMode.locked.has(id)) return [{ label: "Défausser", disabled: true, note: "Tu viens de la piocher : elle reste en main." }];
        return discardMode.staged.has(id)
          ? []
          : [{ label: "Défausser", tone: "neutral", onAction: () => { close(); discardMode.onDiscard(id); } }];
      }
      if (!canPlayCards) return [];
      if (!isPlayable(id)) return [{ label: "Jouer", disabled: true, note: "Pas cette carte-ci : l'étape attend l'autre." }];

      const actions: ZoomAction[] = [];
      const refusal = playCardRefusal(state, viewerId, id);
      const price = previewPlayCardReason(state, viewerId, id);
      const debt = price && price.cost > 0 && price.reasonAfter < 0 ? deraisonAnchorDamage(viewer, price.reasonAfter) : 0;
      // Déjà choisie, sa cible attendue : « Jouer » ne l'annule pas, il rend le plateau.
      const selected = targeting?.kind === "playCard" && targeting.sourceInstanceId === id;
      if (refusal) {
        actions.push({ label: "Jouer", disabled: true, note: refusal });
      } else {
        const cost = price && price.cost > 0 ? ` · ${price.cost} Raison` : "";
        actions.push({
          label: debt > 0 ? `Jouer quand même${cost}` : `Jouer${cost}`,
          note:
            debt > 0
              ? `Déraison : ${price!.reasonAfter} Raison — ⚓ −${debt} en fin de tour si vous n'êtes pas remonté à 0.`
              : selected
                ? "Désignez sa cible sur le plateau."
                : undefined,
          warn: debt > 0,
          onAction: () => {
            close();
            if (!selected) props.onHandCardClick(id, { fromZoom: true });
          },
        });
      }
      // Un Objet se Brise aussi depuis la main — l'invite dit le prix et l'effet.
      if (def.type === "objet") {
        const breakPreview = previewBreakReason(state, viewerId, id, true);
        if (breakPreview && !breakPreview.reactionOnly) {
          actions.push({
            label: "Briser depuis la main…",
            tone: "neutral",
            disabled: !breakPreview.allowed,
            note: breakPreview.allowed ? undefined : "Le Bris est bloqué pour l'instant.",
            onAction: () => {
              close();
              props.onDropOnGraveyard(id, "hand");
            },
          });
        }
      }
      return actions;
    }

    // Carte du plateau du joueur.
    if (!canPlayCards || targeting) return [];
    const actions: ZoomAction[] = [];
    if (props.onActivateAbility && canActivateAbility(state, viewerId, id)) {
      const activate = props.onActivateAbility;
      actions.push({ label: "Activer", onAction: () => { close(); activate(id); } });
    }
    if (def.type === "objet") {
      actions.push({ label: "Briser ou Saborder…", tone: "neutral", onAction: () => { close(); props.onDropOnGraveyard(id, "board"); } });
    } else if (confirmSaborder) {
      actions.push({
        label: "Confirmer le Sabordage",
        tone: "danger",
        note: "La carte part au Cimetière.",
        onAction: () => {
          close();
          props.onDropOnGraveyard(id, "board");
        },
      });
    } else {
      // Deux temps : perdre une carte ne tient jamais à un seul toucher.
      actions.push({ label: "Saborder…", tone: "danger", onAction: () => setZoom({ id, confirmSaborder: true }) });
    }
    return actions;
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
    // Panneau de capacité : celui du joueur est cliquable, celui d'en face
    // est en lecture seule — voir son canon découvert est une information
    // publique, qui change ce qu'on ose poser.
    ability: player.id === viewerId ? props.shipAbility : props.opponentShipAbility,
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
        <LandeLayer
          lande={lande}
          // Lue au rendu même où la Lande change (l'effet qui arme l'arrivée
          // passe après) : sa scène doit naître « en attente de la carte ».
          entering={(lande !== undefined && lande.instanceId !== seenLande.current) || landeArrival?.instanceId === lande?.instanceId}
          enterDelayMs={LANDE_ARRIVAL.DISSOLVE_AT}
        />
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
            board={boardPermanents(opponent.board).map(toModel)}
            capacity={opponentShip.slotCount}
            deck={opponent.deck.length}
            graveyard={opponent.graveyard.length}
            graveyardTop={graveyardTile(opponent)}
            onGraveyardClick={() => props.onOpenGraveyard(opponent.id)}
            renderCard={(card) => renderBoardCard(card, opponent)}
            wrapShip={(ship) => (
              <div
                data-drop="ship"
                data-ship-target={opponent.id}
                onClick={() => {
                  // Pendant un ciblage d'attaque, le Navire est une CIBLE ; sinon on consulte sa fiche.
                  // Tout autre ciblage ne vise pas de Navire : le toucher le lit.
                  if (targeting?.kind === "attack" || targeting?.kind === "shipShot" || anyTargeting) props.onShipClick(opponent.id);
                  else setShipInfoFor(opponent.id);
                }}
                onContextMenu={(event) => {
                  event.preventDefault();
                  setShipInfoFor(opponent.id);
                }}
                title={attackTargeting || anyTargeting ? undefined : "Fiche du Navire adverse"}
                className={`${styles.shipTarget} ${attackTargeting || anyTargeting ? styles.targetable : styles.shipInspectable} ${hover === "ship" ? styles.targetHover : ""}`}
              >
                {ship}
              </div>
            )}
          />
          <CenterZone
            tide={tide}
            cargo={
              // Effets en cours de l'adversaire AU-DESSUS du hublot de Lande, les tiens EN DESSOUS :
              // chacun du côté de son camp.
              <div className={landeStyles.cargoRow}>
                <OngoingEffects
                  effects={opponent.board.filter((card) => isOngoingEffect(getCardDefinition(card.cardId))).map((card) => ({ card, ownerId: opponent.id }))}
                  viewerId={viewerId}
                  tideState={tideState}
                  pulsingIds={props.reactionSourceIds}
                />
                <LandeBadge
                  environment={state.environment}
                  tideState={tideState}
                  dropState={placingLande ? (hover === "lande" ? "over" : "ready") : "idle"}
                />
                <OngoingEffects
                  effects={viewer.board.filter((card) => isOngoingEffect(getCardDefinition(card.cardId))).map((card) => ({ card, ownerId: viewer.id }))}
                  viewerId={viewerId}
                  tideState={tideState}
                  pulsingIds={props.reactionSourceIds}
                />
              </div>
            }
            hint={
              dropError ? (
                <div className={`${styles.centerHint} ${styles.centerHintError}`} role="alert">
                  <span>{dropError}</span>
                </div>
              ) : props.hint ? (
                <div className={styles.centerHint} role="status">
                  <span>{props.hint}</span>
                  {props.onCancelHint && (
                    <button type="button" className={styles.centerHintButton} onClick={props.onCancelHint}>
                      Annuler
                    </button>
                  )}
                </div>
              ) : gesture?.armed ? (
                // Unité armée d'un toucher : rien ne disait qu'elle attendait sa cible.
                <div className={styles.centerHint} role="status">
                  <span>{targetingHint("attack")}</span>
                  <button type="button" className={styles.centerHintButton} onClick={cancelGesture}>
                    Annuler
                  </button>
                </div>
              ) : null
            }
          />
          <PlayerZone
            ship={shipView(viewer, viewerShip)}
            board={boardPermanents(viewer.board).map(toModel)}
            capacity={viewerShip.slotCount}
            deck={viewer.deck.length}
            graveyard={viewer.graveyard.length}
            graveyardTop={graveyardTile(viewer)}
            onGraveyardClick={() => props.onOpenGraveyard(viewer.id)}
            wrapShip={(ship) => (
              <div
                data-ship-target={viewer.id}
                className={`${styles.shipTarget} ${anyTargeting ? `${styles.targetable} ${styles.effectTone}` : styles.shipInspectable}`}
                title={anyTargeting ? undefined : "Fiche de ton Navire"}
                onClick={() => {
                  // Seule une capacité ciblée vise son propre Navire.
                  if (anyTargeting) props.onShipClick(viewer.id);
                  else setShipInfoFor(viewer.id);
                }}
                onContextMenu={(event) => {
                  event.preventDefault();
                  setShipInfoFor(viewer.id);
                }}
              >
                {ship}
              </div>
            )}
            graveyardDropState={
              // Défausse de fin de tour : le Cimetière luit dès la question
              // posée, avant même qu'on saisisse une carte — c'est là qu'on va.
              discardMode ||
              (aiming && !aiming.armed && canPlayCards) ||
              (placing && getCardDefinition(byId.get(placing.sourceId)?.instance.cardId ?? "").type === "objet")
                ? hover === "graveyard"
                  ? "over"
                  : "ready"
                : "idle"
            }
            dropState={placing && slotsFree && !placingLande ? (hover !== null && isBoardDrop(hover) ? "over" : "ready") : "idle"}
            dropSlot={placing && hover !== null && isBoardDrop(hover) ? slotOf(hover) : undefined}
            renderCard={(card) => renderBoardCard(card, viewer)}
          />
          <TableHand
            cards={(discardMode ? viewer.hand.filter((card) => !discardMode.staged.has(card.instanceId)) : viewer.hand).map(toModel)}
            dragging={placing !== null || casting !== null}
            renderCard={(card) => {
              const instance = byId.get(card.id)?.instance;
              if (!instance) return null;
              const kind = handTargets.get(card.id) ? "cast" : "place";
              // Carte écartée par le tutoriel : elle reste lisible et
              // consultable (clic droit), mais visiblement hors-jeu —
              // sinon le joueur la tire en vain et croit à une panne.
              // Idem pour la carte qu'un « piochez puis défaussez » vient
              // d'apporter : elle ne peut pas repartir aussitôt.
              const muted = props.playableHandCards
                ? !props.playableHandCards.has(card.id)
                : discardMode?.locked.has(card.id) === true;
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
                    (canPlayCards || discardMode) && !muted ? styles.handGrab : "",
                    muted ? styles.handCardMuted : "",
                    placing?.sourceId === card.id ? styles.dragSource : "",
                    casting?.sourceId === card.id || targeting?.sourceInstanceId === card.id ? styles.castSource : "",
                    // Son effet est applicable maintenant (Assemblage possible) : elle luit dans la main.
                    !gesture && assemblageSentinels(card.id) ? "animate-reaction-pulse" : "",
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
            audience={<LiveAudience state={state} viewerId={viewerId} />}
            journal={props.journal}
            phaseButton={
              <PhaseButton
                label={props.phaseButton.label}
                phaseLabel={props.phaseButton.phaseLabel}
                icon={props.phaseButton.icon}
                disabled={props.phaseButton.disabled}
                onClick={props.phaseButton.onClick}
                secondary={props.phaseButton.secondary}
              />
            }
          />
        </GameStage>

        <EquipLinks attachments={attachments} layoutKey={boardKey} />

        <MotionLayer flights={motion.flights} />
        {(() => {
          // Carte de main en cours de glisser : son prix au-dessus de la jauge.
          const dragged = placing?.sourceId ?? casting?.sourceId;
          const preview = dragged ? previewPlayCardReason(state, viewerId, dragged) : undefined;
          if (!preview || !preview.allowed) return null;
          return (
            <ReasonCostPreview
              playerId={viewerId}
              cost={preview.cost}
              debtDamage={preview.reasonAfter < 0 ? deraisonAnchorDamage(viewer, preview.reasonAfter) : 0}
            />
          );
        })()}
        {/* Pendant un geste (glisser, viser), pas d'aperçu : c'est le plateau qu'on regarde. */}
        {preview && !gesture && (() => {
          const found = byId.get(preview.id);
          return found ? (
            <HoverCardPreview anchor={preview.rect}>{renderFace(found.instance, found.owner)}</HoverCardPreview>
          ) : null;
        })()}
        {landeArrival && (
          <LandeArrival
            key={landeArrival.instanceId}
            cardId={landeArrival.cardId}
            instanceId={landeArrival.instanceId}
            ownerId={landeArrival.ownerId}
            tideState={tideState}
            onDone={() => setLandeArrival(null)}
          />
        )}
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

      {/* La carte agrandie vit HORS de `GameViewport` : la scène y est mise
          à l'échelle pour tenir dans la fenêtre, et l'agrandissement se
          mesure, lui, à la fenêtre entière. */}
      {(() => {
        const found = zoomId ? byId.get(zoomId) : undefined;
        if (!found) return null;
        const inHand = found.owner.id === viewerId && viewer.hand.some((c) => c.instanceId === found.instance.instanceId);
        // Parcours de la main : les cartes dans l'ordre de l'éventail (hors celles déjà mises de côté pour la défausse).
        const handList = discardMode ? viewer.hand.filter((c) => !discardMode.staged.has(c.instanceId)) : viewer.hand;
        const handIndex = inHand ? handList.findIndex((c) => c.instanceId === found.instance.instanceId) : -1;
        const neighbour = (delta: number) => {
          const next = handIndex >= 0 ? handList[handIndex + delta] : undefined;
          return next ? () => setZoomId(next.instanceId) : undefined;
        };
        return (
          <TableCardZoom
            key={found.instance.instanceId}
            onClose={() => setZoomId(null)}
            actions={zoomActions(found.instance, found.owner.id, inHand, zoom?.confirmSaborder ?? false)}
            legend={inHand ? [] : cardStatusLegend(found.instance, tideState, auraContextFor(found.owner), state.turnNumber)}
            onPrev={neighbour(-1)}
            onNext={neighbour(1)}
            position={handIndex >= 0 ? { index: handIndex, count: handList.length } : undefined}
            onDetail={() => {
              setZoomId(null);
              props.onInspect(found.instance);
            }}
          >
            {renderFace(found.instance, found.owner)}
          </TableCardZoom>
        );
      })()}

      {shipInfoFor && (
        <ShipInfoSheet
          player={shipInfoFor === viewer.id ? viewer : opponent}
          ship={shipInfoFor === viewer.id ? viewerShip : opponentShip}
          ownerLabel={shipInfoFor === viewer.id ? "Ton Navire" : "Navire adverse"}
          onClose={() => setShipInfoFor(null)}
        />
      )}
      <AttackImpactLayer attacks={props.attacks} />
      <EffectFxLayer volleys={props.volleys} />
    </>
  );
}
