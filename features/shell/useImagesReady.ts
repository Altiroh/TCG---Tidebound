"use client";

import { useEffect, useState } from "react";
import { waitForImages } from "@/features/shell/pageReady";

/**
 * `true` quand ces images sont décodées (ou au plus tard après `maxMs`).
 *
 * Sert aux éléments qui ARRIVENT en douceur (piles de decks, boîte du deck
 * choisi, fiche) : tant que la réponse est `false`, leur animation d'entrée
 * reste en pause sur sa première image — invisibles, mais à leur place, sans
 * saut de mise en page — puis ils se posent d'un bloc, illustration comprise.
 *
 * La réponse repasse à `false` dès que la liste change (autre onglet, autre
 * deck), dans le MÊME rendu : l'élément neuf ne se montre jamais avant son
 * image. Une liste déjà décodée répond presque aussitôt (cache de
 * `pageReady`).
 */
export function useImagesReady(urls: readonly (string | null | undefined)[], maxMs = 600): boolean {
  const key = urls.filter(Boolean).join("\n");
  const [readyKey, setReadyKey] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void waitForImages(key ? key.split("\n") : [], maxMs).then(() => {
      if (alive) setReadyKey(key);
    });
    return () => {
      alive = false;
    };
  }, [key, maxMs]);

  return readyKey === key;
}
