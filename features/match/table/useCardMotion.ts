"use client";

import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from "react";

/**
 * Mouvements de cartes du laboratoire — la carte se DÉPLACE à l'écran d'une
 * zone à l'autre au lieu d'apparaître / disparaître, comme sur l'ancien board
 * (`useCardFlights` + `CardFlightLayer`, `AttackImpactLayer`) :
 *
 *   - pioche → main          : un dos de carte vole de la pioche jusqu'à sa
 *                              place ; la vraie carte reste masquée jusqu'à
 *                              l'atterrissage (`hidden`) ;
 *   - main → plateau          : la VRAIE carte glisse depuis là où on l'a
 *                              lâchée jusqu'à son emplacement (FLIP) ;
 *   - plateau → défausse      : une copie de la carte vole jusqu'au crâne en
 *                              rétrécissant, le crâne pulse à l'arrivée ;
 *   - attaque                 : cf. `attackMotion.ts`.
 *
 * Tout est mesuré dans le DOM (`getBoundingClientRect`) : la grille du board
 * est fluide, aucune position n'est connue à l'avance. Les éléments sont
 * repérés par attributs : `data-card-id`, `data-deck`, `data-graveyard`,
 * `data-opp-hand-index`.
 */

/** Durée d'un vol — celle de l'ancien board (`FLIGHT_DURATION_MS`). */
export const FLIGHT_MS = 650;
/** Écart entre deux pioches d'un même lot (main de départ). */
export const DRAW_STAGGER_MS = 260;

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Flight {
  id: number;
  /**
   * `back` : dos de carte (pioche), celui de `ownerId` s'il est connu ;
   * `face` : copie figée de la carte (défausse) — elle a déjà quitté l'état
   * quand la copie vole.
   */
  look: { kind: "back"; ownerId?: string } | { kind: "face"; node: ReactNode };
  from: Box;
  to: Box;
  /**
   * `land` : la carte arrive pleine et opaque ; `vanish` : elle se fond dans
   * sa destination ; `shatter` : elle se BRISE sur place (carte détruite),
   * puis ses éclats filent jusqu'à la destination (`to`).
   */
  ending: "land" | "vanish" | "shatter" | "tuck";
  /** Attente avant le départ (pioches d'un même lot) : la carte reste invisible jusque-là. */
  delayMs?: number;
  /**
   * `tuck` seulement : place dans l'éventail, de −1 (à gauche) à 1 (à
   * droite). Les cartes remises sous la pioche se soulèvent en éventail
   * avant de repasser dessous.
   */
  fan?: number;
}

/** Durée d'une remise sous la pioche : soulèvement en éventail, puis glissé dessous. */
export const TUCK_MS = 950;

/** Durée d'un bris : fissures, éclatement, puis trajet des éclats jusqu'au Cimetière. */
export const SHATTER_MS = 1300;

export function flightDuration(flight: Pick<Flight, "ending">): number {
  return flight.ending === "shatter" ? SHATTER_MS : flight.ending === "tuck" ? TUCK_MS : FLIGHT_MS;
}

export function boxOf(el: Element | null): Box | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  // Largeur de MISE EN PAGE (hors rotation de l'éventail), centrée sur la boîte réelle.
  const width = el instanceof HTMLElement && el.offsetWidth ? el.offsetWidth : r.width;
  const height = el instanceof HTMLElement && el.offsetHeight ? el.offsetHeight : r.height;
  return { x: r.left + r.width / 2 - width / 2, y: r.top + r.height / 2 - height / 2, width, height };
}

export function reducedMotion(): boolean {
  return typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
}

/** Une mesure à faire APRÈS le prochain rendu (la carte n'existe pas encore dans sa zone d'arrivée). */
type AfterRender = () => boolean;

export function useCardMotion() {
  const [flights, setFlights] = useState<Flight[]>([]);
  /** Cartes présentes dans l'état mais pas encore arrivées (masquées). Clé libre : id de carte ou `opp-hand-<index>`. */
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const queue = useRef<AfterRender[]>([]);
  const nextId = useRef(0);

  // À chaque rendu : exécute les mesures en attente dont la cible est enfin dans le DOM.
  useLayoutEffect(() => {
    if (queue.current.length === 0) return;
    queue.current = queue.current.filter((job) => !job());
  });

  const hide = useCallback((key: string, on: boolean) => {
    setHidden((current) => {
      const next = new Set(current);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  }, []);

  const launch = useCallback((flight: Omit<Flight, "id">, onDone?: () => void) => {
    const id = nextId.current++;
    setFlights((current) => [...current, { ...flight, id }]);
    window.setTimeout(() => {
      setFlights((current) => current.filter((f) => f.id !== id));
      onDone?.();
    }, flightDuration(flight) + (flight.delayMs ?? 0));
  }, []);

  /** Pioche : à appeler JUSTE AVANT l'action qui ajoute la carte en main. */
  const flyDraw = useCallback(
    (deckSelector: string, targetSelector: string, hiddenKey: string) => {
      const from = boxOf(document.querySelector(deckSelector));
      if (!from || reducedMotion()) return;
      hide(hiddenKey, true);
      queue.current.push(() => {
        const to = boxOf(document.querySelector(targetSelector));
        if (!to) return false;
        launch({ look: { kind: "back" }, from, to, ending: "land" }, () => hide(hiddenKey, false));
        return true;
      });
    },
    [hide, launch]
  );

  /** Vers la défausse : à appeler JUSTE AVANT l'action qui retire la carte du plateau. */
  const flyToGraveyard = useCallback(
    (cardId: string, face: ReactNode, graveyardSelector: string) => {
      const from = boxOf(document.querySelector(`[data-card-id="${cardId}"]`));
      const graveyard = document.querySelector(graveyardSelector);
      const to = boxOf(graveyard);
      if (!from || !to || reducedMotion()) return;
      launch({ look: { kind: "face", node: face }, from, to, ending: "vanish" }, () => {
        graveyard?.animate(
          [{ filter: "brightness(1)" }, { filter: "brightness(1.9) drop-shadow(0 0 10px rgba(226,232,240,.8))" }, { filter: "brightness(1)" }],
          { duration: 360, easing: "ease-out" }
        );
      });
    },
    [launch]
  );

  /**
   * Pose (FLIP) : la vraie carte, une fois dans son emplacement, part de
   * `from` (là où on l'a lâchée) et glisse jusqu'à sa place. À appeler JUSTE
   * AVANT l'action qui la déplace.
   */
  const slideFrom = useCallback((cardId: string, from: Box | null) => {
    if (!from || reducedMotion()) return;
    queue.current.push(() => {
      const el = document.querySelector<HTMLElement>(`[data-card-id="${cardId}"]`);
      const to = boxOf(el);
      if (!el || !to) return false;
      const dx = from.x + from.width / 2 - (to.x + to.width / 2);
      const dy = from.y + from.height / 2 - (to.y + to.height / 2);
      const scale = from.width / to.width;
      el.animate(
        [
          { transform: `translate(${dx}px, ${dy}px) scale(${scale}) rotate(-2deg)`, filter: "drop-shadow(0 18px 22px rgba(0,0,0,.65))" },
          { offset: 0.8, transform: "translate(0, 0) scale(0.97) rotate(0deg)", filter: "drop-shadow(0 4px 6px rgba(0,0,0,.5))" },
          { transform: "none", filter: "none" },
        ],
        { duration: 380, easing: "cubic-bezier(.2,.8,.2,1)" }
      );
      return true;
    });
  }, []);

  return { flights, hidden, flyDraw, flyToGraveyard, slideFrom, launch, hide };
}
