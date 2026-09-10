"use client";

import { useEffect } from "react";

/**
 * Enregistre le service worker de l'app shell (`public/sw.js`) côté client.
 * Ne bloque jamais le rendu : silencieux si l'API est indisponible
 * (navigateur trop ancien, contexte non sécurisé en dev sur certains hosts).
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Volontairement silencieux : l'app doit rester pleinement utilisable
      // sans service worker (dev, navigateurs non supportés, etc.).
    });
  }, []);

  return null;
}
