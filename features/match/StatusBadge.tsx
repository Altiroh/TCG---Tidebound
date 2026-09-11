"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";

interface StatusBadgeProps {
  icon: string;
  label: string;
  description: string;
  /** Taille en pixels réels (PAS en `cqw`) — ce badge flotte désormais au-dessus de la carte, en dehors du conteneur à requête de conteneur (`container-type: inline-size`) de `CardTile` : un `cqw` y résoudrait à 0. Une taille fixe garantit aussi qu'il reste "assez gros pour le voir à l'œil nu" même sur les plus petites cartes de plateau. Défaut : 30. */
  size?: number;
  /** Texte superposé au centre de l'icône (ex: nombre de tours restants pour le badge "Durée"). */
  overlayText?: string;
  /**
   * Couleur du texte superposé — `effect_tour.png` a un médaillon clair
   * (contrairement aux autres icônes) : du blanc avec un simple halo flou
   * (`THICK_TEXT_OUTLINE`) s'y fond et devient illisible. Défaut : foncé
   * avec un léger halo clair, lisible sur n'importe quel fond.
   */
  overlayTextClassName?: string;
}

/**
 * Icône de statut/mot-clé posée sur une carte (`effect_malade.png`,
 * `effect_garde.png`, `effect_immobilise.png`, `effect_silence.png`,
 * `effect_tour.png`, `effect_engourdi.png` — `public/assets/`), avec une
 * info-bulle explicative au survol/focus (agrandissement léger de l'icône
 * elle-même en prime, pour que l'interaction soit évidente). La bulle est
 * rendue via un portail (`createPortal` dans `document.body`) plutôt qu'en
 * `position: absolute` classique : le conteneur de carte (`CardTile`) est
 * `overflow-hidden` pour clipper le cadre/l'illustration, ce qui rognerait
 * sinon toute bulle essayant de s'ouvrir au-dessus de la carte. Position
 * calculée depuis `getBoundingClientRect()` de l'icône, toujours ouverte
 * vers le HAUT.
 */
export function StatusBadge({
  icon,
  label,
  description,
  size = 30,
  overlayText,
  overlayTextClassName = "text-slate-900",
}: StatusBadgeProps) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ left: number; top: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  function show() {
    const rect = ref.current?.getBoundingClientRect();
    if (rect) setCoords({ left: rect.left + rect.width / 2, top: rect.top });
    setOpen(true);
  }
  function hide() {
    setOpen(false);
  }

  return (
    <>
      {/* `div` plutôt que `button` : ce badge se pose à l'intérieur du `<button>` racine de `CardTile`, et un
          bouton imbriqué dans un bouton est invalide en HTML (focus/clic imprévisibles) — `tabIndex` suffit à
          garder le survol/focus clavier pour l'info-bulle, purement informative (pas d'action au clic). */}
      <div
        ref={ref}
        tabIndex={0}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        aria-label={label}
        className="pointer-events-auto relative block shrink-0 rounded-full transition-transform duration-150 ease-out hover:z-10 hover:scale-125"
        style={{ width: size, height: size }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- icône de statut, taille fixe (pixels réels, pas cqw) */}
        <img
          src={icon}
          alt=""
          draggable={false}
          className="h-full w-full select-none rounded-full object-cover shadow-[0_2px_8px_rgba(0,0,0,0.75)]"
        />
        {overlayText !== undefined && (
          <span
            className={`absolute inset-0 flex items-center justify-center text-sm font-bold ${overlayTextClassName}`}
            style={{ textShadow: "0 0 3px rgba(255,255,255,0.9), 0 0 2px rgba(255,255,255,0.9)" }}
          >
            {overlayText}
          </span>
        )}
      </div>
      {open &&
        coords &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="pointer-events-none fixed z-[100] w-48 -translate-x-1/2 -translate-y-full rounded-md border border-white/15 bg-black/95 p-2 text-left normal-case shadow-lg"
            style={{ left: coords.left, top: coords.top - 8 }}
          >
            <p className="text-xs font-semibold text-white">{label}</p>
            <p className="mt-1 text-[11px] leading-snug text-slate-300">{description}</p>
          </div>,
          document.body
        )}
    </>
  );
}
