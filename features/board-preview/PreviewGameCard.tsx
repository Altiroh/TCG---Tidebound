"use client";

import type { TideStateName } from "@/game";
import { CardTile } from "@/features/match/CardTile";
import type { TableCardModel } from "@/features/board-preview/previewFixtures";

interface PreviewGameCardProps {
  card: TableCardModel;
  tideState: TideStateName;
  /** `false` en main : les badges de statut décrivent une carte EN JEU. */
  showStatusBadges?: boolean;
  /**
   * Taille des badges flottants, en px : `CardTile` ne la déduit pas de la
   * largeur de carte, il faut donc la proportionner au mode d'écran.
   */
  badgeSize?: number;
  /** Dégâts marqués : la Résistance affichée baisse, et `CardTile` joue son propre impact. */
  damage?: number;
  /** `"board"` sur un rang de plateau : la tuile simplifiée (`CardTile`). */
  variant?: "full" | "board";
}

/**
 * Vraie carte du jeu (`CardTile` : cadre, illustration, type, coût, règles,
 * stats), à la place des rectangles numérotés.
 *
 * Largeur `w-full` : c'est toujours l'emplacement qui fixe la taille (token
 * `--card-w` sur le plateau, `--hand-card-w` en main) ; `CardTile` compose
 * tout son contenu en `cqw`, donc il suit.
 *
 * L'instance est fabriquée ici, comme le fait `BoosterCard` : aucun état de
 * partie, aucune action — seulement la lecture du catalogue de cartes.
 */
export function PreviewGameCard({ card, tideState, showStatusBadges = true, badgeSize, damage = 0, variant }: PreviewGameCardProps) {
  return (
    <CardTile
      instance={{
        instanceId: card.id,
        cardId: card.cardId,
        ownerId: "preview",
        damageMarked: damage,
        modifiers: [],
        summoningSick: false,
        hasAttackedThisTurn: false,
        // Visuel fixe pour les cartes à plusieurs illustrations (Péon) — ignoré des autres.
        illustrationVariant: 1,
      }}
      tideState={tideState}
      widthClassName="w-full"
      scaleOnHover={false}
      showStatusBadges={showStatusBadges}
      badgeSize={badgeSize}
      variant={variant}
    />
  );
}
