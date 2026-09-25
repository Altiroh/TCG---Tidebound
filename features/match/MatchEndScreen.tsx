"use client";

import { MatchQuestRecap } from "@/features/quests/MatchQuestRecap";
import { MatchRewardBanner } from "@/features/progression/MatchRewardBanner";
import { MatchAudienceRecap, type MatchAudienceVerdict } from "@/features/audience/MatchAudienceRecap";
import type { MatchAudienceSummary } from "@/features/audience/actions";
import { useEffect, type CSSProperties } from "react";
import Link from "next/link";
import type { ShipDefinition } from "@/game";
import { BoardBackdrop } from "@/features/match/BoardBackdrop";
import { useImageOk } from "@/features/match/useImageOk";
import { Fireworks } from "@/features/match/Fireworks";
import { SwampHaze } from "@/features/match/SwampHaze";
import styles from "@/features/match/MatchEndScreen.module.css";
import { playGameLost } from "@/lib/sound";
import type { QuestRecapEntry } from "@/features/quests/actions";
import type { VoyageRecap } from "@/features/quests/voyageActions";
import type { MatchRewardSummary } from "@/features/progression/actions";

export type MatchOutcome = "victory" | "defeat";

interface MatchEndScreenProps {
  /**
   * Issue vue par le joueur qui regarde cet écran. `defeat` change le
   * bandeau, le cadre et l'ambiance de fond — jamais la chorégraphie.
   */
  outcome: MatchOutcome;
  /**
   * Le JOUEUR qui regarde, victoire ou défaite : c'est toujours son nom et
   * son Navire qui s'affichent sur la plaque (décision du 2026-09-14), pas
   * ceux du vainqueur. `undefined` pour un match nul — dans ce cas, pas de
   * cadre/navire à montrer.
   */
  player?: {
    name: string;
    ship: ShipDefinition;
    /** Titre équipé au profil, écrit sous le nom sur la plaque. Absent : le nom seul. */
    title?: string | null;
  };
  /** Local (hot-seat/bot) : relance une partie sans navigation. Fournir soit `onExit`, soit `exitHref`. */
  onExit?: () => void;
  /** En ligne : redirige vers l'écran de matchmaking (`next/link`, navigation client). */
  exitHref?: string;
  /**
   * Partie ARBITRÉE dont on montre le gain (XP, Tides) et le relevé de
   * quêtes. Absent pour une partie locale : elle ne rapporte rien, il n'y a
   * donc rien à relever.
   */
  matchId?: string;
  /**
   * Gain et relevé FABRIQUÉS, pour le labo `/game/fin-preview` : l'écran
   * se règle sans avoir à finir une vraie partie arbitrée.
   */
  preview?: { reward: MatchRewardSummary; quests: QuestRecapEntry[]; voyage?: VoyageRecap | null; audience?: MatchAudienceSummary };
  /**
   * Le jugement du public sur la partie (`analyzeMatch`, calculé par
   * l'appelant sur l'état final). Absent : pas de récap « Le public ».
   */
  audience?: MatchAudienceVerdict;
}

/**
 * Fenêtre en arche de `ship-frame-victory.webp` (1161×1354), mesurée par
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
/**
 * Le cadre de défaite (`ship-frame-loose.webp`, 1178×1335) n'a ni le même
 * gabarit ni la même arche que celui de victoire : sa fenêtre est plus
 * haute et commence plus près du bord supérieur. Mesurée sur ses pixels de
 * la même façon (remplissage de la zone transparente depuis le centre),
 * puis débordée de 1 % de chaque côté — cet anneau est recouvert par le
 * cadre, et sans lui un liseré de fond apparaît sur le pourtour.
 */
const DEFEAT_ILLUSTRATION_ZONE = { top: "10.54%", left: "15.21%", width: "67.45%", height: "61.63%" };
const DEFEAT_ILLUSTRATION_CLIP =
  "polygon(45.5% 0%, 29.4% 4.6%, 24.8% 9.4%, 25% 14.2%, 14.3% 19%, 13.7% 23.7%, 13.1% 28.5%, 4.4% 33.3%, 3.9% 38.1%, 3.5% 42.8%, 4.4% 47.6%, 3.9% 52.3%, 4.4% 57%, 0.6% 61.8%, 0% 66.6%, 0% 71.4%, 0% 76.1%, 1.3% 80.9%, 2.2% 85.7%, 3% 90.5%, 4.7% 95.2%, 7.3% 100%, 92.3% 100%, 96.2% 95.2%, 99.9% 90.5%, 99.9% 85.7%, 99.9% 80.9%, 99.9% 76.1%, 99.9% 71.4%, 99.6% 66.6%, 99.6% 61.8%, 99.2% 57%, 99.9% 52.3%, 99.9% 47.6%, 99.9% 42.8%, 98.3% 38.1%, 95.3% 33.3%, 94.8% 28.5%, 93.5% 23.7%, 90.9% 19%, 84.3% 14.2%, 81.3% 9.4%, 68.4% 4.6%, 48.4% 0%)";
