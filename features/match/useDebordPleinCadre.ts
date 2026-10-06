"use client";

import { useEffect, useState } from "react";

/**
 * Un débord Abyssal est-il un CALQUE PLEIN CADRE ?
 *
 * Deux sortes de débords ont été livrées :
 *  - la SILHOUETTE (presque carrée, 768 × 768, 640 × 768…) : le sujet
 *    détouré, qu'on pose dans sa zone au-dessus du nom ;
 *  - le CALQUE peint sur le même canevas que l'illustration (portrait 2:3,
 *    Eidolon Opalin LVX — Abyssale) : le sujet y est déjà à sa place. Rangé
 *    dans la zone d'une silhouette, il rétrécissait et glissait de côté ; il
 *    se pose donc exactement comme l'illustration, par-dessus le liseré.
 *
 * On tranche sur le ratio de l'image (hauteur / largeur au-delà de 1,35),
 * lu une fois par URL pour toute l'app. `null` tant qu'il n'est pas connu :
 * le débord attend plutôt que de s'afficher au mauvais endroit.
 */
const RATIO_CALQUE = 1.35;
const known = new Map<string, boolean>();

export function useDebordPleinCadre(url: string | null): boolean | null {
  const [plein, setPlein] = useState<boolean | null>(() => (url ? (known.get(url) ?? null) : null));
  useEffect(() => {
    if (!url) {
      setPlein(null);
      return;
    }
    const cached = known.get(url);
    if (cached !== undefined) {
      setPlein(cached);
      return;
    }
    setPlein(null);
    let alive = true;
    const img = new window.Image();
    img.onload = () => {
      const value = img.naturalWidth > 0 && img.naturalHeight / img.naturalWidth > RATIO_CALQUE;
      known.set(url, value);
      if (alive) setPlein(value);
    };
    img.src = url;
    return () => {
      alive = false;
    };
  }, [url]);
  return plein;
}
