import { ResourceGauge } from "@/features/match/ResourceGauge";

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

/** Ratio réel de `ship-frame-empty.webp` (512×640) — dérive la hauteur du cadre à partir de `width`. */
const FRAME_ASPECT = 512 / 640;

/**
 * Fenêtre en arche de `ship-frame-empty.webp`, mesurée par remplissage de la
 * zone transparente (alpha ≤ 40) depuis son centre : ~13,1 %/76,3 % de
 * hauteur, ~14,8 %/84,8 % de largeur. L'ancienne zone (16 %/74 %, arrondi
 * `rounded-t-full`) laissait voir le fond en haut de l'arche et en bas.
 * La zone déborde de 1 % de chaque côté (anneau vérifié 100 % opaque :
 * le bois du cadre recouvre ce débord) et `ILLUSTRATION_CLIP` suit le
 * contour réel, en coordonnées relatives à la zone. La plaque en bois vers
 * ~74 % porte les deux médaillons Ancrage/Raison (le nom de joueur est
 * réservé à `VictoryScreen`).
 */
const ILLUSTRATION_ZONE = { top: "12.19%", left: "13.87%", width: "71.88%", height: "65%" };
const ILLUSTRATION_CLIP =
  "polygon(39.4% 0%, 22.6% 7.5%, 13.9% 13.7%, 8.4% 19.7%, 4.6% 25.7%, 1.9% 31.7%, 0.3% 38%, 0% 44%, 0% 86.5%, 1.4% 92.5%, 7.3% 100%, 92.9% 100%, 98.9% 92.5%, 100% 86.5%, 100% 44%, 99.5% 38%, 97.8% 31.7%, 95.4% 25.7%, 91.6% 19.7%, 85.9% 13.7%, 77.2% 7.5%, 60.6% 0%)";
const GAUGES_TOP = "74%";

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
            src={`/assets/ships/illu/${illustration}`}
            alt=""
            draggable={false}
            className="h-full w-full select-none object-cover"
          />
        )}
      </div>

      {/* eslint-disable-next-line @next/next/no-img-element -- élément décoratif de mise en page fixe */}
      <img
        src="/assets/ships/ship-frame-empty.webp"
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
