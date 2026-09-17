import type { TideStateName } from "@/game";

/**
 * La mer de chaque état, telle qu'on la voit PAR LE HUBLOT — image carrée,
 * cadrée pour tenir dans un disque, et non le fond panoramique du plateau
 * (`BackgroundLayer`, `tide-states/*.webp`), qui est un autre cadrage.
 */
export const PORTHOLE_SEAS: Record<TideStateName, string> = {
  calme: "/assets/board/tide-portholes/calme.webp",
  houle: "/assets/board/tide-portholes/houle.webp",
  tempete: "/assets/board/tide-portholes/tempete.webp",
  abysses: "/assets/board/tide-portholes/abysses.webp",
};

/** Le cadre de cuivre commun au grand hublot et aux repères de la piste (`TideIndicator`). */
export const PORTHOLE_FRAME = "/assets/board/tide-porthole-frame.webp";

/*
 * Le grand hublot de la colonne des piles a été retiré le 2026-09-16 : les
 * hublots de la piste (`TideIndicator`) montrent déjà la mer de chaque
 * état, et celui du courant en grand. Ce module ne garde que les assets
 * partagés.
 */