const ILLUSTRATION_CLIP =
  "polygon(36.6% 0%, 21.3% 7.9%, 13.6% 14%, 8.3% 19.9%, 4.4% 26%, 1.7% 32%, 0.3% 37.9%, 0% 44%, 0% 74.1%, 3% 80.1%, 5.3% 86%, 5.6% 92.1%, 10.1% 100%, 91% 100%, 98.3% 92.1%, 100% 86%, 100% 44%, 99.5% 37.9%, 97.9% 32%, 95.2% 26%, 91.4% 19.9%, 86.1% 14%, 78% 7.9%, 61.2% 0%)";
/** Étincelles de la gerbe d'impact du bandeau. */
const SPARK_COUNT = 18;
/** Le nom s'écrit lettre par lettre une fois le cadre posé (cf. chorégraphie dans `VictoryScreen.module.css`). */
const NAME_START_MS = 1350;
const NAME_LETTER_STEP_MS = 55;
const NAMEPLATE_ZONE = { top: "73%", left: "22%", width: "56%", height: "8%" };
/** La planche du nom du cadre de défaite est plus haute et plus étroite que la bannière de victoire (mesurée sur la bande opaque sous l'arche, ~72 → 84 % de hauteur). */
const DEFEAT_NAMEPLATE_ZONE = { top: "73%", left: "24%", width: "52%", height: "9%" };
/** Le son de défaite tombe avec le bandeau, qui s'abat de 150 à 770 ms (`victory-banner-slam`). */
const DEFEAT_SOUND_AT_MS = 250;

/**
 * Écran de fin de partie victorieuse — cadre `ship-frame-victory.webp`
 * fourni par l'utilisateur, illustration du Navire vainqueur dans la
 * fenêtre en arche, nom du joueur sur la plaque (le nom du Navire n'y
 * figure plus — demande explicite, la plaque ne porte qu'une identité).
 * Le bandeau "VICTOIRE" (`victory.webp`) surmonte le cadre plutôt que
 * d'être incrusté dedans, pour rester lisible à toutes les tailles.
 */
