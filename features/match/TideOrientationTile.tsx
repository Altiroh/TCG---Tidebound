"use client";

import { useState } from "react";
import type { TideOrientation } from "@/game";

/**
 * Tuile plein cadre pour un sens de Marée donné, avec repli propre si
 * jamais l'asset venait à manquer : une image cassée resterait visible
 * sinon, `onError` bascule alors sur un repli textuel discret.
 */
function TideTileImage({ src, label, arrow, visible }: { src: string; label: string; arrow: string; visible: boolean }) {
  const [broken, setBroken] = useState(false);

  return (
    <div
      aria-hidden={!visible}
      className={`absolute inset-0 flex flex-col items-center justify-center gap-2 transition-all duration-700 ease-out ${
        visible ? "z-10 rotate-0 scale-100 opacity-100" : "pointer-events-none z-0 rotate-6 scale-90 opacity-0"
      }`}
    >
      {!broken ? (
        // eslint-disable-next-line @next/next/no-img-element -- tuile locale, jamais responsive au sens Next/Image
        <img
          src={src}
          alt=""
          draggable={false}
          onError={() => setBroken(true)}
          className="h-full w-full select-none object-contain"
        />
      ) : (
        <>
          <span className="text-4xl leading-none text-sky-200">{arrow}</span>
          <span className="text-sm font-semibold uppercase tracking-wide text-sky-200">{label}</span>
        </>
      )}
    </div>
  );
}

/**
 * Indicateur du sens de la Marée (Montante/Descendante) sous forme de
 * tuile image, avec un fondu/zoom animé au moment où `orientation`
 * change en cours de partie plutôt qu'un simple remplacement instantané.
 */
export function TideOrientationTile({ orientation }: { orientation: TideOrientation }) {
  return (
    <div className="relative h-full w-full overflow-hidden rounded-md bg-black/80">
      <TideTileImage src="/assets/m_montante.png" label="Marée Montante" arrow="▲" visible={orientation === "montante"} />
      <TideTileImage src="/assets/m_desc.png" label="Marée Descendante" arrow="▼" visible={orientation === "descendante"} />
    </div>
  );
}
