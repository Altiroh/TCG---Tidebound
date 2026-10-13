"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { getCardDefinition } from "@/game";
import { RARITY_ORDER } from "@/game/boosters";
import styles from "@/features/boosters/opening/BoosterOpening.module.css";
import { useCardBackSrc } from "@/features/cosmetics/CardBackProvider";
import { CardDetailModal } from "@/features/collection/card-detail/CardDetailModal";
import {
  preloadBoosterOpeningAssets,
  type BoosterOpeningAssetStatus,
} from "@/features/boosters/opening/boosterOpeningAssets";
import {
  boosterOpeningReducer,
  createBoosterOpeningState,
  isCardInteractive,
  type BoosterOpeningPhase,
} from "@/features/boosters/opening/boosterOpeningMachine";
import {
  playAbyssalRevealSound,
  playBoosterEnterSound,
  playCardFlipSound,
  playCardSpawnSound,
  playPackOpenSound,
  playPackTearSound,
  playRareRevealSound,
} from "@/features/boosters/opening/boosterOpeningSound";
import {
  BOOSTER_OPENING_TIMINGS,
  BOOSTER_OPENING_TIMINGS_REDUCED,
  PACK_RETREAT_GAP_MS,
  cardsSettledAt,
  lastCardExitAt,
  tearSnapAt,
  tearStartAt,
  type BoosterOpeningTimings,
} from "@/features/boosters/opening/boosterOpeningTimings";
import type { BoosterCardShowcase } from "@/features/boosters/opening/BoosterCard";
import { BoosterCards } from "@/features/boosters/opening/BoosterCards";
import { BoosterPack } from "@/features/boosters/opening/BoosterPack";
import { BoosterParticles } from "@/features/boosters/opening/BoosterParticles";
import { packVisualVariables, type BoosterPackVisual } from "@/features/boosters/opening/boosterPackVisuals";
import { isHighRarity, OPENING_RARITY_LABEL, type BoosterOpeningCard, type BoosterOpeningRarity } from "@/features/boosters/opening/types";

/** Rectangle à l'écran d'où part le sachet (celui du plan d'ouverture), en pixels. */
export interface BoosterOpeningOrigin {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface BoosterOpeningSceneProps {
  /** Contenu à révéler — le tirage du serveur (`openBooster`), déjà écrit en base avant que la scène ne commence. */
  cards: readonly BoosterOpeningCard[];
  /** Sachet mis en scène et son calage (`getBoosterPackVisual`). */
  visual: BoosterPackVisual;
  /**
   * Où était le sachet avant la scène : il en PART pour venir au centre,
   * au lieu de surgir du bas. Absent (essai d'animation) : entrée par le bas.
   */
  origin?: BoosterOpeningOrigin | null;
  /**
   * Libellé du bouton de sortie. « Fermer » par défaut ; un LOT enchaîne sur
   * le bilan des autres sachets, et le bouton doit le dire plutôt que de
   * laisser croire que tout est fini.
   */
  closeLabel?: string;
  /**
   * Nombre de sachets dont viennent `cards`. Un seul : l'éventail habituel.
   * Plusieurs (ouverture en lot) : TOUTES les cartes du lot sortent, posées
   * en grille de deux lignes, page après page — on fait défiler vers la
   * droite pour voir la suite (retour du 13/10/2026).
   */
  packCount?: number;
  onClose: () => void;
}

const PACK_VISIBLE_PHASES: readonly BoosterOpeningPhase[] = ["idle", "enter", "ready", "opening", "cardsSpawning"];
const CARDS_VISIBLE_PHASES: readonly BoosterOpeningPhase[] = ["cardsSpawning", "cardsReady", "revealing", "completed"];

/** Grille d'un lot : deux lignes, et autant de colonnes que l'écran en loge. */
const GRID_ROWS = 2;

/** Colonnes par page : six sur un écran large, cinq sinon, trois en portrait. */
function gridColumns(): number {
  if (typeof window === "undefined") return 6;
  const ratio = window.innerWidth / Math.max(1, window.innerHeight);
  return ratio >= 1.6 ? 6 : ratio >= 1.1 ? 5 : 3;
}

/** Les raretés qui se révèlent d'elles-mêmes à la sortie du sachet ; les autres attendent, de dos, dans leur halo. */
const AUTO_REVEAL_RARITIES: readonly BoosterOpeningRarity[] = ["common", "uncommon"];

/** Raretés dont la révélation secoue la scène d'un éclair. */
const IMPACT_RARITIES: readonly BoosterOpeningRarity[] = ["legendary", "abyssal"];

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Doigt plutôt que souris : les consignes de la scène ne disent pas la même chose. */
function hasCoarsePointer(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
}

/** Minuteries de la scène, toutes annulées au démontage (fermeture en cours d'animation comprise). */
function useSceneTimers() {
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const active = timers.current;
    return () => {
      active.forEach(clearTimeout);
      active.clear();
    };
  }, []);
  return useCallback((callback: () => void, delay: number) => {
    const id = setTimeout(() => {
      timers.current.delete(id);
      callback();
    }, delay);
    timers.current.add(id);
  }, []);
}

