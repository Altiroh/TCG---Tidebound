import { getShipDefinition, type DeckList } from "@/game";
import { CARD_TYPE_LABELS } from "@/features/match/cardDisplay";
import { groupDeck } from "@/features/collection/groupDeck";

/** Aperçu en lecture seule d'un deck (composant serveur, pas d'interaction). */
export function DeckViewer({ deck }: { deck: DeckList }) {
  const ship = getShipDefinition(deck.shipId);
  const entries = groupDeck(deck);

  return (
    <div className="rounded-md border border-slate-800 bg-board-surface p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-lg font-semibold">{deck.name}</h2>
        <span className="text-xs text-slate-500">
          Navire : {ship.name} — {deck.cardIds.length} cartes
        </span>
      </div>
      <ul className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
        {entries.map(({ def, count }) => (
          <li key={def.id} className="flex items-center justify-between gap-2 border-b border-slate-800/60 py-1">
            <span className="truncate">
              <span className="mr-2 tabular-nums text-slate-500">{count}×</span>
              {def.name}
            </span>
            <span className="shrink-0 text-xs text-slate-500">
              {CARD_TYPE_LABELS[def.type]} · {def.cost}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
