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
 * les effectifs superposés en petit badge sur chaque carte — positions
 * mesurées sur l'image source (cf. commit history). Le côté crâne sert
 * aussi de cible de glisser-déposer pour Saborder quand `graveyardDropZone`
 * est fourni.
 */
export function CargoCluster({ deckCount, graveyardCount, graveyardDropZone }: CargoClusterProps) {
  return (
    <div className="relative shrink-0" style={{ width: 100 }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- élément décoratif de mise en page fixe */}
      <img
        src="/assets/board/cargo-frame.png"
        alt=""
        aria-hidden
        draggable={false}
        className="w-full select-none"
        style={{ aspectRatio: "240 / 180" }}
      />
      <span
        className="absolute rounded-full bg-black/70 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-white"
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
            className="absolute rounded-full bg-black/70 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-white"
            style={{ left: "43%", top: "80%", transform: "translate(-50%,-50%)" }}
            title="Cartes au cimetière"
          >
            {graveyardCount}
          </span>
        </div>
      ) : (
        <span
          className="absolute rounded-full bg-black/70 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-white"
          style={{ left: "77%", top: "80%", transform: "translate(-50%,-50%)" }}
          title="Cartes au cimetière"
        >
          {graveyardCount}
        </span>
      )}
    </div>
  );
}
