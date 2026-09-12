import Link from "next/link";
import type { ShipDefinition } from "@/game";
import { BoardBackdrop } from "@/features/match/BoardBackdrop";
import { Fireworks } from "@/features/match/Fireworks";

interface VictoryScreenProps {
  /** `undefined` pour un match nul — dans ce cas, pas de cadre/navire à montrer. */
  winner?: { name: string; ship: ShipDefinition };
  /** Local (hot-seat/bot) : relance une partie sans navigation. Fournir soit `onExit`, soit `exitHref`. */
  onExit?: () => void;
  /** En ligne : redirige vers l'écran de matchmaking (`next/link`, navigation client). */
  exitHref?: string;
}

/**
 * Zones mesurées en scannant la transparence des pixels de
 * `ship-frame-victory.png` (1161×1354) : la fenêtre en arche (illustration)
 * s'ouvre entre ~22%/70% de hauteur et ~17%/81% de largeur. La plaque en
 * bois du nom de joueur vit dans la bannière effilée juste en dessous —
 * une seule ligne centrée sur son cœur plat (~73%/81% de hauteur), avant
 * que la bannière ne commence à s'effiler vers la pointe sombre du bas
 * (réservée à un futur badge d'XP, laissée vide pour l'instant).
 */
const ILLUSTRATION_ZONE = { top: "21%", left: "17%", width: "64%", height: "49%" };
/**
 * `rounded-t-full` (essayé d'abord) trace une ellipse trop plate : ses
 * coins hauts dépassaient de la vraie ouverture en arche du cadre (plus
 * étroite, en ogive) — l'illustration débordait légèrement de part et
 * d'autre du sommet. Rétrécir tout le cadran pour compenser créait un
 * grand vide visible en bas de l'arche (pire). Ce `clip-path` suit de
 * plus près le contour réel de l'ouverture sans réduire la taille de
 * l'illustration : plus de marge dans les coins hauts, plein cadran
 * conservé du milieu vers le bas.
 */
const ILLUSTRATION_CLIP =
  "polygon(50% 0%, 36% 1.5%, 25% 6%, 16% 13%, 9% 23%, 4% 35%, 1% 48%, 0% 62%, 0% 100%, 100% 100%, 100% 62%, 99% 48%, 96% 35%, 91% 23%, 84% 13%, 75% 6%, 64% 1.5%)";
const NAMEPLATE_ZONE = { top: "73%", left: "22%", width: "56%", height: "8%" };

/** Bouton "Nouvelle partie" — même signature visuelle que le CTA principal de la Collection (laiton/turquoise). */
const EXIT_BUTTON_CLASS =
  "inline-flex items-center justify-center rounded-md px-8 py-3 text-sm font-bold uppercase tracking-wide text-amber-50 " +
  "[font-family:var(--font-card-title)] transition-all duration-150 hover:-translate-y-0.5 " +
  "shadow-[inset_0_0_0_1px_rgba(231,200,119,0.45),0_4px_14px_rgba(0,0,0,0.45)] " +
  "hover:shadow-[inset_0_0_0_1px_rgba(231,200,119,0.7),0_6px_18px_rgba(0,0,0,0.55),0_0_14px_rgba(31,111,120,0.5)]";
const EXIT_BUTTON_STYLE = { background: "linear-gradient(180deg, #1f6f78 0%, #123c42 100%)" };

/**
 * Écran de fin de partie victorieuse — cadre `ship-frame-victory.png`
 * fourni par l'utilisateur, illustration du Navire vainqueur dans la
 * fenêtre en arche, nom du joueur sur la plaque (le nom du Navire n'y
 * figure plus — demande explicite, la plaque ne porte qu'une identité).
 * Le bandeau "VICTOIRE" (`victory-text.png`) surmonte le cadre plutôt que
 * d'être incrusté dedans, pour rester lisible à toutes les tailles.
 */
export function VictoryScreen({ winner, onExit, exitHref }: VictoryScreenProps) {
  return (
    <>
      <BoardBackdrop />
      {/* Plan intermédiaire : flouté, sous le cadre (net) mais au-dessus du fond de plateau — cf. `Fireworks.tsx`. */}
      {winner && <Fireworks />}
      <div className="relative z-10 flex min-h-screen flex-col items-center justify-center gap-8 p-8 text-center">
        {winner ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- bandeau décoratif fixe */}
            <img
              src="/assets/victory-text.png"
              alt="Victoire"
              draggable={false}
              className="w-full select-none"
              style={{ maxWidth: "min(70vw, 480px)" }}
            />

            <div className="relative" style={{ width: "min(60vw, 340px)", aspectRatio: "1161 / 1354" }}>
              <div className="absolute overflow-hidden" style={{ ...ILLUSTRATION_ZONE, clipPath: ILLUSTRATION_CLIP }}>
                {winner.ship.illustration && (
                  // eslint-disable-next-line @next/next/no-img-element -- asset local, une par Navire
                  <img
                    src={`/assets/ships/illu/${winner.ship.illustration}`}
                    alt=""
                    draggable={false}
                    className="h-full w-full select-none object-cover"
                  />
                )}
              </div>

              {/* eslint-disable-next-line @next/next/no-img-element -- cadre décoratif fixe, superpose l'illustration */}
              <img
                src="/assets/ships/ship-frame-victory.png"
                alt=""
                draggable={false}
                className="pointer-events-none absolute inset-0 h-full w-full select-none"
              />

              <div className="absolute flex items-center justify-center" style={{ ...NAMEPLATE_ZONE, containerType: "inline-size" }}>
                <span
                  className="max-w-full truncate text-[clamp(12px,11cqw,22px)] font-bold uppercase tracking-wide text-amber-50 [font-family:var(--font-card-title)]"
                  style={{ textShadow: "0 1px 3px rgba(0,0,0,0.9)" }}
                >
                  {winner.name}
                </span>
              </div>
            </div>
          </>
        ) : (
          <h1 className="text-3xl font-bold text-slate-100">Match nul</h1>
        )}

        {exitHref ? (
          <Link href={exitHref} className={EXIT_BUTTON_CLASS} style={EXIT_BUTTON_STYLE}>
            Nouvelle partie
          </Link>
        ) : (
          <button type="button" onClick={onExit} className={EXIT_BUTTON_CLASS} style={EXIT_BUTTON_STYLE}>
            Nouvelle partie
          </button>
        )}
      </div>
    </>
  );
}
