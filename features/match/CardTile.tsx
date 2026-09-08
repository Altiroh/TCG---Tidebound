import {
  computeEffectiveStats,
  getCardDefinition,
  UNIT_CARD_TYPES,
  type CardInstance,
  type TideStateName,
} from "@/game";
import { CARD_TYPE_LABELS } from "@/features/match/cardDisplay";

interface CardTileProps {
  instance: CardInstance;
  tideState: TideStateName;
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}

const TYPE_BADGE_CLASSES: Record<string, string> = {
  marin: "bg-sky-900 text-sky-200",
  creature: "bg-rose-900 text-rose-200",
  equipement: "bg-amber-900 text-amber-200",
  structure: "bg-emerald-900 text-emerald-200",
  objet: "bg-violet-900 text-violet-200",
  anomalie: "bg-fuchsia-950 text-fuchsia-200",
};

/** Une carte compacte : nom, coût, type, stats effectives. Composant "bête". */
export function CardTile({ instance, tideState, selected, disabled, onClick }: CardTileProps) {
  const def = getCardDefinition(instance.cardId);
  const stats = computeEffectiveStats(instance, tideState);
  const isUnit = (UNIT_CARD_TYPES as readonly string[]).includes(def.type);
  const hasResistance = isUnit || def.health !== undefined;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick || disabled}
      title={def.text}
      className={`flex w-28 flex-col gap-1 rounded-md border p-2 text-left text-xs transition-colors ${
        selected
          ? "border-board-accent bg-board-accent/10"
          : "border-slate-700 bg-board-surface hover:border-slate-500"
      } ${disabled ? "opacity-40" : ""} ${onClick ? "cursor-pointer" : "cursor-default"}`}
    >
      <div className="flex items-center justify-between gap-1">
        <span className={`rounded px-1 py-0.5 text-[10px] ${TYPE_BADGE_CLASSES[def.type] ?? "bg-slate-800"}`}>
          {CARD_TYPE_LABELS[def.type]}
        </span>
        <span className="rounded-full bg-slate-800 px-1.5 py-0.5 text-[10px] font-semibold text-board-accent">
          {def.cost}
        </span>
      </div>
      <span className="line-clamp-2 font-medium leading-tight text-slate-100">{def.name}</span>
      {stats.inactive && <span className="text-[10px] text-amber-400">Inactive</span>}
      {instance.summoningSick && isUnit && <span className="text-[10px] text-slate-500">Malade d&apos;invocation</span>}
      {instance.turnsRemaining !== undefined && (
        <span className="text-[10px] text-slate-500">Durée : {instance.turnsRemaining}</span>
      )}
      {(isUnit || hasResistance) && (
        <div className="mt-auto flex items-center gap-2 text-[11px] font-semibold">
          {isUnit && <span className="text-orange-300">⚔ {stats.attack}</span>}
          <span className="text-emerald-300">
            ♥ {Math.max(0, stats.health - instance.damageMarked)}/{stats.health}
          </span>
        </div>
      )}
    </button>
  );
}
