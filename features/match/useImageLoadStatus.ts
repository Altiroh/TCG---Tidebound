"use client";

import { useEffect, useState } from "react";

/**
 * Précharge une image hors du DOM plutôt que de dépendre de l'événement
 * `onError` d'un `<img>` rendu — plus fiable quand beaucoup d'images se
 * chargent en même temps (ex: la page Collection, 80 requêtes
 * simultanées), où `onError` s'est révélé peu fiable dans les tests.
 * Utilisé par `CardTile` (une image par carte) et `CardBack` (une seule
 * image, réutilisée pour toutes les cartes face cachée).
 */
/** `src` vide : aucun asset à tenter (ex: calque optionnel absent pour cette carte) — retombe direct sur "error", sans requête. */
export function useImageLoadStatus(src: string): "loading" | "ok" | "error" {
  const [status, setStatus] = useState<"loading" | "ok" | "error">(src ? "loading" : "error");

  useEffect(() => {
    if (!src) {
      setStatus("error");
      return undefined;
    }
    let cancelled = false;
    setStatus("loading");
    const img = new window.Image();
    img.onload = () => {
      if (!cancelled) setStatus("ok");
    };
    img.onerror = () => {
      if (!cancelled) setStatus("error");
    };
    img.src = src;
    return () => {
      cancelled = true;
    };
  }, [src]);

  return status;
}
