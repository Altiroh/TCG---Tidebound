import { ResourceGauge } from "@/features/match/ResourceGauge";

interface ShipInstrumentClusterProps {
  anchor: number;
  anchorMax: number;
  reason: number;
  reasonMax: number;
  width?: number;
}

/**
 * Reproduit la composition du board fourni par l'utilisateur : l'arche en
 * laiton (rognée depuis `board.jpg`, sans les médaillons — on superpose nos
 * propres assets `gauge-anchor.png`/`gauge-reason.png`, de meilleure
 * qualité que l'image aplatie) surmontant les jauges Ancrage/Raison.
 *
 * Position des jauges mesurée directement sur les pixels de `board.jpg`
 * (centres des médaillons rouge/bleu peints dans l'arche, avant recadrage) :
 * ~39% / ~91% de la largeur du cadre, ~77% de sa hauteur, diamètre ~28% de
 * cette largeur — un calcul proportionnel à `width` aurait dérivé au moindre
 * changement d'échelle.
 */
export function ShipInstrumentCluster({ anchor, anchorMax, reason, reasonMax, width = 230 }: ShipInstrumentClusterProps) {
  const gaugeSize = width * 0.28;

  return (
    <div className="relative shrink-0" style={{ width, aspectRatio: "230 / 215" }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- élément décoratif de mise en page fixe */}
      <img
        src="/assets/board/arch-frame.png"
        alt=""
        aria-hidden
        draggable={false}
        className="absolute left-1/2 top-0 w-full -translate-x-1/2 select-none"
        style={{ aspectRatio: "232 / 175" }}
      />
      <div
        className="absolute flex flex-col items-center"
        style={{ left: "39%", top: "77%", transform: "translate(-50%, -50%)" }}
      >
        <ResourceGauge type="anchor" value={anchor} max={anchorMax} size={gaugeSize} />
        <span className="text-[9px] tabular-nums text-slate-400">/{anchorMax}</span>
      </div>
      <div
        className="absolute flex flex-col items-center"
        style={{ left: "91%", top: "77%", transform: "translate(-50%, -50%)" }}
      >
        <ResourceGauge type="reason" value={reason} max={reasonMax} size={gaugeSize} />
        <span className="text-[9px] tabular-nums text-slate-400">/{reasonMax}</span>
      </div>
    </div>
  );
}
