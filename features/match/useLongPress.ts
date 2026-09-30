"use client";

import { useEffect, useRef } from "react";
import type { PointerEvent as ReactPointerEvent, MouseEvent as ReactMouseEvent, TouchEvent as ReactTouchEvent } from "react";

/** Durée d'appui qui ouvre la fiche, au doigt. */
export const LONG_PRESS_MS = 450;
/** Au-delà de ce déplacement, le doigt fait défiler : ce n'est plus un appui long. */
const LONG_PRESS_SLOP_PX = 10;

/**
 * APPUI LONG = CLIC DROIT, AU DOIGT.
 *
 * La fiche détaillée d'une carte s'ouvre au clic droit (`contextmenu`). Or
 * Safari iOS n'émet jamais `contextmenu` : sur iPhone, la fiche était tout
 * simplement inaccessible. Ce crochet ajoute un appui long (≈ 450 ms, doigt
 * immobile à 10 px près) qui ouvre la même chose, et garde le clic droit
 * pour la souris.
 *
 * Deux pièges tenus ici plutôt que chez chaque appelant :
 * - le relâcher qui suit un appui long produirait un `click` — sur la carte
 *   (qui se sélectionnerait) ou sur la fiche fraîchement ouverte (qui se
 *   refermerait aussitôt). `touchend` est donc annulé, et `consumeClick()`
 *   dit à l'appelant d'ignorer un `click` résiduel ;
 * - Chrome Android émet AUSSI `contextmenu` à l'appui long : la fiche ne
 *   doit pas s'ouvrir deux fois.
 */
export function useLongPress<T>(onLongPress: ((item: T) => void) | undefined) {
  const press = useRef<{ timer: ReturnType<typeof setTimeout>; x: number; y: number } | null>(null);
  const fired = useRef(false);

  function cancel() {
    if (press.current) clearTimeout(press.current.timer);
    press.current = null;
  }

  useEffect(() => cancel, []);

  function bind(item: T) {
    if (!onLongPress) return {};
    return {
      onPointerDown: (event: ReactPointerEvent) => {
        // Chaque nouveau geste repart de zéro — y compris quand iOS n'a pas
        // émis de `click` après l'appui long précédent.
        fired.current = false;
        cancel();
        if (event.pointerType !== "touch") return;
        press.current = {
          x: event.clientX,
          y: event.clientY,
          timer: setTimeout(() => {
            press.current = null;
            fired.current = true;
            onLongPress(item);
          }, LONG_PRESS_MS),
        };
      },
      onPointerMove: (event: ReactPointerEvent) => {
        const state = press.current;
        if (!state) return;
        if (Math.hypot(event.clientX - state.x, event.clientY - state.y) > LONG_PRESS_SLOP_PX) cancel();
      },
      onPointerUp: cancel,
      onPointerCancel: cancel,
      onPointerLeave: cancel,
      onTouchEnd: (event: ReactTouchEvent) => {
        // Pas de `click` synthétique après un appui long.
        if (fired.current && event.cancelable) event.preventDefault();
      },
      onContextMenu: (event: ReactMouseEvent) => {
        event.preventDefault();
        cancel();
        if (fired.current) return;
        fired.current = true;
        onLongPress(item);
      },
    };
  }

  /** Vrai si le `click` qui arrive clôt un appui long : l'appelant l'ignore. */
  function consumeClick(): boolean {
    if (!fired.current) return false;
    fired.current = false;
    return true;
  }

  return { bind, consumeClick };
}
