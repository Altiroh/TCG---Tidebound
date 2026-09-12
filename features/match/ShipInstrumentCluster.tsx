import { ResourceGauge } from "@/features/match/ResourceGauge";

interface ShipInstrumentClusterProps {
  anchor: number;
  anchorMax: number;
  reason: number;
  reasonMax: number;
  /** Nom de fichier dans `public/assets/ships/illu/` (`ShipDefinition.illustration`) — silhouette neutre si absent. */
  illustration?: string;
  width?: number;
}

/** Ratio réel de `ship-frame-empty.png` (512×640) — dérive la hauteur du cadre à partir de `width`. */
const FRAME_ASPECT = 512 / 640;

/**
 * Zones mesurées en scannant la transparence des pixels de
 * `ship-frame-empty.png` : la fenêtre en arche (illustration du Navire)
 * s'ouvre entre ~16 %/74 % de hauteur et ~5,5 %/94,5 % de largeur. La
 * plaque en bois, elle, vit vers ~73 % de hauteur — au lieu d'un nom de
 * joueur (réservé à `VictoryScreen`), elle porte ici les deux médaillons
 * Ancrage/Raison côte à côte, à la même hauteur que les anciens médaillons
 * peints sur `arch-frame.png`.
 */
const ILLUSTRATION_ZONE = { top: "16%", left: "5.5%", width: "89%", height: "58%" };
const GAUGES_TOP = "74%";

/**
 * Cadre Navire vertical (`ship-frame-empty.png`, bois vieilli + laiton,
 * cordages, médaillon-compas — cf. `public/assets/ships/README.md`) avec
 * l'illustration du Navire du joueur dans la fenêtre en arche. Remplace
 * l'ancien `arch-frame.png` (arche horizontale rognée depuis `board.jpg`) :
 * même budget de hauteur qu'avant (`width` par défaut choisi pour que
 * `width / FRAME_ASPECT` retombe sur les ~215px déjà occupés dans
 * `MatchBoard`/`OnlineBoard`), donc aucun autre élément du plateau n'a
 * besoin d'être redéplacé.
 */
export function ShipInstrumentCluster({ anchor, anchorMax, reason, reasonMax, illustration, width = 172 }: ShipInstrumentClusterProps) {
  const height = width / FRAME_ASPECT;
  const gaugeSize = width * 0.3;

  return (
    <div className="relative shrink-0" style={{ width, height }}>
      <div className="absolute overflow-hidden rounded-t-full" style={ILLUSTRATION_ZONE}>
        {illustration && (
          // eslint-disable-next-line @next/next/no-img-element -- asset local, une par Navire
          <img
            src={`/assets/ships/illu/${illustration}`}
            alt=""
            draggable={false}
            className="h-full w-full select-none object-cover"
          />
        )}
      </div>

      {/* eslint-disable-next-line @next/next/no-img-element -- élément décoratif de mise en page fixe */}
      <img
        src="/assets/ships/ship-frame-empty.png"
        alt=""
        aria-hidden
        draggable={false}
        className="pointer-events-none absolute inset-0 h-full w-full select-none"
      />

      <div
        className="absolute flex items-center"
        style={{ top: GAUGES_TOP, left: "50%", gap: width * 0.1, transform: "translate(-50%, -50%)" }}
      >
        <ResourceGauge type="anchor" value={anchor} max={anchorMax} size={gaugeSize} />
        <ResourceGauge type="reason" value={reason} max={reasonMax} size={gaugeSize} />
      </div>
    </div>
  );
}