export function MatchEndScreen({ outcome, player, onExit, exitHref, matchId, preview, audience }: MatchEndScreenProps) {
  const isDefeat = outcome === "defeat";
  const winner = player;

  useEffect(() => {
    if (!isDefeat) return;
    const timer = window.setTimeout(playGameLost, DEFEAT_SOUND_AT_MS);
    return () => window.clearTimeout(timer);
  }, [isDefeat]);

  // Repli si un asset venait à manquer : un titre en toutes lettres plutôt
  // qu'une image cassée, comme partout ailleurs dans le jeu.
  const bannerUrl = isDefeat ? "/assets/match-end/defeat.webp" : "/assets/match-end/victory.webp";
  const frameUrl = isDefeat ? "/assets/ships/ship-frame-loose.webp" : "/assets/ships/ship-frame-victory.webp";
  const bannerOk = useImageOk(bannerUrl);
  const frameOk = useImageOk(frameUrl);
  const illustrationZone = isDefeat ? DEFEAT_ILLUSTRATION_ZONE : ILLUSTRATION_ZONE;
  const illustrationClip = isDefeat ? DEFEAT_ILLUSTRATION_CLIP : ILLUSTRATION_CLIP;
  // Chaque cadre garde ses propres proportions : les étirer au gabarit de
  // l'autre décalerait l'arche par rapport à l'illustration.
  const frameAspectRatio = isDefeat ? "1178 / 1335" : "1161 / 1354";
  const nameplateZone = isDefeat ? DEFEAT_NAMEPLATE_ZONE : NAMEPLATE_ZONE;
  return (
    <>
      {/* Le plateau peint (`board.webp`) porte ses propres cadres de Navire
          vides et ses dos de carte : à peine voilé, on les lisait derrière
          l'écran de fin (retour du 15/09). Il ne sert plus que de matière —
          flouté, assombri et désaturé par `.backdrop`. */}
      <div className={styles.backdrop} aria-hidden>
        <BoardBackdrop variant="absolute" />
      </div>
      <div className={styles.backdropVeil} aria-hidden />
      {/* Plan intermédiaire : flouté, sous le cadre (net) mais au-dessus du fond de plateau — cf. `Fireworks.tsx`. */}
      {winner && <div className={styles.vignette} aria-hidden />}
      {/* La victoire éclate, la défaite stagne — même emplacement, sentiment inverse. */}
      {winner && (isDefeat ? <SwampHaze /> : <Fireworks firstBurstAt={0.5} />)}
      {winner && <div className={isDefeat ? styles.flashDefeat : styles.flash} aria-hidden />}
      <div className={`${styles.screen} ${winner ? styles.stage : ""}`}>
        {/* Deux colonnes centrées : à gauche la fiche (bandeau, cadre, gain
            d'XP), à droite le relevé des quêtes. Sans relevé (partie locale,
            ou aucune quête touchée), la colonne de droite reste vide et la
            fiche reprend seule le centre (`.columns:has(...)`). */}
        <div className={styles.columns}>
          <div className={styles.sheet}>
            {winner ? (
              <>
                <div className={styles.bannerWrap}>
                  <span className={styles.shockwave} aria-hidden />
                  <span className={styles.sparks} aria-hidden>
                    {Array.from({ length: SPARK_COUNT }).map((_, i) => (
                      <span
                        key={i}
                        className={styles.spark}
                        style={
                          {
                            "--angle": `${(360 / SPARK_COUNT) * i + (i % 2) * 9}deg`,
                            "--distance": `${120 + (i % 3) * 55}px`,
                          } as CSSProperties
                        }
                      />
                    ))}
                  </span>
                  {/* eslint-disable-next-line @next/next/no-img-element -- bandeau décoratif fixe */}
                  {bannerOk ? (
                  <img
                    src={bannerUrl}
                    alt={isDefeat ? "Défaite" : "Victoire"}
                    draggable={false}
                    className={`select-none ${styles.bannerIn}`}
                  />
                  ) : (
                    <h1 className={`text-center text-4xl font-bold uppercase tracking-widest ${isDefeat ? "text-[#9db487]" : "text-amber-200"}`}>
                      {isDefeat ? "Défaite" : "Victoire"}
                    </h1>
                  )}
                  {bannerOk && <span className={styles.bannerShine} aria-hidden />}
                </div>
    
                <div className={styles.frameWrap}>
                  {/* Les rayons de gloire n'ont pas leur place dans une défaite. */}
                  {!isDefeat && <span className={styles.rays} aria-hidden />}
                  <div
                    className={`relative ${styles.frameIn} ${styles.frame}`}
                    // La LARGEUR vient du budget de hauteur de l'écran
                    // (`--fin-cadre`, dans la feuille) : l'écran de fin ne
                    // défile pas, tout doit tenir dans la fenêtre, et un style
                    // en ligne ne se corrige pas par requête média. Seules les
                    // proportions restent ici : elles changent avec l'issue.
                    style={{ aspectRatio: frameAspectRatio }}
                  >
                    <div
                      className="absolute overflow-hidden"
                      style={{ ...illustrationZone, clipPath: illustrationClip }}
                    >
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
    
                    {frameOk && (
                      // eslint-disable-next-line @next/next/no-img-element -- cadre décoratif fixe, superpose l'illustration
                      <img
                        src={frameUrl}
                        alt=""
                        draggable={false}
                        className="pointer-events-none absolute inset-0 h-full w-full select-none"
                      />
                    )}
    
                    <div
                      className={`absolute flex flex-col items-center justify-center ${winner.title ? styles.nameplateTitled : ""}`}
                      style={{ ...nameplateZone, containerType: "inline-size" }}
                    >
                      <span
                        aria-label={winner.name}
                        className="max-w-full truncate text-[clamp(12px,11cqw,22px)] leading-none font-bold uppercase tracking-wide text-amber-50 [font-family:var(--font-card-title)]"
                        style={{ textShadow: "0 1px 3px rgba(0,0,0,0.9)" }}
                      >
                        {Array.from(winner.name).map((letter, i) => (
                          <span
                            key={i}
                            aria-hidden
                            className={styles.nameLetter}
                            style={{
                              animationDelay: `${NAME_START_MS + i * NAME_LETTER_STEP_MS}ms`,
                            }}
                          >
                            {letter}
                          </span>
                        ))}
                      </span>
                      {/* Le TITRE équipé, sous le nom : il se pose une fois le
                          nom écrit, comme une signature. */}
                      {winner.title && (
                        <span
                          className={`max-w-full truncate ${styles.nameplateTitle}`}
                          style={{ animationDelay: `${NAME_START_MS + Array.from(winner.name).length * NAME_LETTER_STEP_MS + 120}ms` }}
                        >
                          {winner.title}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <h1 className="text-3xl font-bold text-slate-100">Match nul</h1>
            )}

            {/* Le gain de la partie, sous la fiche qu'il récompense. */}
            {(matchId || preview) && <MatchRewardBanner matchId={matchId} preview={preview?.reward} />}
            {/* Le public : sa note, son humeur, ses temps forts, et ce que la partie a fait à l'audience. */}
            {audience && <MatchAudienceRecap verdict={audience} matchId={matchId} preview={preview?.audience} />}
          </div>

          {/* Ce que la partie a rapporté aux quêtes : elles défilent une à
              une, jauge en train de se remplir. */}
          <div className={styles.questColumn}>{(matchId || preview) && <MatchQuestRecap matchId={matchId} preview={preview?.quests} voyagePreview={preview?.voyage} />}</div>
        </div>

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
