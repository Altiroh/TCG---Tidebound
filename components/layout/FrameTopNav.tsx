import Link from "next/link";
import { NAUTICAL_LABEL_CLASS } from "@/features/collection/CardCollectionPanel";

interface FrameTopNavProps {
  active: "collection" | "decks";
}

/** Barre "Retour / Collection / Decks" partagée par les 3 écrans calés sur un cadre plein écran (Collection, liste de decks, éditeur de deck) — même position/style partout, seul l'onglet actif change. */
export function FrameTopNav({ active }: FrameTopNavProps) {
  return (
    <div className="absolute left-[2%] top-[5.2%]">
      <div className="flex items-stretch gap-[0.9cqw]" style={{ fontSize: "0.95cqw" }}>
        <Link
          href="/"
          className={`flex items-center gap-[0.5cqw] rounded-md border border-amber-600/60 bg-slate-950/80 px-[1.2cqw] font-semibold transition-colors hover:bg-slate-800/80 ${NAUTICAL_LABEL_CLASS}`}
        >
          <svg viewBox="0 0 24 24" fill="none" className="h-[1.1em] w-[1.1em]">
            <path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Retour
        </Link>

        <div className="flex items-stretch overflow-hidden rounded-md border border-amber-600/60">
          {active === "collection" ? (
            <span
              className={`flex items-center bg-board-accent/90 px-[1.2cqw] font-semibold ${NAUTICAL_LABEL_CLASS}`}
              style={{ color: "#0b1220" }}
            >
              Collection
            </span>
          ) : (
            <Link
              href="/collection"
              className={`flex items-center bg-slate-950/80 px-[1.2cqw] font-semibold transition-colors hover:bg-slate-800/80 ${NAUTICAL_LABEL_CLASS}`}
            >
              Collection
            </Link>
          )}
          {active === "decks" ? (
            <span
              className={`flex items-center bg-board-accent/90 px-[1.2cqw] font-semibold ${NAUTICAL_LABEL_CLASS}`}
              style={{ color: "#0b1220" }}
            >
              Decks
            </span>
          ) : (
            <Link
              href="/decks"
              className={`flex items-center bg-slate-950/80 px-[1.2cqw] font-semibold transition-colors hover:bg-slate-800/80 ${NAUTICAL_LABEL_CLASS}`}
            >
              Decks
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
