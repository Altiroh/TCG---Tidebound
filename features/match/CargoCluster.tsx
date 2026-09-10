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
}

/**
 * Cadre "pioche/cimetière" (trident/crâne) rogné depuis `board.jpg`, avec
 * le dos de carte standard (`CARD_BACK_SRC`, même asset que la main
 * adverse) superposé sur l'emplacement pioche — plus parlant que la seule
 * icône de trident peinte dans l'image. Les effectifs (`.reveal-on-hover`,
 * `app/globals.css`) restent masqués tant qu'on ne survole pas le cluster
 * sur un pointeur fin (souris) et sont en permanence visibles sur
 * tactile, faute de survol fiable là-bas. Le côté crâne sert aussi de
 * cible de glisser-déposer pour Saborder quand `graveyardDropZone` est
 * fourni.
 */
export function CargoCluster({ deckCount, graveyardCount, graveyardDropZone }: CargoClusterProps) {
  return (
    <div className="group relative shrink-0" style={{ width: 100 }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- élément décoratif de mise en page fixe */}
      <img
        src="/assets/board/cargo-frame.png"
        alt=""
        aria-hidden
        draggable={false}
        className="w-full select-none"
        style={{ aspectRatio: "240 / 180" }}
      />
      <div className="absolute overflow-hidden rounded" style={{ left: "5%", top: "6%", width: "40%", height: "88%" }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- dos de carte standard, pas de variation possible */}
        <img src={CARD_BACK_SRC} alt="" aria-hidden draggable={false} className="h-full w-full select-none object-cover" />
      </div>
      <span
        className="reveal-on-hover absolute rounded-full bg-black/70 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-white"
        style={{ left: "23%", top: "80%", transform: "translate(-50%,-50%)" }}
        title="Cartes restantes dans la pioche"
      >
        {deckCount}
      </span>
      {graveyardDropZone ? (
        <div
          onDragOver={graveyardDropZone.onDragOver}
          onDragLeave={graveyardDropZone.onDragLeave}
          onDrop={graveyardDropZone.onDrop}
          title="Glissez une unité ici pour la Saborder"
          className={`absolute rounded-md transition-colors ${
            graveyardDropZone.isOver ? "bg-rose-500/25 ring-2 ring-rose-500" : ""
          }`}
          style={{ left: "54%", top: "0%", width: "46%", height: "100%" }}
        >
          <span
            className="reveal-on-hover absolute rounded-full bg-black/70 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-white"
            style={{ left: "43%", top: "80%", transform: "translate(-50%,-50%)" }}
            title="Cartes au cimetière"
          >
            {graveyardCount}
          </span>
        </div>
      ) : (
        <span
          className="reveal-on-hover absolute rounded-full bg-black/70 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-white"
          style={{ left: "77%", top: "80%", transform: "translate(-50%,-50%)" }}
          title="Cartes au cimetière"
        >
          {graveyardCount}
        </span>
      )}
    </div>
  );
}