function timingVariables(timings: BoosterOpeningTimings, cardCount: number): CSSProperties {
  const vars: Record<`--${string}`, string> = {
    // Le nombre de cartes est une DIMENSION de la scène, pas seulement une
    // boucle React : c'est lui qui borne l'unité `--u`, pour que la rangée
    // posée tienne à l'écran quel que soit le booster ouvert.
    "--count": `${cardCount}`,
    "--t-backdrop": `${timings.backdropIn}ms`,
    "--t-pack-enter": `${timings.packEnter}ms`,
    "--t-tension": `${timings.tension}ms`,
    "--t-crossfade": `${timings.crossfade}ms`,
    "--t-tear-start": `${tearStartAt(timings)}ms`,
    "--t-tear": `${timings.tear}ms`,
    "--t-snap": `${tearSnapAt(timings)}ms`,
    "--t-top-fly": `${timings.topFly}ms`,
    "--t-card-spawn": `${timings.cardRise + timings.cardPlace}ms`,
    "--t-retreat": `${timings.packRetreat}ms`,
    "--t-retreat-delay": `${lastCardExitAt(timings, cardCount) + PACK_RETREAT_GAP_MS}ms`,
    "--t-showcase-in": `${timings.showcaseIn}ms`,
    "--t-showcase-out": `${timings.showcaseOut}ms`,
    "--t-ui": `${timings.uiIn}ms`,
    "--t-scene-out": `${timings.sceneOut}ms`,
  };
  return vars as CSSProperties;
}

/**
 * Scène plein écran d'ouverture de booster.
 *
 * Ce composant ne connaît ni Supabase, ni la collection, ni l'inventaire :
 * il reçoit une liste de cartes et la met en scène. Il n'écrit rien, nulle
 * part.
 *
 * Déroulé : le sachet quitte le plan d'ouverture et vient au CENTRE, où il
 * attend qu'on le touche ; il se déchire, les cartes en sortent ; chacune se
 * retourne au survol, au doigt qui glisse dessus (`handleScenePointer`) ou à
 * la tape, avec la lumière de sa rareté ; une Abyssale quitte la rangée pour
 * un gros plan au milieu de l'écran. Une fois une carte retournée, un clic
 * ou une tape ouvre sa fiche.
 *
 * Répartition des rôles :
 *   - `boosterOpeningMachine` : ce qui a le droit de se passer (pur)
 *   - ce composant            : QUAND ça se passe (minuteries, sons, focus)
 *   - `BoosterOpening.module.css` : COMMENT ça bouge (transform/opacity)
 */
