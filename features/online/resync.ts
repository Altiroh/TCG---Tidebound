import { useEffect, useRef } from "react";

/**
 * RESYNCHRONISATION D'UNE PARTIE EN LIGNE — rattraper ce que Realtime n'a
 * pas livré.
 *
 * Realtime ne rejoue rien : un `UPDATE` de `matches` émis pendant que le
 * canal était coupé est perdu. Or iOS suspend l'onglet (et sa socket) dès
 * que l'app passe en arrière-plan, et un téléphone perd le réseau au gré du
 * métro. Au retour, la table affichait l'état d'avant jusqu'au prochain coup
 * de l'adversaire — parfois jamais, si c'était à nous de jouer.
 *
 * On redemande donc la vue au serveur à chaque occasion de décrochage :
 * retour au premier plan, retour du réseau, canal Realtime rétabli après une
 * erreur ou une fermeture. Ces signaux arrivent souvent en rafale (`online`
 * puis `visibilitychange` puis `SUBSCRIBED`) : le planificateur les fond en
 * un appel immédiat, plus au plus un appel de rattrapage en fin de fenêtre.
 */

/** Fenêtre dans laquelle plusieurs demandes ne donnent lieu qu'à un appel (plus un rattrapage). */
export const RESYNC_WINDOW_MS = 1500;

export interface ResyncScheduler {
  /** Demande une resynchronisation : immédiate, ou reportée à la fin de la fenêtre en cours. */
  request(): void;
  /** Annule le rattrapage éventuellement programmé (démontage). */
  dispose(): void;
}

interface SchedulerDeps {
  now?: () => number;
  setTimer?: (callback: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

/**
 * Anti-rebond « premier appel tout de suite, un seul rattrapage ensuite » :
 * la première demande part sans attendre (le joueur revient, il veut voir la
 * table à jour) ; celles qui suivent dans la fenêtre sont fondues en UN
 * appel à la fin de celle-ci — une demande tardive (le canal qui se rétablit
 * après le `visibilitychange`) peut signaler un état plus récent que la
 * première réponse, on ne la jette donc pas.
 */
export function createResyncScheduler(
  run: () => void,
  windowMs: number = RESYNC_WINDOW_MS,
  deps: SchedulerDeps = {}
): ResyncScheduler {
  const now = deps.now ?? (() => Date.now());
  const setTimer = deps.setTimer ?? ((callback: () => void, ms: number) => setTimeout(callback, ms));
  const clearTimer = deps.clearTimer ?? ((handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>));

  let lastRunAt = -Infinity;
  let trailing: unknown = null;
  let disposed = false;

  function fire() {
    trailing = null;
    if (disposed) return;
    lastRunAt = now();
    run();
  }

  return {
    request() {
      if (disposed || trailing !== null) return;
      const elapsed = now() - lastRunAt;
      if (elapsed >= windowMs) fire();
      else trailing = setTimer(fire, windowMs - elapsed);
    },
    dispose() {
      disposed = true;
      if (trailing !== null) clearTimer(trailing);
      trailing = null;
    },
  };
}

/** Statuts du canal Realtime qui signalent une rupture : le prochain `SUBSCRIBED` est un rétablissement. */
const BROKEN_CHANNEL_STATUSES = new Set(["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"]);

/**
 * Suit le statut d'un canal : renvoie `true` quand un `SUBSCRIBED` suit une
 * rupture (erreur, délai dépassé, fermeture). Le tout premier `SUBSCRIBED`
 * ne compte pas : la vue initiale vient du serveur, rien n'a été manqué.
 */
export function createChannelRecoveryTracker() {
  let broken = false;
  return (status: string): boolean => {
    if (BROKEN_CHANNEL_STATUSES.has(status)) {
      broken = true;
      return false;
    }
    if (status === "SUBSCRIBED" && broken) {
      broken = false;
      return true;
    }
    return false;
  };
}

/**
 * Branche le planificateur sur le retour au premier plan et le retour du
 * réseau. Renvoie la fonction `request` (stable) pour les autres signaux —
 * le canal Realtime rétabli, notamment.
 */
export function useResyncOnReturn(onResync: () => void, enabled = true): () => void {
  const callback = useRef(onResync);
  callback.current = onResync;

  const scheduler = useRef<ResyncScheduler | null>(null);
  const request = useRef(() => scheduler.current?.request());

  useEffect(() => {
    if (!enabled) return;
    const current = createResyncScheduler(() => callback.current());
    scheduler.current = current;

    const onVisibility = () => {
      if (document.visibilityState === "visible") current.request();
    };
    const onOnline = () => current.request();
    // `pageshow` persistant : page restaurée depuis le cache avant/arrière
    // de Safari, sans `visibilitychange` fiable.
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) current.request();
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("pageshow", onPageShow);
      current.dispose();
      if (scheduler.current === current) scheduler.current = null;
    };
  }, [enabled]);

  return request.current;
}
