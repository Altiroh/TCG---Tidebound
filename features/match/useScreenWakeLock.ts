"use client";

import { useEffect } from "react";

/** Sous-ensemble de l'API Screen Wake Lock dont on se sert (types DOM absents de certaines versions de TS). */
interface WakeLockSentinelLike {
  released: boolean;
  release(): Promise<void>;
  addEventListener(type: "release", listener: () => void): void;
}
interface WakeLockLike {
  request(type: "screen"): Promise<WakeLockSentinelLike>;
}

/**
 * ÉCRAN ALLUMÉ PENDANT UNE PARTIE.
 *
 * Un joueur qui réfléchit à son coup — ou qui attend celui de l'adversaire —
 * ne touche pas l'écran : le téléphone se mettait en veille en pleine
 * partie. On demande donc un verrou d'éveil (`navigator.wakeLock`) tant que
 * la table est montée.
 *
 * Le navigateur relâche le verrou de lui-même dès que la page est cachée
 * (autre app, écran verrouillé) : on le redemande au retour visible. Au
 * démontage, on le relâche. Non supporté (iOS < 16.4, Firefox ancien),
 * refusé (économie d'énergie, iframe sans permission) : on n'insiste pas,
 * sans erreur ni message — c'est un confort, pas une condition de jeu.
 */
export function useScreenWakeLock(active = true): void {
  useEffect(() => {
    if (!active || typeof navigator === "undefined") return;
    const wakeLock = (navigator as Navigator & { wakeLock?: WakeLockLike }).wakeLock;
    if (!wakeLock) return;

    let sentinel: WakeLockSentinelLike | null = null;
    let requesting = false;
    let disposed = false;

    async function acquire() {
      if (disposed || requesting || document.visibilityState !== "visible") return;
      if (sentinel && !sentinel.released) return;
      requesting = true;
      try {
        const next = await wakeLock!.request("screen");
        if (disposed) {
          void next.release().catch(() => undefined);
          return;
        }
        sentinel = next;
        next.addEventListener("release", () => {
          if (sentinel === next) sentinel = null;
        });
      } catch {
        // Refusé ou indisponible : silencieux.
      } finally {
        requesting = false;
      }
    }

    const onVisibility = () => {
      if (document.visibilityState === "visible") void acquire();
    };

    void acquire();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onVisibility);
      const held = sentinel;
      sentinel = null;
      if (held && !held.released) void held.release().catch(() => undefined);
    };
  }, [active]);
}
