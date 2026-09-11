const SEGMENT_COUNT = 24;

/** Bleu → vert en approchant `min`, vert plein entre `min` et `max`, rouge au-delà. */
function gaugeColor(count: number, min: number, max: number): string {
  if (count > max) return "#f87171";
  if (count >= min) return "#34d399";
  const ratio = Math.min(1, count / min);
  const hue = 210 - ratio * 70; // 210 (bleu) → 140 (vert)
  return `hsl(${hue}, 70%, 60%)`;
}

interface DeckCapacityGaugeProps {
  count: number;
  min: number;
  max: number;
}

/** Jauge segmentée façon égaliseur — remplissage et couleur progressifs selon la taille du deck par rapport aux règles (`RULES.DECK_SIZE_MIN`/`MAX`). */
export function DeckCapacityGauge({ count, min, max }: DeckCapacityGaugeProps) {
  const color = gaugeColor(count, min, max);
  const filledSegments = Math.min(SEGMENT_COUNT, Math.round((count / max) * SEGMENT_COUNT));
  const isValid = count >= min && count <= max;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex h-full items-center gap-[2px] rounded-md border border-amber-600/50 bg-slate-950/80 px-2 py-2">
        {Array.from({ length: SEGMENT_COUNT }).map((_, i) => (
          <span
            key={i}
            className="flex-1 rounded-sm transition-colors duration-200"
            style={{
              height: "100%",
              backgroundColor: i < filledSegments ? color : "rgba(255,255,255,0.08)",
              boxShadow: i < filledSegments ? `0 0 6px ${color}80` : undefined,
            }}
          />
        ))}
      </div>
      <div className="flex items-center justify-between text-[0.85em] text-amber-200/80">
        <span>
          {count} / {max}
        </span>
        <span className={isValid ? "text-emerald-300" : "text-amber-200/60"}>
          {isValid ? "Jouable" : `Min. ${min}`}
        </span>
      </div>
    </div>
  );
}
