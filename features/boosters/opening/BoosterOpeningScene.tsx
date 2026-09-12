"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import styles from "@/features/boosters/opening/BoosterOpening.module.css";
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
import { BoosterCards } from "@/features/boosters/opening/BoosterCards";
import { BoosterPack } from "@/features/boosters/opening/BoosterPack";
import { BoosterParticles } from "@/features/boosters/opening/BoosterParticles";
import { packVisualVariables, type BoosterPackVisual } from "@/features/boosters/opening/boosterPackVisuals";
import type { BoosterOpeningCard } from "@/features/boosters/opening/types";

interface BoosterOpeningSceneProps {
  /** Contenu à révéler. Pour l'instant toujours factice (`getMockBoosterCards`). */
  cards: readonly BoosterOpeningCard[];
  /** Sachet mis en scène et son calage (`getBoosterPackVisual`). */
  visual: BoosterPackVisual;
  onClose: () => void;
}

const PACK_VISIBLE_PHASES: readonly BoosterOpeningPhase[] = ["enter", "opening", "cardsSpawning"];
const CARDS_VISIBLE_PHASES: readonly BoosterOpeningPhase[] = ["cardsSpawning", "cardsReady", "revealing", "completed"];

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
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
    "--t-ui": `${timings.uiIn}ms`,
    "--t-scene-out": `${timings.sceneOut}ms`,
  };
  return vars as CSSProperties;
}

/**
 * Scène plein écran d'ouverture de booster — PROTOTYPE VISUEL.
 *
 * Ce composant ne connaît ni Supabase, ni la collection, ni l'inventaire :
 * il reçoit une liste de cartes et la met en scène. Il n'écrit rien, nulle
 * part. Le brancher sur la vraie ouverture consistera à lui passer le
 * résultat serveur à la place des cartes factices (cf. `BoostersScreen`).
 *
 * Répartition des rôles :
 *   - `boosterOpeningMachine` : ce qui a le droit de se passer (pur)
 *   - ce composant            : QUAND ça se passe (minuteries, sons, focus)
 *   - `BoosterOpening.module.css` : COMMENT ça bouge (transform/opacity)
 */
