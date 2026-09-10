import { ResourceGauge } from "@/features/match/ResourceGauge";

interface ShipInstrumentClusterProps {
  anchor: number;
  anchorMax: number;
  reason: number;
  reasonMax: number;
}

/**
 * Reproduit la composition du board fourni par l'utilisateur : l'arche en
 * laiton (rognée depuis `board.jpg`, sans les médaillons — on superpose nos
 * propres assets `gauge-anchor.png`/`gauge-reason.png`, de meilleure
 * qualité que l'image aplatie) surmontant les jauges Ancrage/Raison.
 * Position mesurée sur l'image source (cf. commit history) : l'arche fait
 * 232×175px dans l'original, les médaillons se nichent juste sous son
 * bord inférieur.
 */
export function ShipInstrumentCluster({ anchor, anchorMax, reason, reasonMax }: ShipInstrumentClusterProps) {
  return (
    <div className="flex shrink-0 flex-col items-center" style={{ width: 92 }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- élément décoratif de mise en page fixe */}
      <img
        src="/assets/board/arch-frame.png"
        alt=""
        aria-hidden
        draggable={false}
        className="w-full select-none"
        style={{ aspectRatio: "232 / 175" }}
      />
      <div className="-mt-4 flex gap-1.5">
        <div className="flex flex-col items-center">
          <ResourceGauge type="anchor" value={anchor} max={anchorMax} size={38} />
          <span className="text-[9px] tabular-nums text-slate-400">/{anchorMax}</span>
        </div>
        <div className="flex flex-col items-center">
          <ResourceGauge type="reason" value={reason} max={reasonMax} size={38} />
          <span className="text-[9px] tabular-nums text-slate-400">/{reasonMax}</span>
        </div>
      </div>
    </div>
  );
}
