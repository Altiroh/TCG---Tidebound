import Link from "next/link";
import type { ShipDefinition } from "@/game";
import { BoardBackdrop } from "@/features/match/BoardBackdrop";
import { Fireworks } from "@/features/match/Fireworks";
import styles from "@/features/match/VictoryScreen.module.css";

interface VictoryScreenProps {
  /** `undefined` pour un match nul — dans ce cas, pas de cadre/navire à montrer. */
  winner?: { name: string; ship: ShipDefinition };
  /** Local (hot-seat/bot) : relance une partie sans navigation. Fournir soit `onExit`, soit `exitHref`. */
  onExit?: () => void;
  /** En ligne : redirige vers l'écran de matchmaking (`next/link`, navigation client). */
  exitHref?: string;
}

/**
 * Fenêtre en arche de `ship-frame-victory.png` (1161×1354), mesurée par
 * remplissage de la zone transparente (alpha ≤ 40) depuis son centre :
 * ~19,6 %/72 % de hauteur, ~17,6 %/80,5 % de largeur. L'ancienne zone
 * estimée (21 %/70 %) laissait voir le fond en haut de l'arche et en bas.
 * Même principe que `ShipInstrumentCluster` : 1 % de débord de chaque côté
 * (anneau vérifié 100 % opaque, recouvert par le cadre) et un `clip-path`
 * qui suit le contour réel, en coordonnées relatives à la zone. La plaque
 * du nom de joueur vit dans la bannière juste en dessous (~73 %/81 % de
 * hauteur) ; la pointe sombre du bas reste réservée à un futur badge d'XP.
 */
const ILLUSTRATION_ZONE = { top: "18.54%", left: "16.54%", width: "65.03%", height: "54.51%" };
const ILLUSTRATION_CLIP =
  "polygon(36.6% 0%, 21.3% 7.9%, 13.6% 14%, 8.3% 19.9%, 4.4% 26%, 1.7% 32%, 0.3% 37.9%, 0% 44%, 0% 74.1%, 3% 80.1%, 5.3% 86%, 5.6% 92.1%, 10.1% 100%, 91% 100%, 98.3% 92.1%, 100% 86%, 100% 44%, 99.5% 37.9%, 97.9% 32%, 95.2% 26%, 91.4% 19.9%, 86.1% 14%, 78% 7.9%, 61.2% 0%)";
const NAMEPLATE_ZONE = { top: "73%", left: "22%", width: "56%", height: "8%" };

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
      {winner && <Fireworks firstBurstAt={0.85} />}
      <div className="relative z-10 flex min-h-screen flex-col items-center justify-center gap-8 p-8 text-center">
        {winner ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- bandeau décoratif fixe */}
            <img
              src="/assets/victory-text.png"
              alt="Victoire"
              draggable={false}
              className={`w-full select-none ${styles.bannerIn}`}
              style={{ maxWidth: "min(70vw, 480px)" }}
            />

            <div className={`relative ${styles.frameIn}`} style={{ width: "min(60vw, 340px)", aspectRatio: "1161 / 1354" }}>
              <div className="absolute overflow-hidden" style={{ ...ILLUSTRATION_ZONE, clipPath: ILLUSTRATION_CLIP }}>
                {winner.ship.illustration && (
                  // eslint-disable-next-line @next/next/no-img-element -- asset local, une par Navire
                  <img
                    src={`/assets/ships/illu/${winner.ship.illustration}`}
                    alt=""
                    draggable={false}
                    className={`h-full w-full select-none object-cover ${styles.illustrationIn}`}
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

              <div className={`absolute flex items-center justify-center ${styles.nameIn}`} style={{ ...NAMEPLATE_ZONE, containerType: "inline-size" }}>
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

        {/* Secondaire à gauche, action engageante à droite — même ordre de
            lecture que les dialogues de la coquille hors-partie. */}
        <div className={`${styles.actions} ${winner ? styles.actionsIn : ""}`}>
          <Link href="/" className={styles.ghost}>
            Retour au menu
          </Link>

          {exitHref ? (
            <Link href={exitHref} className={styles.primary}>
              Nouvelle partie
            </Link>
          ) : (
            <button type="button" onClick={onExit} className={styles.primary}>
              Nouvelle partie
            </button>
          )}
        </div>
      </div>
    </>
  );
}
