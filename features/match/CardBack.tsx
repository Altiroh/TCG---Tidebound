"use client";

import { useImageLoadStatus } from "@/features/match/useImageLoadStatus";

/**
 * Contrairement aux faces (composées carte par carte par `CardTile`), le
 * dos est strictement identique pour toutes les cartes — un seul fichier,
 * réutilisé partout où une carte doit s'afficher face cachée (main
 * adverse, plus tard pile de pioche/défausse fermées si besoin).
 */
export const CARD_BACK_SRC = "/assets/cards/card-back.png";

/**
 * Une carte face cachée : dos uniquement, jamais cliquable (on ne peut pas
 * cibler ce qu'on ne peut pas identifier). Retombe sur un repli neutre
 * tant que `CARD_BACK_SRC` n'existe pas.
 */
export function CardBack({ widthClassName = "w-28" }: { widthClassName?: string }) {
  const status = useImageLoadStatus(CARD_BACK_SRC);

  return (
    <div
      aria-hidden
      className={`${widthClassName} aspect-[5/7] overflow-hidden rounded-md border border-slate-700 bg-board-surface`}
    >
      {status === "ok" ? (
        // eslint-disable-next-line @next/next/no-img-element -- asset local unique, pas de variation par carte
        <img src={CARD_BACK_SRC} alt="" draggable={false} className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-board-surface to-board-background">
          <span className="text-[10px] uppercase tracking-widest text-slate-600">Tidebound</span>
        </div>
      )}
    </div>
  );
}
