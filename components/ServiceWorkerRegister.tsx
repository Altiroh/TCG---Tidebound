"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import styles from "@/components/AppUpdatePrompt.module.css";

/** Toutes les 30 min tant que l'app est ouverte : une session longue finit par voir la nouvelle version. */
const UPDATE_POLL_MS = 30 * 60 * 1000;

/**
 * Enregistre le service worker de l'app shell (`public/sw.js`) et surveille
 * les mises à jour de l'application.
 *
 * Pourquoi un bandeau plutôt qu'un rechargement d'office : installée sur
 * l'écran d'accueil (iOS/Android), l'app n'est jamais « rechargée » par le
 * joueur — elle peut rester des jours sur la même version. Mais recharger
 * sans prévenir couperait une partie en cours. Le worker en attente
 * (`public/sw.js` n'appelle plus `skipWaiting` à l'installation) est donc
 * signalé, et c'est le joueur qui choisit le moment.
 *
 * Ne bloque jamais le rendu : silencieux si l'API est indisponible
 * (navigateur trop ancien, contexte non sécurisé en dev sur certains hosts).
 */
export function ServiceWorkerRegister() {
  const [updateReady, setUpdateReady] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const waitingRef = useRef<ServiceWorker | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    let cancelled = false;
    let poll: number | undefined;
    let cleanupVisibility: (() => void) | undefined;

    /** Un worker en attente = une version prête à prendre la main. */
    const trackWaiting = (registration: ServiceWorkerRegistration) => {
      const waiting = registration.waiting;
      // `navigator.serviceWorker.controller` absent : c'est la PREMIÈRE
      // installation, pas une mise à jour — rien à proposer au joueur.
      if (!waiting || !navigator.serviceWorker.controller || cancelled) return;
      waitingRef.current = waiting;
      setUpdateReady(true);
    };

    navigator.serviceWorker
      // `updateViaCache: "none"` : le script du worker lui-même ne doit
      // jamais être servi depuis le cache HTTP, sinon une nouvelle version
      // peut rester invisible pendant 24 h.
      .register("/sw.js", { updateViaCache: "none" })
      .then((registration) => {
        if (cancelled) return;
        trackWaiting(registration);

        registration.addEventListener("updatefound", () => {
          const installing = registration.installing;
          if (!installing) return;
          installing.addEventListener("statechange", () => {
            if (installing.state === "installed") trackWaiting(registration);
          });
        });

        // Une app installée reste ouverte longtemps : on va chercher la
        // mise à jour au retour au premier plan et à intervalle régulier.
        const check = () => {
          if (document.visibilityState === "visible") registration.update().catch(() => undefined);
        };
        document.addEventListener("visibilitychange", check);
        poll = window.setInterval(check, UPDATE_POLL_MS);
        cleanupVisibility = () => document.removeEventListener("visibilitychange", check);
      })
      .catch(() => {
        // Volontairement silencieux : l'app doit rester pleinement utilisable
        // sans service worker (dev, navigateurs non supportés, etc.).
      });

    return () => {
      cancelled = true;
      cleanupVisibility?.();
      if (poll !== undefined) window.clearInterval(poll);
    };
  }, []);

  const reload = useCallback(() => {
    const waiting = waitingRef.current;
    if (!waiting) {
      window.location.reload();
      return;
    }
    // La page se recharge quand le nouveau worker prend la main — une seule
    // fois, sinon un `controllerchange` tardif relancerait la boucle.
    let reloaded = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    });
    waiting.postMessage({ type: "SKIP_WAITING" });
  }, []);

  if (!updateReady || dismissed) return null;

  return (
    <div className={styles.anchor} role="status" aria-live="polite">
      <div className={styles.card}>
        <p className={styles.text}>
          Une nouvelle version de Tidebound est prête.
          <span className={styles.hint}>Terminez votre partie : rien ne change avant votre rechargement.</span>
        </p>
        <button type="button" className={styles.reload} onClick={reload}>
          Recharger
        </button>
        <button type="button" className={styles.dismiss} onClick={() => setDismissed(true)} aria-label="Plus tard">
          ×
        </button>
      </div>
    </div>
  );
}
