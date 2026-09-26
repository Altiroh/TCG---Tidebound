"use client";

import { MatchQuestRecap } from "@/features/quests/MatchQuestRecap";
import { MatchRewardBanner } from "@/features/progression/MatchRewardBanner";
import { MatchAudienceTicker, type MatchAudienceVerdict } from "@/features/audience/MatchAudienceTicker";
import type { MatchAudienceSummary } from "@/features/audience/actions";
import type { CSSProperties } from "react";
import Link from "next/link";
import type { ShipDefinition } from "@/game";
import { BoardBackdrop } from "@/features/match/BoardBackdrop";
import { MatchResultScreen } from "@/features/match/MatchResultScreen";
import { useImageOk } from "@/features/match/useImageOk";
import { Fireworks } from "@/features/match/Fireworks";
import { SwampHaze } from "@/features/match/SwampHaze";
import styles from "@/features/match/MatchEndScreen.module.css";
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
    /** Carte de l'avatar du joueur : son illustration remplit la photo. Absente : le Navire. */
    avatarCardId?: string | null;
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
/**
 * LA PLAQUE DU NOM et LA PLANCHE DU TITRE, mesurées sur les pixels des
 * cadres (profil de luminosité, 26/09/2026). Le nom tient DANS l'intérieur
 * de la plaque de laiton ; le titre se grave sur la planche sombre en
 * dessous. Avant, les deux s'empilaient dans la plaque : le nom montait sur
 * sa bordure haute et le titre débordait sur sa bordure basse.
 *
 * Victoire (`ship-frame-victory.webp`) : intérieur de la plaque 72,4 → 80 %
 * de hauteur, 30 → 69 % de largeur ; planche 82,5 → 89 %, 27 → 73 %.
 */
const NAMEPLATE_ZONE = { top: "72.4%", left: "30%", width: "40%", height: "7.6%" };
const TITLE_ZONE = { top: "82.6%", left: "27%", width: "46%", height: "6%" };
/** Défaite (`ship-frame-loose.webp`) : planches du nom 70,5 → 81 %, 27 → 73 % ; planche basse 83 → 91,5 %. */
const DEFEAT_NAMEPLATE_ZONE = { top: "71.5%", left: "27%", width: "46%", height: "9%" };
const DEFEAT_TITLE_ZONE = { top: "84%", left: "27%", width: "46%", height: "7%" };

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
  const titleZone = isDefeat ? DEFEAT_TITLE_ZONE : TITLE_ZONE;

  // Victoire comme défaite ont leur composition peinte (26/09/2026) : le
  // décor, la photo du joueur collée de travers, l'information imprimée à
  // l'encre à gauche. Seul le match nul garde l'écran ci-dessous.
  if (player) {
    return (
      <MatchResultScreen
        outcome={outcome}
        player={player}
        matchId={matchId}
        preview={preview}
        audience={audience}
        onExit={onExit}
        exitHref={exitHref}
      />
    );
  }

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
        {/* TROIS VOLETS sur toute la hauteur (26/09/2026) : à gauche le
            public, en grand ; au centre la fiche (bandeau, cadre, gain,
            boutons) ; à droite le relevé des quêtes. Un volet sans contenu
            (partie locale, pas de verdict) s'efface, la fiche reste au centre. */}
        <div className={styles.columns}>
          {/* Le public : son compteur défile avec ce que la partie lui a fait. */}
          <div className={styles.audienceColumn}>
            {audience && <MatchAudienceTicker matchId={matchId} preview={preview?.audience} verdict={audience} />}
          </div>

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
    
                    {/* Le NOM, dans l'intérieur de la plaque de laiton. */}
                    <div className={`absolute flex items-center justify-center ${styles.nameplate}`} style={nameplateZone}>
                      <span aria-label={winner.name} className={styles.nameplateName}>
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
                    </div>
                    {/* Le TITRE équipé, gravé sur la planche sous la plaque : il
                        se pose une fois le nom écrit, comme une signature. */}
                    {winner.title && (
                      <div className={`absolute flex items-center justify-center ${styles.nameplate}`} style={titleZone}>
                        <span
                          className={styles.nameplateTitle}
                          style={{ animationDelay: `${NAME_START_MS + Array.from(winner.name).length * NAME_LETTER_STEP_MS + 120}ms` }}
                        >
                          {winner.title}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <h1 className="text-3xl font-bold text-slate-100">Match nul</h1>
            )}

            {/* Le gain de la partie, sous la fiche qu'il récompense. */}
            {(matchId || preview) && <MatchRewardBanner matchId={matchId} preview={preview?.reward} />}

            {/* Les boutons du jeu, sous la fiche : secondaire à gauche, action
                engageante à droite — même ordre de lecture que les dialogues
                de la coquille hors-partie. */}
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

          {/* Ce que la partie a rapporté aux quêtes : elles défilent une à
              une, jauge en train de se remplir. */}
          <div className={styles.questColumn}>{(matchId || preview) && <MatchQuestRecap matchId={matchId} preview={preview?.quests} voyagePreview={preview?.voyage} />}</div>
        </div>
      </div>
    </>
  );
}
