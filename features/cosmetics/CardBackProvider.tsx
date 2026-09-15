"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { CARD_BACKS, DEFAULT_CARD_BACK_ID, cardBackSrc } from "@/game";

/**
 * Dos de carte équipé — diffusé à tout ce qui affiche une carte face cachée.
 *
 * L'autorité reste la base (`player_cosmetics.equipped`) : c'est elle qui
 * suit le joueur d'un appareil à l'autre. Mais le dos apparaît dès la
 * première image d'une partie, sur des écrans qui ne lisent pas tous la
 * session ; monter une requête dans la mise en page racine la rendrait
 * dynamique pour tout le site. D'où ce relais : le choix est MIROITÉ dans
 * `localStorage` au moment où le joueur l'équipe, et relu à l'hydratation.
 *
 * Conséquence assumée : sur un appareil neuf, la première partie s'ouvre
 * avec le dos par défaut jusqu'au premier passage par le profil — qui, lui,
 * lit la base et réaligne le miroir. Un dos différent pendant une partie
 * n'a aucune incidence sur les règles.
 */
const STORAGE_KEY = "tidebound.cardBack";

interface CardBackContextValue {
  id: string;
  /**
   * Applique un dos DÉJÀ accepté par le serveur : met l'affichage à jour
   * sans rechargement et réaligne le miroir local. N'écrit jamais en base —
   * c'est la Server Action `equipCardBack` qui le fait.
   */
  apply: (id: string) => void;
}

const CardBackContext = createContext<CardBackContextValue>({ id: DEFAULT_CARD_BACK_ID, apply: () => {} });

/** Lit le miroir local. Ne lève jamais : `localStorage` peut être refusé. */
export function readStoredCardBack(): string {
  if (typeof window === "undefined") return DEFAULT_CARD_BACK_ID;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return CARD_BACKS.some((back) => back.id === stored) ? (stored as string) : DEFAULT_CARD_BACK_ID;
  } catch {
    return DEFAULT_CARD_BACK_ID;
  }
}

/** Écrit le miroir local, après un équipement accepté par le serveur. */
export function storeCardBack(id: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* Navigation privée, stockage plein : le serveur garde la vérité. */
  }
}

export function CardBackProvider({ children }: { children: React.ReactNode }) {
  // Premier rendu identique au serveur (pas de lecture de `localStorage`
  // pendant l'hydratation), puis réalignement immédiat en effet.
  const [id, setId] = useState(DEFAULT_CARD_BACK_ID);

  useEffect(() => setId(readStoredCardBack()), []);

  const apply = useCallback((next: string) => {
    storeCardBack(next);
    setId(next);
  }, []);

  const value = useMemo(() => ({ id, apply }), [id, apply]);

  return <CardBackContext.Provider value={value}>{children}</CardBackContext.Provider>;
}

/** Identifiant du dos équipé, et de quoi en changer une fois le serveur d'accord. */
export function useCardBack(): CardBackContextValue {
  return useContext(CardBackContext);
}

/** Chemin de l'image du dos équipé — ce que consomment les `<img>`. */
export function useCardBackSrc(): string {
  return cardBackSrc(useContext(CardBackContext).id);
}
