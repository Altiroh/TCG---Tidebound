"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { DEFAULT_SHIP_FRAME, shipFrame, type ShipFrameGeometry } from "@/features/ships/shipFrame";

/**
 * Cadre de Navire équipé — diffusé à tout ce qui dessine un Navire.
 *
 * Même relais que `CardBackProvider`, et pour la même raison : l'autorité
 * reste la base (`player_cosmetics.equipped`, famille `shipSkin`), mais le
 * cadre apparaît dès la première image d'une partie, sur des écrans qui ne
 * lisent pas tous la session. Monter une requête dans la mise en page
 * racine la rendrait dynamique pour tout le site. Le choix est donc
 * MIROITÉ dans `localStorage` au moment où le joueur l'équipe, et relu à
 * l'hydratation.
 *
 * Conséquence assumée, identique aux dos : sur un appareil neuf, la
 * première partie s'ouvre avec le cadre d'origine jusqu'au premier passage
 * par Collectables — qui, lui, lit la base et réaligne le miroir. Un cadre
 * différent pendant une partie n'a aucune incidence sur les règles.
 */
const STORAGE_KEY = "tidebound.shipFrame";

interface ShipFrameContextValue {
  id: string;
  /** Applique un cadre DÉJÀ accepté par le serveur. N'écrit jamais en base. */
  apply: (id: string) => void;
}

const ShipFrameContext = createContext<ShipFrameContextValue>({ id: DEFAULT_SHIP_FRAME, apply: () => {} });

/** Lit le miroir local. Ne lève jamais : `localStorage` peut être refusé. */
export function readStoredShipFrame(): string {
  if (typeof window === "undefined") return DEFAULT_SHIP_FRAME;
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? DEFAULT_SHIP_FRAME;
  } catch {
    return DEFAULT_SHIP_FRAME;
  }
}

/** Écrit le miroir local, après un équipement accepté par le serveur. */
export function storeShipFrame(id: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* Navigation privée, stockage plein : le serveur garde la vérité. */
  }
}

export function ShipFrameProvider({ children }: { children: React.ReactNode }) {
  // Premier rendu identique au serveur, puis réalignement immédiat en effet.
  const [id, setId] = useState(DEFAULT_SHIP_FRAME);

  useEffect(() => setId(readStoredShipFrame()), []);

  const apply = useCallback((next: string) => {
    storeShipFrame(next);
    setId(next);
  }, []);

  const value = useMemo(() => ({ id, apply }), [id, apply]);

  return <ShipFrameContext.Provider value={value}>{children}</ShipFrameContext.Provider>;
}

/** Identifiant du cadre équipé, et de quoi en changer une fois le serveur d'accord. */
export function useShipFrame(): ShipFrameContextValue {
  return useContext(ShipFrameContext);
}

/**
 * Géométrie du cadre équipé — ce que consomment les composants qui
 * dessinent un Navire. Un identifiant inconnu retombe sur le cadre
 * d'origine (`shipFrame`).
 */
export function useShipFrameGeometry(): ShipFrameGeometry {
  return shipFrame(useContext(ShipFrameContext).id);
}
