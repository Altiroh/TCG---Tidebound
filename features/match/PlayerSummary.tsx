interface PlayerSummaryProps {
  label: string;
  handCount: number;
  highlighted?: boolean;
}

/**
 * Bandeau de nom d'un joueur, partagé entre le plateau local et le
 * plateau en ligne. L'Ancrage/la Raison ne s'y affichent plus : ils vivent
 * désormais dans `ShipInstrumentCluster` (médaillons superposés à l'arche
 * du board), pour coller à la composition fournie plutôt que de dupliquer
 * l'information dans une barre plate.
 */
export function PlayerSummary({ label, handCount, highlighted }: PlayerSummaryProps) {
  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 rounded-md border px-4 py-2 text-sm ${
        highlighted ? "border-board-accent/50 bg-board-accent/5" : "border-slate-800 bg-board-surface"
      }`}
    >
      <span className="font-medium">{label}</span>
      <span className="text-xs text-slate-500">{handCount} carte(s) en main</span>
    </div>
  );
}
