"use client";

import { useEffect, useState } from "react";
import { knownImageStatus, loadImageStatus, type ImageStatus } from "@/features/match/imageStatusCache";

/**
 * Précharge une image hors du DOM plutôt que de dépendre de l'événement
 * `onError` d'un `<img>` rendu — plus fiable quand beaucoup d'images se
 * chargent en même temps (ex: la page Collection, 80 requêtes
 * simultanées), où `onError` s'est révélé peu fiable dans les tests.
 * Utilisé par `CardBack` (une seule image, réutilisée pour toutes les
 * cartes face cachée). Même mémoire partagée que `useImageOk`.
 */
/** `src` vide : aucun asset à tenter (ex: calque optionnel absent pour cette carte) — retombe direct sur "error", sans requête. */
export function useImageLoadStatus(src: string): ImageStatus {
  const [status, setStatus] = useState<ImageStatus>(() => (src ? knownImageStatus(src) : "error"));

  useEffect(() => {
    if (!src) {
      setStatus("error");
      return undefined;
    }
    const known = knownImageStatus(src);
    if (known !== "loading") {
      setStatus(known);
      return undefined;
    }
    setStatus("loading");
    let cancelled = false;
    void loadImageStatus(src).then((next) => {
      if (!cancelled) setStatus(next);
    });
    return () => {
      cancelled = true;
    };
  }, [src]);

  return status;
}