export function BoosterOpeningScene({ cards: tirage, visual, origin = null, closeLabel = "Fermer", packCount = 1, onClose }: BoosterOpeningSceneProps) {
  // Les MEILLEURES raretés d'abord (retour du 13/10/2026) : la plus rare
  // ouvre la rangée — et, en lot, la première page —, les communes ferment
  // la marche. Tri stable : à rareté égale, l'ordre du tirage est gardé.
  const cards = useMemo(() => [...tirage].sort((a, b) => RARITY_ORDER.indexOf(b.rarity) - RARITY_ORDER.indexOf(a.rarity)), [tirage]);
  const [reducedMotion] = useState(prefersReducedMotion);
  const [coarsePointer] = useState(hasCoarsePointer);
  const baseTimings = reducedMotion ? BOOSTER_OPENING_TIMINGS_REDUCED : BOOSTER_OPENING_TIMINGS;
  const isGrid = packCount > 1;
  // Un lot sort quarante cartes : au rythme d'un sachet, la sortie durait
  // six secondes. Le lot entier sort en deux secondes environ.
  const timings = useMemo(
    () => (isGrid ? { ...baseTimings, cardStagger: Math.min(baseTimings.cardStagger, Math.max(28, Math.round(2000 / Math.max(1, tirage.length)))) } : baseTimings),
    [isGrid, baseTimings, tirage.length],
  );
  const [gridCols, setGridCols] = useState(gridColumns);
  useEffect(() => {
    if (!isGrid) return undefined;
    const update = () => setGridCols(gridColumns());
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [isGrid]);
  const grid = useMemo(() => (isGrid ? { cols: gridCols, rows: GRID_ROWS } : null), [isGrid, gridCols]);
  const pageCount = grid ? Math.max(1, Math.ceil(tirage.length / (grid.cols * grid.rows))) : 1;
  const [page, setPage] = useState(0);
  useEffect(() => {
    setPage((current) => Math.min(current, pageCount - 1));
  }, [pageCount]);

  const [state, dispatch] = useReducer(boosterOpeningReducer, cards.length, createBoosterOpeningState);
  const [assets, setAssets] = useState<BoosterOpeningAssetStatus | null>(null);
  const [closing, setClosing] = useState(false);
  const [impact, setImpact] = useState<{ key: number; rarity: BoosterOpeningRarity } | null>(null);
  /** Gros plans : l'Abyssale au centre (`in`), en retour (`out`), puis rangée (`done`). */
  const [showcases, setShowcases] = useState<Record<number, BoosterCardShowcase>>({});
  const [detailCardId, setDetailCardId] = useState<string | null>(null);
  const [enterStyle, setEnterStyle] = useState<CSSProperties | undefined>(undefined);

  const schedule = useSceneTimers();
  const rootRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const revealRequested = useRef(new Set<number>());
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const { phase } = state;
  const showcaseIndex = Number(Object.entries(showcases).find(([, value]) => value === "in" || value === "out")?.[0] ?? -1);
  const showcaseActive = showcaseIndex >= 0;
  const detailOpen = detailCardId !== null;
  const detailOpenRef = useRef(detailOpen);
  detailOpenRef.current = detailOpen;
  // Le dos équipé est celui qu'on voit pendant toute la sortie du sachet :
  // c'est donc lui qu'il faut précharger, pas le dos par défaut.
  const cardBack = useCardBackSrc();

  // --- Préchargement, puis entrée du paquet. -------------------------------
  useEffect(() => {
    let cancelled = false;
    void preloadBoosterOpeningAssets(visual, cardBack).then((status) => {
      if (cancelled) return;
      // Trajectoire d'entrée : du plan d'ouverture jusqu'au centre. Le sachet
      // est déjà monté (invisible) à sa place finale : on mesure l'écart.
      const anchor = rootRef.current?.querySelector<HTMLElement>(`.${styles.packAnchor}`);
      if (origin && anchor) {
        const target = anchor.getBoundingClientRect();
        if (target.height > 0) {
          const dx = origin.x + origin.width / 2 - (target.left + target.width / 2);
          const dy = origin.y + origin.height / 2 - (target.top + target.height / 2);
          setEnterStyle({
            "--enter-dx": `${dx.toFixed(1)}px`,
            "--enter-dy": `${dy.toFixed(1)}px`,
            "--enter-scale": (origin.height / target.height).toFixed(3),
            "--enter-opacity": "1",
            "--enter-rot": "-4deg",
          } as CSSProperties);
        }
      }
      setAssets(status);
      dispatch({ type: "assetsReady" });
      playBoosterEnterSound();
      schedule(() => dispatch({ type: "packSettled" }), timings.packEnter + timings.packHold);
    });
    return () => {
      cancelled = true;
    };
    // `origin` n'est lu qu'une fois, à l'entrée : un changement ensuite n'a plus de sens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schedule, timings, visual, cardBack]);

  // --- Enchaînement automatique des phases non interactives. ---------------
  useEffect(() => {
    if (phase === "opening") {
      schedule(playPackTearSound, tearStartAt(timings));
      schedule(playPackOpenSound, tearSnapAt(timings));
      schedule(() => dispatch({ type: "packTorn" }), tearSnapAt(timings) + timings.spawnAfterSnap);
    } else if (phase === "cardsSpawning") {
      // Un son par carte, mais pas plus d'un toutes les 90 ms : en lot, les
      // sorties se chevauchent et le bruit couvrait tout.
      const soundEvery = Math.max(1, Math.ceil(90 / Math.max(1, timings.cardStagger)));
      for (let index = 0; index < cards.length; index += soundEvery) {
        schedule(playCardSpawnSound, index * timings.cardStagger);
      }
      schedule(() => dispatch({ type: "cardsPlaced" }), cardsSettledAt(timings, cards.length));
    } else if (phase === "ready") {
      // Le sachet attend : le focus y va, Entrée l'ouvre.
      rootRef.current?.querySelector<HTMLElement>(`.${styles.packAnchor}`)?.focus({ preventScroll: true });
    }
  }, [phase, cards.length, schedule, timings]);

  useEffect(() => {
    if (phase === "completed" && !showcaseActive) schedule(() => closeButtonRef.current?.focus({ preventScroll: true }), timings.uiIn);
  }, [phase, showcaseActive, schedule, timings]);

  /**
   * Les COMMUNES et PEU COMMUNES se retournent d'elles-mêmes dès qu'elles
   * sont posées, en cascade rapide : il n'y a rien à attendre d'elles. Les
   * raretés hautes (rare, épique, légendaire, abyssale) restent de dos dans
   * le halo de leur rareté, et c'est au joueur de les retourner (retour du
   * 13/10/2026).
   */
  const autoRevealDone = useRef(false);
  useEffect(() => {
    if (phase !== "cardsReady" || autoRevealDone.current) return;
    autoRevealDone.current = true;
    const step = isGrid ? 45 : 90;
    let order = 0;
    cards.forEach((card, index) => {
      if (!AUTO_REVEAL_RARITIES.includes(card.rarity)) return;
      const position = order;
      order += 1;
      // Un retournement sur trois s'entend : une cascade, pas une rafale.
      schedule(() => handleReveal(index, position % 3 !== 0), position * step);
    });
    // `handleReveal` est stable pour une scène donnée.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const handleOpenPack = useCallback(() => {
    if (stateRef.current.phase !== "ready") return;
    dispatch({ type: "openRequested" });
  }, []);

  // --- Gros plan d'une Abyssale. -------------------------------------------
  const dismissShowcase = useCallback(() => {
    setShowcases((current) => {
      const entry = Object.entries(current).find(([, value]) => value === "in");
      if (!entry) return current;
      const index = Number(entry[0]);
      schedule(() => setShowcases((later) => ({ ...later, [index]: "done" })), timings.showcaseOut);
      return { ...current, [index]: "out" };
    });
  }, [schedule, timings]);

  // --- Révélation d'une carte. ---------------------------------------------
  const handleReveal = useCallback(
    (index: number, quiet = false) => {
      const card = cards[index];
      if (!card || revealRequested.current.has(index) || !isCardInteractive(stateRef.current, index)) return;
      revealRequested.current.add(index);

      const pause = timings.revealPause[card.rarity];
      dispatch({ type: "revealRequested", index, withPause: pause > 0 });

      schedule(() => {
        if (pause > 0) dispatch({ type: "flipStarted", index });
        if (!quiet) playCardFlipSound();
      }, pause);

      schedule(() => {
        dispatch({ type: "cardRevealed", index });
        if (card.rarity === "abyssal") playAbyssalRevealSound();
        else if (isHighRarity(card.rarity)) playRareRevealSound();
        if (IMPACT_RARITIES.includes(card.rarity)) setImpact((current) => ({ key: (current?.key ?? 0) + 1, rarity: card.rarity }));
        // L'Abyssale quitte la rangée pour le centre de l'écran : on la
        // regarde, puis un clic la renvoie à sa place.
        if (card.rarity === "abyssal" && !reducedMotion) {
          schedule(() => setShowcases((current) => ({ ...current, [index]: "in" })), 260);
        }
      }, pause + timings.flip[card.rarity]);
    },
    [cards, schedule, timings, reducedMotion],
  );

  /** « Tout retourner » : les cartes encore de dos se retournent en cascade. */
  const revealAll = useCallback(() => {
    const hidden = stateRef.current.cards.flatMap((cardState, index) => (cardState === "hidden" ? [index] : []));
    hidden.forEach((index, position) => schedule(() => handleReveal(index, position % 2 !== 0), position * 120));
  }, [handleReveal, schedule]);

  // --- Fermeture : aucune sauvegarde, on rend simplement la main. ---------
  const handleClose = useCallback(() => {
    if (stateRef.current.phase !== "completed") return;
    setClosing(true);
    schedule(() => onCloseRef.current(), timings.sceneOut);
  }, [schedule, timings]);

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      // La fiche ouverte gère sa propre fermeture : Échap ne ferme qu'elle.
      if (event.key !== "Escape" || detailOpenRef.current) return;
      if (showcaseActive) dismissShowcase();
      else handleClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [handleClose, dismissShowcase, showcaseActive]);

  // Focus déplacé dans la scène le temps de l'ouverture, rendu à l'appelant ensuite.
  // Capturé à l'initialisation (et non dans l'effet) pour survivre au double montage du mode strict.
  const [returnFocusTo] = useState(() => document.activeElement as HTMLElement | null);
  useEffect(() => {
    rootRef.current?.focus({ preventScroll: true });
    return () => returnFocusTo?.focus?.({ preventScroll: true });
  }, [returnFocusTo]);

  /**
   * DOIGT QUI GLISSE — l'équivalent tactile du survol.
   *
   * Sur un écran tactile il n'y a pas de survol : `pointerenter` n'arrive
   * qu'à la carte où le doigt se pose, et le pointeur reste ensuite CAPTÉ
   * par elle (capture implicite du tactile), si bien que traverser la rangée
   * ne retournait rien. On lit donc la carte réellement sous le point, à
   * chaque déplacement — c'est ce qui rend le geste possible sur iOS.
   */
  const handleScenePointer = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      // La souris garde son survol natif, plus fidèle (pas besoin d'appuyer).
      if (event.pointerType === "mouse") return;
      const under = document.elementFromPoint(event.clientX, event.clientY);
      const target = under?.closest<HTMLElement>("[data-card-index]");
      if (!target) return;
      const index = Number(target.dataset.cardIndex);
      if (Number.isNaN(index)) return;
      handleReveal(index);
    },
    [handleReveal],
  );

  /**
   * LOT : on tourne les pages en glissant (doigt ou souris), au pavé
   * tactile, aux flèches du clavier ou aux boutons. Le glisser-retourner
   * d'un sachet n'existe pas ici — il n'y reste que des raretés hautes à
   * retourner, et elles se retournent au toucher ou au survol.
   */
  const drag = useRef<{ x: number; y: number; id: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const wheel = useRef(0);
  const turnPage = useCallback(
    (delta: number) => {
      setPage((current) => {
        const next = Math.min(pageCount - 1, Math.max(0, current + delta));
        if (next !== current) playCardSpawnSound();
        return next;
      });
    },
    [pageCount],
  );

  function handleGridPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    drag.current = { x: event.clientX, y: event.clientY, id: event.pointerId, moved: false };
    suppressClick.current = false;
  }

  function handleGridPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const current = drag.current;
    if (!current || current.id !== event.pointerId || current.moved) return;
    const dx = event.clientX - current.x;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(event.clientY - current.y)) {
      current.moved = true;
      suppressClick.current = true;
      turnPage(dx < 0 ? 1 : -1);
    }
  }

  function handleGridPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (drag.current?.id === event.pointerId) drag.current = null;
  }

  function handleGridWheel(event: React.WheelEvent<HTMLDivElement>) {
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    wheel.current += delta;
    if (Math.abs(wheel.current) < 80) return;
    turnPage(Math.sign(wheel.current));
    wheel.current = 0;
  }

  useEffect(() => {
    if (!isGrid) return undefined;
    function handleArrows(event: KeyboardEvent) {
      if (detailOpenRef.current) return;
      if (event.key === "ArrowRight") turnPage(1);
      else if (event.key === "ArrowLeft") turnPage(-1);
    }
    window.addEventListener("keydown", handleArrows);
    return () => window.removeEventListener("keydown", handleArrows);
  }, [isGrid, turnPage]);

  const sceneStyle = useMemo(
    () =>
      ({
        ...timingVariables(timings, cards.length),
        ...(grid ? { "--grid-cols": `${grid.cols}` } : {}),
        ...packVisualVariables(visual),
        "--pack-closed-art": `url("${visual.assets.closed}")`,
      }) as CSSProperties,
    [timings, cards.length, visual, grid],
  );

  const revealedCount = state.cards.filter((card) => card === "revealed").length;
  const showPack = PACK_VISIBLE_PHASES.includes(phase);
  const showCards = assets !== null && CARDS_VISIBLE_PHASES.includes(phase);
  const cardsInteractive = (phase === "cardsReady" || phase === "revealing") && !showcaseActive && !detailOpen;
  const showcaseCard = showcaseActive ? cards[showcaseIndex] : undefined;

  return createPortal(
    <div
      ref={rootRef}
      className={styles.scene}
      style={sceneStyle}
      data-phase={phase}
      data-closing={closing || undefined}
      data-reduced-motion={reducedMotion || undefined}
      data-origin={origin ? "dock" : undefined}
      data-layout={isGrid ? "grid" : undefined}
      role="dialog"
      aria-modal="true"
      aria-label="Ouverture de booster"
      tabIndex={-1}
    >
      <div className={styles.backdrop} aria-hidden />
      <div className={styles.sea} aria-hidden>
        <span className={styles.seaLightA} />
        <span className={styles.seaLightB} />
      </div>
      {!reducedMotion && <BoosterParticles variant="ambient" />}

      <div
        className={styles.stage}
        onPointerDown={isGrid ? handleGridPointerDown : handleScenePointer}
        onPointerMove={isGrid ? handleGridPointerMove : handleScenePointer}
        onPointerUp={isGrid ? handleGridPointerUp : undefined}
        onPointerCancel={isGrid ? handleGridPointerUp : undefined}
        onWheel={isGrid ? handleGridWheel : undefined}
        onClickCapture={(event) => {
          // Un glisser qui tourne la page n'est pas un toucher de carte.
          if (suppressClick.current) {
            suppressClick.current = false;
            event.stopPropagation();
          }
        }}
      >
        {showCards && (
          <div
            className={styles.cardsTrack}
            data-scrolled={grid && page > 0 ? "true" : undefined}
            style={grid ? ({ "--grid-shift": `calc(var(--slot-step) * ${page * grid.cols})` } as CSSProperties) : undefined}
          >
          <BoosterCards
            cards={cards}
            states={state.cards}
            interactive={cardsInteractive}
            cardBackAvailable={assets.cardBackAvailable}
            timings={timings}
            showcases={showcases}
            onReveal={handleReveal}
            onInspect={setDetailCardId}
            onShowcaseDismiss={dismissShowcase}
            grid={grid}
            page={page}
          />
          </div>
        )}

        {/* Pages d'un lot : flèches de part et d'autre, compte en dessous. */}
        {grid && pageCount > 1 && showCards && phase !== "cardsSpawning" && !showcaseActive && (
          <>
            <button type="button" className={styles.pageArrow} data-side="prev" onClick={() => turnPage(-1)} disabled={page === 0} aria-label="Cartes précédentes">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" aria-hidden>
                <path d="M14.5 5.5L8 12l6.5 6.5" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <button
              type="button"
              className={styles.pageArrow}
              data-side="next"
              onClick={() => turnPage(1)}
              disabled={page >= pageCount - 1}
              aria-label="Cartes suivantes"
            >
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" aria-hidden>
                <path d="M9.5 5.5L16 12l-6.5 6.5" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <span className={styles.pageDots} aria-label={`Page ${page + 1} sur ${pageCount}`}>
              {Array.from({ length: pageCount }, (_, dot) => (
                <span key={dot} data-active={dot === page || undefined} />
              ))}
            </span>
          </>
        )}

        {showPack && (
          <BoosterPack
            visual={visual}
            ready={phase === "ready"}
            torn={phase === "opening" || phase === "cardsSpawning"}
            retreating={phase === "cardsSpawning"}
            enterStyle={enterStyle}
            onOpen={handleOpenPack}
          />
        )}

        {impact && <div key={impact.key} className={styles.revealImpact} data-rarity={impact.rarity} aria-hidden />}

        {/* Gros plan : le fond s'éteint, des rais de lumière froide tournent
            derrière la carte, son nom et sa rareté s'affichent dessous. */}
        {showcaseActive && (
          <div
            className={styles.showcase}
            data-leaving={showcases[showcaseIndex] === "out" || undefined}
            onClick={dismissShowcase}
            aria-hidden
          >
            <span className={styles.showcaseRays} />
            <span className={styles.showcaseCaption}>
              <span className={styles.showcaseRarity}>{showcaseCard ? OPENING_RARITY_LABEL[showcaseCard.rarity] : ""}</span>
              <span className={styles.showcaseName}>{showcaseCard?.cardId ? getCardDefinition(showcaseCard.cardId).name : "Carte test"}</span>
              <span className={styles.showcaseHint}>Clique pour la ranger · clic droit pour sa fiche</span>
            </span>
          </div>
        )}

        <p className={styles.hint} data-visible={(phase === "ready" || cardsInteractive) || undefined} aria-live="polite">
          {phase === "ready" ? (
            <>Touche le booster pour l&apos;ouvrir</>
          ) : (
            showCards &&
            phase !== "cardsSpawning" && (
              <>
                {isGrid
                  ? coarsePointer
                    ? "Touche les cartes rares pour les retourner · glisse pour voir la suite"
                    : "Survole les cartes rares pour les retourner · ← → pour voir la suite"
                  : coarsePointer
                    ? "Fais glisser ton doigt sur les cartes rares pour les retourner"
                    : "Survole les cartes rares pour les retourner"}
                <span className={styles.hintCount}>
                  {revealedCount} / {cards.length}
                </span>
              </>
            )
          )}
        </p>

        {cardsInteractive && state.cards.some((card) => card === "hidden") && (
          <button type="button" className={`${styles.closeButton} ${styles.revealAllButton}`} onClick={revealAll}>
            Tout retourner
          </button>
        )}

        {phase === "completed" && !showcaseActive && (
          <>
            <p className={styles.inspectHint}>
              {coarsePointer ? "Touche ou reste appuyé sur une carte pour voir sa fiche" : "Clique sur une carte pour voir sa fiche"}
            </p>
            <button ref={closeButtonRef} type="button" className={styles.closeButton} onClick={handleClose}>
              {closeLabel}
            </button>
          </>
        )}
      </div>

      <div className={styles.grain} aria-hidden />

      {detailCardId && <CardDetailModal cardId={detailCardId} onClose={() => setDetailCardId(null)} />}
    </div>,
    document.body,
  );
}
