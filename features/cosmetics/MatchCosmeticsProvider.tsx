"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { DEFAULT_CARD_BACK_ID, cardBackSrc, type PlayerId } from "@/game";
import { useCardBackSrc } from "@/features/cosmetics/CardBackProvider";
import { useShipFrameGeometry } from "@/features/cosmetics/ShipFrameProvider";
import { DEFAULT_SHIP_FRAME, shipFrame, type ShipFrameGeometry } from "@/features/ships/shipFrame";

/**
 * Cosmétiques VISIBLES de chaque camp pendant une partie : le dos de ses
 * cartes et le cadre de son Navire.
 *
 * `CardBackProvider` et `ShipFrameProvider` ne connaissent que le joueur de
 * cet appareil. Le plateau, lui, dessine DEUX camps — et l'adversaire n'a
 * aucune raison d'arborer le dos et le cadre que J'AI équipés. D'où ce
 * relais : le conteneur de partie annonce ce que chaque identifiant de
 * joueur porte, et les composants demandent le dos ou le cadre POUR un
 * propriétaire donné.
 *
 * Règle de résolution (`useCardBackSrcFor`, `useShipFrameGeometryFor`) :
 *   - pas de contexte (écrans hors partie, laboratoire de plateau, ouverture
 *     de booster), ou propriétaire inconnu, ou propriétaire = le joueur de
 *     cet appareil → les fournisseurs locaux, comme avant. Le miroir
 *     `localStorage` reste ainsi la référence immédiate pour SOI : un dos
 *     équipé à l'instant s'affiche sans attendre le serveur ;
 *   - un autre joueur → ce que le conteneur a annoncé pour lui, sinon les
 *     cosmétiques d'origine. Le bot n'a rien équipé : il joue avec ceux-là.
 */
export interface PlayerCosmetics {
  cardBackId: string;
  shipFrameId: string;
}

export const DEFAULT_PLAYER_COSMETICS: PlayerCosmetics = {
  cardBackId: DEFAULT_CARD_BACK_ID,
  shipFrameId: DEFAULT_SHIP_FRAME,
};

interface MatchCosmeticsContextValue {
  /** Le joueur de cet appareil : ses cosmétiques viennent des fournisseurs locaux. */
  viewerId: PlayerId;
  /** Ce que portent les AUTRES joueurs, par identifiant de joueur de la partie. */
  byPlayer: Readonly<Record<PlayerId, PlayerCosmetics>>;
}

const MatchCosmeticsContext = createContext<MatchCosmeticsContextValue | null>(null);

interface MatchCosmeticsProviderProps {
  viewerId: PlayerId;
  byPlayer: Readonly<Record<PlayerId, PlayerCosmetics>>;
  children: ReactNode;
}

export function MatchCosmeticsProvider({ viewerId, byPlayer, children }: MatchCosmeticsProviderProps) {
  const value = useMemo(() => ({ viewerId, byPlayer }), [viewerId, byPlayer]);
  return <MatchCosmeticsContext.Provider value={value}>{children}</MatchCosmeticsContext.Provider>;
}

/** `null` quand `ownerId` est le joueur de cet appareil, ou qu'aucun conteneur de partie ne renseigne les camps. */
function cosmeticsOf(ownerId: PlayerId | undefined, context: MatchCosmeticsContextValue | null): PlayerCosmetics | null {
  if (!context || ownerId === undefined || ownerId === context.viewerId) return null;
  return context.byPlayer[ownerId] ?? DEFAULT_PLAYER_COSMETICS;
}

/** Chemin de l'image du dos de carte que porte `ownerId` — le sien pour le joueur local, celui annoncé pour l'adversaire. */
export function useCardBackSrcFor(ownerId: PlayerId | undefined): string {
  const other = cosmeticsOf(ownerId, useContext(MatchCosmeticsContext));
  const own = useCardBackSrc();
  return other ? cardBackSrc(other.cardBackId) : own;
}

/** Géométrie du cadre de Navire que porte `ownerId` — le sien pour le joueur local, celui annoncé pour l'adversaire. */
export function useShipFrameGeometryFor(ownerId: PlayerId | undefined): ShipFrameGeometry {
  const other = cosmeticsOf(ownerId, useContext(MatchCosmeticsContext));
  const own = useShipFrameGeometry();
  return other ? shipFrame(other.shipFrameId) : own;
}
