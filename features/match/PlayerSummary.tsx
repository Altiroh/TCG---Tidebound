import { ResourceGauge } from "@/features/match/ResourceGauge";

interface PlayerSummaryProps {
  label: string;
  anchor: number;
  anchorMax: number;
  reason: number;
  reasonMax: number;
  handCount: number;
  highlighted?: boolean;
}

/** Bandeau de statut d'un joueur : Ancrage/Raison en jauges circulaires (médaillons "Cadre Navire"), partagé entre le plateau local et le plateau en ligne. */
export function PlayerSummary({ label, anchor, anchorMax, reason, reasonMax, handCount, highlighted }: PlayerSummaryProps) {
  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 rounded-md border px-4 py-2 text-sm ${
        highlighted ? "border-board-accent/50 bg-board-accent/5" : "border-slate-800 bg-board-surface"
      }`}
    >
      <span className="font-medium">{label}</span>
      <div className="flex items-center gap-4">
        <GaugeStat label="Ancrage" type="anchor" value={anchor} max={anchorMax} />
        <GaugeStat label="Raison" type="reason" value={reason} max={reasonMax} />
        <span className="text-xs text-slate-500">{handCount} carte(s) en main</span>
      </div>
    </div>
  );
}

function GaugeStat({ label, type, value, max }: { label: string; type: "anchor" | "reason"; value: number; max: number }) {
  return (
    <span className="flex items-center gap-1.5">
      <ResourceGauge type={type} value={value} max={max} size={40} />
      <span className="flex flex-col leading-tight">
        <span className="text-[10px] uppercase tracking-wide text-slate-500">{label}</span>
        <span className="text-xs tabular-nums text-slate-300">/{max}</span>
      </span>
    </span>
  );
}
