"use client";

import Image from "next/image";
import { CORE_SET } from "@/game";
import { FrameTopNav } from "@/components/layout/FrameTopNav";
import { CardCollectionPanel } from "@/features/collection/CardCollectionPanel";

/** Catalogue complet — utilisé quand personne n'est connecté : pas encore de compte, mais on doit quand même pouvoir feuilleter toutes les cartes ("pour l'instant"). */
const ALL_CARD_IDS = CORE_SET.map((def) => def.id);

const BACKGROUND_SRC = "/assets/collection/background.png";
/** Dimensions réelles de `background.png` — verrouille le ratio du cadre, cf. `TideboundMenuChest` pour le même principe (une image de cadre entier, des contrôles positionnés en % par-dessus). */
const BACKGROUND_ASPECT = "1641 / 958";

interface CollectionScreenProps {
  isSignedIn: boolean;
  /** Cartes possédées par le joueur connecté (`player_cards.card_id`, quantité > 0) — la grille n'affiche que celles-ci. Ignoré si `isSignedIn` est `false`. */
  ownedCardIds: string[];
}

/**
 * Écran plein cadre de la Collection, calé sur `background.png` (fourni par
 * l'utilisateur comme gabarit du cadre — barre du haut, panneau parchemin,
 * barre du bas) : tous les contrôles sont positionnés en % par-dessus cette
 * image, jamais en dur en pixels, pour rester alignés quelle que soit la
 * taille réelle de rendu (même principe que `TideboundMenuChest`/`rect`).
 * Le panneau parchemin central (`CardCollectionPanel`, partagé avec
 * l'éditeur de deck) est le seul élément scrollable — pas de pagination,
 * cf. demande explicite ("le containeur du milieu sera scrollable").
 */
export function CollectionScreen({ isSignedIn, ownedCardIds }: CollectionScreenProps) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#050b16] p-2">
      <div
        className="relative w-full"
        style={{
          aspectRatio: BACKGROUND_ASPECT,
          width: "min(99vw, calc(97vh * 1641 / 958))",
          containerType: "inline-size",
        }}
      >
        <Image
          src={BACKGROUND_SRC}
          alt=""
          fill
          priority
          sizes="96vw"
          draggable={false}
          className="pointer-events-none select-none object-contain"
        />

        <FrameTopNav active="collection" />

        {/* Sans compte, on peut quand même feuilleter tout le catalogue pour l'instant — seul un compte connecté restreint la grille aux cartes réellement possédées. */}
        <div className="absolute left-[6%] right-[6%] top-[15%] bottom-[13%]">
          <CardCollectionPanel ownedCardIds={isSignedIn ? ownedCardIds : ALL_CARD_IDS} mode="browse" />
        </div>
      </div>
    </div>
  );
}
