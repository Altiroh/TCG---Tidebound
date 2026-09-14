import { ResourceGauge } from "@/features/match/ResourceGauge";
import {
  SHIP_FRAME_ASPECT,
  SHIP_FRAME_SRC,
  SHIP_ILLUSTRATION_CLIP,
  SHIP_ILLUSTRATION_ZONE,
  SHIP_PLATE_TOP,
  shipIllustrationUrl,
} from "@/features/ships/shipFrame";

interface ShipInstrumentClusterProps {
  anchor: number;
  anchorMax: number;
  reason: number;
  reasonMax: number;
  /** Nom de fichier dans `public/assets/ships/illu/` (`ShipDefinition.illustration`) — silhouette neutre si absent. */
  illustration?: string;
  width?: number;
  /** Dégâts d'Ancrage que la Déraison infligera à la fin du tour de ce joueur (`deraisonAnchorDamage`) — 0/absent hors Déraison. */
  deraisonDamage?: number;
}

/*
 * Géométrie du cadre (ratio, fenêtre en arche, contour, plaque) :
 * `features/ships/shipFrame.ts`, partagée avec `ShipPortrait` (menus).
 */
const FRAME_ASPECT = SHIP_FRAME_ASPECT;
const ILLUSTRATION_ZONE = SHIP_ILLUSTRATION_ZONE;
const ILLUSTRATION_CLIP = SHIP_ILLUSTRATION_CLIP;
const GAUGES_TOP = SHIP_PLATE_TOP;

/**
 * Cadre Navire vertical (`ship-frame-empty.webp`, bois vieilli + laiton,
 * cordages, médaillon-compas — cf. `public/assets/ships/README.md`) avec
 * l'illustration du Navire du joueur dans la fenêtre en arche. Remplace
 * l'ancien `arch-frame.webp` (arche horizontale rognée depuis `board.webp`) :
 * même budget de hauteur qu'avant (`width` par défaut choisi pour que
 * `width / FRAME_ASPECT` retombe sur les ~215px déjà occupés dans
 * `MatchBoard`/`OnlineBoard`), donc aucun autre élément du plateau n'a
 * besoin d'être redéplacé.
 */
export function ShipInstrumentCluster({ anchor, anchorMax, reason, reasonMax, illustration, width = 172, deraisonDamage = 0 }: ShipInstrumentClusterProps) {
  const height = width / FRAME_ASPECT;
  const gaugeSize = width * 0.3;

  return (
    <div className="relative shrink-0" style={{ width, height }}>
      <div className="absolute overflow-hidden" style={{ ...ILLUSTRATION_ZONE, clipPath: ILLUSTRATION_CLIP }}>
        {illustration && (
          // eslint-disable-next-line @next/next/no-img-element -- asset local, une par Navire
          <img
            src={shipIllustrationUrl(illustration)}
            alt=""
            draggable={false}
            className="h-full w-full select-none object-cover"
          />
        )}
      </div>

      {/* eslint-disable-next-line @next/next/no-img-element -- élément décoratif de mise en page fixe */}
      <img
        src={SHIP_FRAME_SRC}
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

      {/* Dette de Déraison : la conséquence à venir, lisible sans survol (Notion : "la dette doit être très visible sur le board"). */}
      {reason < 0 && (
        <div
          className="absolute left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-full bg-rose-600/80 px-2 py-0.5 text-[10px] font-semibold text-white shadow-[0_2px_10px_rgba(0,0,0,0.5)] backdrop-blur-sm"
          style={{ top: "90%" }}
          title="Déraison : si la Raison n'est pas remontée à 0 d'ici là, chaque point sous 0 inflige 1 dégât d'Ancrage à la fin du tour de ce joueur."
        >
          ⚓ −{deraisonDamage} en fin de tour
        </div>
      )}
    </div>
  );
}
