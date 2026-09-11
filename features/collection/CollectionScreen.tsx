"use client";

import Image from "next/image";
import Link from "next/link";
import { FrameTopNav } from "@/components/layout/FrameTopNav";
import { CardCollectionPanel, NAUTICAL_CONTROL_CLASS, NAUTICAL_LABEL_CLASS } from "@/features/collection/CardCollectionPanel";

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
          width: "min(96vw, 1700px, calc(92vh * 1641 / 958))",
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

        {isSignedIn ? (
          <div className="absolute left-[6%] right-[6%] top-[15%] bottom-[13%]">
            <CardCollectionPanel ownedCardIds={ownedCardIds} mode="browse" />
          </div>
        ) : (
          <div className="absolute left-[6%] right-[6%] top-[23%] bottom-[13%] flex items-center justify-center">
            <div className="flex flex-col items-center gap-[1.2cqw] text-center" style={{ fontSize: "1.05cqw" }}>
              <p className={`text-[1.3em] ${NAUTICAL_LABEL_CLASS}`}>Connecte-toi pour voir ta collection</p>
              <div className="flex gap-[1cqw]">
                <Link
                  href="/connexion"
                  className="rounded-md bg-board-accent px-[1.4em] py-[0.7em] font-semibold text-slate-950 transition-opacity hover:opacity-90"
                >
                  Se connecter
                </Link>
                <Link
                  href="/inscription"
                  className={`rounded-md border px-[1.4em] py-[0.7em] font-semibold transition-colors hover:bg-slate-800/80 ${NAUTICAL_CONTROL_CLASS}`}
                >
                  Créer un compte
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
