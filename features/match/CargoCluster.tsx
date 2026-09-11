import { CARD_BACK_SRC } from "@/features/match/CardBack";

interface CargoClusterProps {
  deckCount: number;
  graveyardCount: number;
  /** Zone crâne active comme cible de glisser-déposer pour Saborder (mon propre plateau uniquement — cf. MatchBoard/OnlineBoard). */
  graveyardDropZone?: {
    isOver: boolean;
    onDragOver: (e: React.DragEvent) => void;
    onDragLeave: (e: React.DragEvent) => void;
    onDrop: (e: React.DragEvent) => void;
  };
  /** Ouvre la vue de consultation du cimetière (`GraveyardViewer`) au clic sur la zone crâne. */
  onOpenGraveyard?: () => void;
  width?: number;
}

/** Effectif révélé uniquement au survol de SA PROPRE zone (pioche OU cimetière, indépendamment l'une de l'autre) — toujours visible sur tactile, faute de survol fiable là-bas. */
const COUNT_BADGE_CLASSES =
  "pointer-events-none absolute rounded-full bg-black/70 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-white opacity-0 transition-opacity duration-150 [@media(hover:none)]:opacity-100";

/**
 * Cadre "pioche/cimetière" (trident/crâne) rogné depuis `board.jpg`, avec
 * le dos de carte standard (`CARD_BACK_SRC`, même asset que la main
 * adverse) superposé sur l'emplacement pioche — plus parlant que la seule
 * icône de trident peinte dans l'image. Chaque effectif (pioche/cimetière)
 * ne se révèle qu'au survol de SA PROPRE moitié, indépendamment de
 * l'autre (groupes Tailwind nommés `deck`/`grave`). Le côté crâne sert
 * aussi de cible de glisser-déposer pour Saborder quand `graveyardDropZone`
 * est fourni.
 */
export function CargoCluster({ deckCount, graveyardCount, graveyardDropZone, onOpenGraveyard, width = 100 }: CargoClusterProps) {
  return (
    <div className="relative shrink-0" style={{ width }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- élément décoratif de mise en page fixe */}
      <img
        src="/assets/board/cargo-frame.png"
        alt=""
        aria-hidden
        draggable={false}
        className="w-full select-none"
        style={{ aspectRatio: "240 / 180" }}
      />

      {/* Moitié pioche */}
      <div className="group/deck absolute inset-y-0 left-0" style={{ width: "50%" }} title="Cartes restantes dans la pioche">
        <div className="absolute overflow-hidden rounded" style={{ left: "10%", top: "6%", width: "80%", height: "88%" }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- dos de carte standard, pas de variation possible */}
          <img src={CARD_BACK_SRC} alt="" aria-hidden draggable={false} className="h-full w-full select-none object-cover" />
        </div>
        <span
          className={`${COUNT_BADGE_CLASSES} group-hover/deck:opacity-100`}
          style={{ left: "46%", top: "80%", transform: "translate(-50%,-50%)" }}
        >
          {deckCount}
        </span>
      </div>

      {/* Moitié cimetière */}
      {graveyardDropZone ? (
        <div
          onDragOver={graveyardDropZone.onDragOver}
          onDragLeave={graveyardDropZone.onDragLeave}
          onDrop={graveyardDropZone.onDrop}
          onClick={onOpenGraveyard}
          title={onOpenGraveyard ? "Glissez une unité ici pour la Saborder, ou cliquez pour consulter le cimetière" : "Glissez une unité ici pour la Saborder"}
          className={`group/grave absolute inset-y-0 right-0 rounded-md transition-colors ${onOpenGraveyard ? "cursor-pointer" : ""} ${
            graveyardDropZone.isOver ? "bg-rose-500/25 ring-2 ring-rose-500" : ""
          }`}
          style={{ width: "50%" }}
        >
          <span
            className={`${COUNT_BADGE_CLASSES} group-hover/grave:opacity-100`}
            style={{ left: "50%", top: "80%", transform: "translate(-50%,-50%)" }}
          >
            {graveyardCount}
          </span>
        </div>
      ) : (
        <div
          onClick={onOpenGraveyard}
          title="Cartes au cimetière — cliquez pour consulter"
          className={`group/grave absolute inset-y-0 right-0 ${onOpenGraveyard ? "cursor-pointer" : ""}`}
          style={{ width: "50%" }}
        >
          <span
            className={`${COUNT_BADGE_CLASSES} group-hover/grave:opacity-100`}
            style={{ left: "50%", top: "80%", transform: "translate(-50%,-50%)" }}
          >
            {graveyardCount}
          </span>
        </div>
      )}
    </div>
  );
}
