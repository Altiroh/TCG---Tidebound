const GAUGE_ASSETS = {
  anchor: "/assets/ships/gauge-anchor.png",
  reason: "/assets/ships/gauge-reason.png",
} as const;

interface ResourceGaugeProps {
  type: keyof typeof GAUGE_ASSETS;
  value: number;
  max: number;
  size?: number;
}

/**
 * Médaillon circulaire "Cadre Navire" (`public/assets/ships/README.md`,
 * bordure laiton + disque rouge/bleu plein — Ancrage/Raison). L'asset
 * fourni est peint plein, sans variante "vide" : la jauge est donc simulée
 * par un wipe radial sombre (`conic-gradient`) qui recouvre progressivement
 * le disque à mesure que la ressource baisse, plutôt que de révéler un fond
 * différent. Départage à midi, sens horaire — convention classique de
 * jauge circulaire ("pie timer").
 */
export function ResourceGauge({ type, value, max, size = 56 }: ResourceGaugeProps) {
  const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  const depletedAngle = (1 - pct) * 360;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- médaillon décoratif, taille fixe, jamais responsive */}
      <img src={GAUGE_ASSETS[type]} alt="" aria-hidden draggable={false} className="absolute inset-0 h-full w-full select-none object-contain" />
      <div
        aria-hidden
        className="pointer-events-none absolute rounded-full transition-[background] duration-300 ease-out"
        style={{
          inset: "10%",
          background: `conic-gradient(rgba(4,8,16,0.82) ${depletedAngle}deg, transparent ${depletedAngle}deg)`,
        }}
      />
      <span className="absolute inset-0 flex items-center justify-center text-[13px] font-bold tabular-nums text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.95)]">
        {value}
      </span>
    </div>
  );
}