export function BoosterOpeningScene({ cards, visual, onClose }: BoosterOpeningSceneProps) {
  const [reducedMotion] = useState(prefersReducedMotion);
  const timings = reducedMotion ? BOOSTER_OPENING_TIMINGS_REDUCED : BOOSTER_OPENING_TIMINGS;

  const [state, dispatch] = useReducer(boosterOpeningReducer, cards.length, createBoosterOpeningState);
  const [assets, setAssets] = useState<BoosterOpeningAssetStatus | null>(null);
  const [closing, setClosing] = useState(false);
  const [abyssalImpactKey, setAbyssalImpactKey] = useState(0);

  const schedule = useSceneTimers();
  const rootRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const revealRequested = useRef(new Set<number>());
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const { phase } = state;

  // --- Préchargement, puis entrée du paquet. -------------------------------
  useEffect(() => {
    let cancelled = false;
    void preloadBoosterOpeningAssets(visual).then((status) => {
      if (cancelled) return;
      setAssets(status);
      dispatch({ type: "assetsReady" });
      playBoosterEnterSound();
      schedule(() => dispatch({ type: "packSettled" }), timings.packEnter + timings.packHold);
    });
    return () => {
      cancelled = true;
    };
  }, [schedule, timings, visual]);

  // --- Enchaînement automatique des phases non interactives. ---------------
  useEffect(() => {
    if (phase === "opening") {
      schedule(playPackTearSound, tearStartAt(timings));
      schedule(playPackOpenSound, tearSnapAt(timings));
      schedule(() => dispatch({ type: "packTorn" }), tearSnapAt(timings) + timings.spawnAfterSnap);
    } else if (phase === "cardsSpawning") {
      for (let index = 0; index < cards.length; index += 1) {
        schedule(playCardSpawnSound, index * timings.cardStagger);
      }
      schedule(() => dispatch({ type: "cardsPlaced" }), cardsSettledAt(timings, cards.length));
    } else if (phase === "completed") {
      schedule(() => closeButtonRef.current?.focus({ preventScroll: true }), timings.uiIn);
    }
  }, [phase, cards.length, schedule, timings]);

  // --- Révélation d'une carte. ---------------------------------------------
  const handleReveal = useCallback(
    (index: number) => {
      const card = cards[index];
      if (!card || revealRequested.current.has(index) || !isCardInteractive(stateRef.current, index)) return;
      revealRequested.current.add(index);

      const pause = timings.revealPause[card.rarity];
      dispatch({ type: "revealRequested", index, withPause: pause > 0 });

      schedule(() => {
        if (pause > 0) dispatch({ type: "flipStarted", index });
        playCardFlipSound();
      }, pause);

      schedule(() => {
        dispatch({ type: "cardRevealed", index });
        if (card.rarity === "rare") playRareRevealSound();
        if (card.rarity === "abyssal") {
          playAbyssalRevealSound();
          setAbyssalImpactKey((key) => key + 1);
        }
      }, pause + timings.flip[card.rarity]);
    },
    [cards, schedule, timings],
  );

  // --- Fermeture : aucune sauvegarde, on rend simplement la main. ---------
  const handleClose = useCallback(() => {
    if (stateRef.current.phase !== "completed") return;
    setClosing(true);
    schedule(() => onCloseRef.current(), timings.sceneOut);
  }, [schedule, timings]);

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") handleClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [handleClose]);

  // Focus déplacé dans la scène le temps de l'ouverture, rendu à l'appelant ensuite.
  // Capturé à l'initialisation (et non dans l'effet) pour survivre au double montage du mode strict.
  const [returnFocusTo] = useState(() => document.activeElement as HTMLElement | null);
  useEffect(() => {
    rootRef.current?.focus({ preventScroll: true });
    return () => returnFocusTo?.focus?.({ preventScroll: true });
  }, [returnFocusTo]);

  const sceneStyle = useMemo(
    () => ({ ...timingVariables(timings, cards.length), ...packVisualVariables(visual) }),
    [timings, cards.length, visual],
  );

  const revealedCount = state.cards.filter((card) => card === "revealed").length;
  const showPack = PACK_VISIBLE_PHASES.includes(phase);
  const showCards = assets !== null && CARDS_VISIBLE_PHASES.includes(phase);
  const cardsInteractive = phase === "cardsReady" || phase === "revealing";

  return createPortal(
    <div
      ref={rootRef}
      className={styles.scene}
      style={sceneStyle}
      data-phase={phase}
      data-closing={closing || undefined}
      data-reduced-motion={reducedMotion || undefined}
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

      <div className={styles.stage}>
        {showCards && (
          <BoosterCards
            cards={cards}
            states={state.cards}
            interactive={cardsInteractive}
            cardBackAvailable={assets.cardBackAvailable}
            timings={timings}
            onReveal={handleReveal}
          />
        )}

        {showPack && (
          <BoosterPack visual={visual} torn={phase !== "enter"} retreating={phase === "cardsSpawning"} />
        )}

        {abyssalImpactKey > 0 && <div key={abyssalImpactKey} className={styles.abyssalImpact} aria-hidden />}

        <p className={styles.hint} data-visible={cardsInteractive || undefined} aria-live="polite">
          {showCards && phase !== "cardsSpawning" && (
            <>
              Retournez chaque carte
              <span className={styles.hintCount}>
                {revealedCount} / {cards.length}
              </span>
            </>
          )}
        </p>

        {phase === "completed" && (
          <button ref={closeButtonRef} type="button" className={styles.closeButton} onClick={handleClose}>
            Fermer
          </button>
        )}
      </div>

      <div className={styles.grain} aria-hidden />
    </div>,
    document.body,
  );
}
