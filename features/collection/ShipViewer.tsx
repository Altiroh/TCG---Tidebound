import type { ShipDefinition } from "@/game";

/** Fiche en lecture seule d'un Navire (composant serveur, pas d'interaction). */
export function ShipViewer({ ship }: { ship: ShipDefinition }) {
  return (
    <div className="rounded-md border border-slate-800 bg-board-surface p-4">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-lg font-semibold">{ship.name}</h2>
        <span className="text-xs text-slate-500">{ship.slotCount} emplacements</span>
      </div>
      {ship.text && <p className="mb-3 text-sm text-slate-400">{ship.text}</p>}
      <div className="mb-3 flex gap-4 text-sm">
        <span className="text-sky-300">Ancrage : {ship.startingAnchor}</span>
        <span className="text-violet-300">Raison : {ship.reasonMax}</span>
      </div>
      <dl className="space-y-1.5 text-sm">
        {ship.passiveText && (
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Passif</dt>
            <dd className="text-slate-300">{ship.passiveText}</dd>
          </div>
        )}
        {ship.capacityText && (
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Capacité</dt>
            <dd className="text-slate-300">{ship.capacityText}</dd>
          </div>
        )}
        {ship.weaknessText && (
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Faiblesse</dt>
            <dd className="text-slate-300">{ship.weaknessText}</dd>
          </div>
        )}
      </dl>
    </div>
  );
}
