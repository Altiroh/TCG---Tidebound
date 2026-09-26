"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { getCardDefinition, isAbyssalVariant, type ShipDefinition } from "@/game";
import { audienceMood } from "@/game/audience";
import { QUEST_CATEGORY_META } from "@/game/quests";
import type { MatchAudienceSummary } from "@/features/audience/actions";
import { RollingNumber } from "@/features/audience/RollingNumber";
import { useMatchAudience } from "@/features/audience/useMatchAudience";
import { weightiestSignals, type MatchAudienceVerdict } from "@/features/audience/verdict";
import { cardIllustrationUrl } from "@/features/decks/cardArtUrl";
import type { MatchRewardSummary } from "@/features/progression/actions";
import { useMatchReward } from "@/features/progression/useMatchReward";
import type { QuestRecapEntry } from "@/features/quests/actions";
import { useMatchQuestRecap } from "@/features/quests/useMatchQuestRecap";
import type { VoyageRecap } from "@/features/quests/voyageActions";
import { useNoMenuAmbiance } from "@/components/menu/MenuAmbiance";
import { playMatchEnd, playQuestCompleted, startEndTheme } from "@/lib/sound";
import styles from "@/features/match/MatchResultScreen.module.css";

/** Quatre quêtes au plus sur la ligne, comme la composition de référence. */
const QUEST_SLOTS = 4;
/** Les jauges partent de l'AVANT et montent vers l'APRÈS, une à une. */
const FILL_START_MS = 1500;
const FILL_STAGGER_MS = 350;
/** Durée du remplissage (`.questFill`) : le son tombe quand la jauge touche le bout. */
const FILL_MS = 900;
/** Le bruitage de l'issue tombe avec le titre, qui s'imprime de 200 à 900 ms (`title-in`). */
const END_SOUND_AT_MS = 250;

/**
 * Ce qui change d'une issue à l'autre : les assets peints, la fenêtre du
 * cadre photo et l'intitulé de ce qui a pesé. Tout le reste — composition,
 * encres, chorégraphie — est commun.
 *
 * LA FENÊTRE de chaque cadre (1536 × 1024, peint déjà incliné) a été
 * relevée sur ses pixels : une droite ajustée sur chacun des quatre bords
 * (hors coins, mordus par le ruban), leurs intersections pour les coins.
 * L'illustration y est posée comme un vrai tirage — un rectangle aux
 * dimensions de la fenêtre, centré sur elle, tourné de son angle (moyenne
 * des bords haut et bas) —, puis découpée par la fenêtre élargie de ~2 % :
 * ce surplus disparaît sous le cadre opaque.
 */
const OUTCOMES = {
  defeat: {
    assets: "/assets/match-end/defaite",
    titleAlt: "Défaite",
    // Coins relevés : 23,0/9,7 · 79,8/19,8 · 73,6/79,6 · 19,4/65,3 ; bords à 6,8° (haut) et 10° (bas).
    window: { x: 48.96, y: 43.56, w: 56.1, h: 58.2, angle: 8.4, clip: "polygon(21.4% 7.7%, 81.6% 18.2%, 75.2% 81.8%, 17.6% 67.2%)" },
    titleLeft: 2.8,
  },
  victory: {
    assets: "/assets/match-end/victoire",
    titleAlt: "Victoire",
    // Coins relevés : 24,4/11,1 · 79,3/23,3 · 72,3/79,4 · 22,9/69,6 ; bords à 8,4° (haut) et 7,6° (bas).
    window: { x: 49.71, y: 45.84, w: 52.68, h: 57.8, angle: 8.0, clip: "polygon(22.6% 9.1%, 81.1% 21.6%, 74% 81.6%, 21% 71.8%)" },
    // Les lettres de ce titre commencent plus loin dans son image : le « V » s'aligne sur le « D » de la défaite.
    titleLeft: 2.1,
  },
} as const;

interface MatchResultScreenProps {
  outcome: "victory" | "defeat";
  player: { name: string; ship: ShipDefinition; title?: string | null; avatarCardId?: string | null };
  matchId?: string;
  preview?: { reward: MatchRewardSummary; quests: QuestRecapEntry[]; voyage?: VoyageRecap | null; audience?: MatchAudienceSummary };
  audience?: MatchAudienceVerdict;
  onExit?: () => void;
  exitHref?: string;
}

/** Une ligne de la ligne des quêtes : quête du jour ou escale de Traversée. */
interface QuestSlot {
  key: string;
  mark: ReactNode;
  name: string;
  secondary?: string;
  before: number;
  after: number;
  target: number;
  completed: boolean;
}

/** L'illustration de la photo : l'avatar du joueur (et son débord s'il est Abyssal), sinon le Navire. */
function photoLayers(player: MatchResultScreenProps["player"]): { src: string | null; debord: string | null } {
  if (player.avatarCardId) {
    let abyssal = false;
    try {
      abyssal = isAbyssalVariant(getCardDefinition(player.avatarCardId));
    } catch {
      // Carte retirée du catalogue : son illustration seule, si elle existe encore.
    }
    return {
      src: cardIllustrationUrl(player.avatarCardId),
      // Une Abyssale n'a que son décor dans l'illustration : le sujet vit dans le calque de débord.
      debord: abyssal ? `/assets/cards/illustrations/${player.avatarCardId}-debord.webp` : null,
    };
  }
  return { src: player.ship.illustration ? `/assets/ships/illu/${player.ship.illustration}` : null, debord: null };
}

/**
 * ÉCRAN DE FIN DE PARTIE — victoire ou défaite, d'après la composition de
 * référence du 26/09/2026 (`public/references/screen-play/`), avec les
 * assets peints de chaque issue (`public/assets/match-end/defaite|victoire/`).
 *
 * Une scène au format du fond peint (1672 × 941) posée par-dessus lui :
 * chaque élément y est placé en POURCENTAGE de la scène et ses textes en
 * unités de conteneur (`cqw`), si bien que les proportions de la référence
 * tiennent à toutes les tailles. À gauche, l'information — titre, public,
 * ce qui a pesé, quêtes — imprimée à l'encre sur le ciel clair ; à droite,
 * la photo du joueur, inclinée, en contrepoids du titre ; en pied, le gain
 * et les deux boutons peints.
 *
 * Toutes les valeurs sont celles de la partie : spectateurs, spectacle et
 * ce qui a pesé (`useMatchAudience`, verdict), XP et Tides
 * (`useMatchReward`), quêtes et Traversée (`useMatchQuestRecap`),
 * illustration choisie, Navire, nom et titre du joueur.
 */
export function MatchResultScreen({ outcome, player, matchId, preview, audience, onExit, exitHref }: MatchResultScreenProps) {
  const look = OUTCOMES[outcome];
  const isVictory = outcome === "victory";
  const { shown } = useMatchAudience({ matchId, preview: preview?.audience, verdict: audience });
  const reward = useMatchReward(matchId, preview?.reward);
  const { entries, voyage } = useMatchQuestRecap(matchId, preview?.quests, preview?.voyage);
  const [filled, setFilled] = useState(false);
  const [debordFailed, setDebordFailed] = useState(false);

  // Le son, à l'ENTRÉE dans l'écran et nulle part ailleurs : le bruitage de
  // l'issue une fois, puis son thème en boucle, à peine audible, jusqu'au
  // départ. L'ambiance du menu se tait (une partie la coupe déjà ; le labo,
  // monté hors partie, en a besoin).
  useNoMenuAmbiance();
  useEffect(() => {
    const timer = window.setTimeout(() => playMatchEnd(outcome), END_SOUND_AT_MS);
    const stopTheme = startEndTheme(outcome);
    return () => {
      window.clearTimeout(timer);
      stopTheme();
    };
  }, [outcome]);

  const slots: QuestSlot[] = [
    ...entries.slice(0, voyage ? QUEST_SLOTS - 1 : QUEST_SLOTS).map((entry) => ({
      key: entry.code,
      mark: (
        // eslint-disable-next-line @next/next/no-img-element -- icône locale de catégorie, taille fixe
        <img src={QUEST_CATEGORY_META[entry.category].icon} alt="" draggable={false} />
      ),
      name: entry.name,
      before: entry.before,
      after: entry.after,
      target: entry.target,
      completed: entry.completed,
    })),
    ...(voyage
      ? [
          {
            key: voyage.voyageId,
            mark: <span className={styles.questNumeral}>{voyage.numeral}</span>,
            name: voyage.stepName,
            secondary: `Traversée ${voyage.numeral}`,
            before: voyage.before,
            after: voyage.after,
            target: voyage.target,
            completed: voyage.completedStep,
          },
        ]
      : []),
  ];
  const finished = entries.filter((entry) => entry.completed).length;
  const questsSubtitle =
    finished > 0
      ? `${finished} quête${finished > 1 ? "s" : ""} terminée${finished > 1 ? "s" : ""}`
      : voyage?.completedStep
        ? `Traversée ${voyage.numeral} : palier ${voyage.tier} atteint`
        : "Tes quêtes avancent";

  // Les jauges montent une fois la ligne posée ; un seul son, sur la première qui touche le bout.
  const firstDone = slots.findIndex((slot) => slot.completed);
  const slotCount = slots.length;
  useEffect(() => {
    if (slotCount === 0) return;
    const timers = [setTimeout(() => setFilled(true), FILL_START_MS)];
    if (firstDone >= 0) timers.push(setTimeout(playQuestCompleted, FILL_START_MS + firstDone * FILL_STAGGER_MS + FILL_MS));
    return () => timers.forEach(clearTimeout);
  }, [slotCount, firstDone]);

  const signals = audience ? weightiestSignals(audience.signals) : [];
  const anyPositive = signals.some((signal) => signal.weight > 0);
  const signalsTitle = isVictory ? "Moments forts" : anyPositive ? "Malgré tout…" : "Ce qui a pesé";
  const leveledUp = reward ? reward.levelAfter > reward.levelBefore : false;
  const photo = photoLayers(player);
  const windowStyle = {
    "--win-x": `${look.window.x}%`,
    "--win-y": `${look.window.y}%`,
    "--win-w": `${look.window.w}%`,
    "--win-h": `${look.window.h}%`,
    "--win-angle": `${look.window.angle}deg`,
    "--win-clip": look.window.clip,
  } as CSSProperties;

  return (
    <div className={styles.screen} data-outcome={outcome}>
      <div className={styles.backdrop} style={{ backgroundImage: `url("${look.assets}/fond.webp")` }} aria-hidden />

      <div className={styles.stage}>
        {/* eslint-disable-next-line @next/next/no-img-element -- enseigne du jeu, taille fixe */}
        <img className={styles.logo} src="/assets/menu/logo/tidebound-logo.webp" alt="Tidebound" draggable={false} />
        {/* eslint-disable-next-line @next/next/no-img-element -- titre peint */}
        <img className={styles.title} style={{ left: `${look.titleLeft}%` }} src={`${look.assets}/titre.webp`} alt={look.titleAlt} draggable={false} />

        {/* ── Le public ── */}
        {(shown !== null || audience) && (
          <section className={styles.spectators} aria-label="Le public">
            {shown !== null && (
              <p className={styles.viewers}>
                <EyeGlyph />
                <RollingNumber value={shown} className={styles.viewersValue} />
              </p>
            )}
            <p className={styles.viewersLabel}>Spectateurs</p>
            {/* La victoire dit aussi l'humeur de la salle, comme ses planches de référence. */}
            {isVictory && audience && <p className={styles.mood}>{audienceMood(audience.spectacle)}</p>}
            {audience && <p className={styles.spectacle}>Spectacle {audience.spectacle}</p>}
            <span className={styles.flourish} aria-hidden />
          </section>
        )}

        {/* ── Ce qui a pesé ── */}
        {signals.length > 0 && (
          <section className={styles.recap} aria-label="Ce qui a pesé">
            <h2 className={styles.recapTitle}>{signalsTitle}</h2>
            <ul className={styles.signals}>
              {signals.map((signal, index) => (
                <li key={signal.id} data-sign={signal.weight > 0 ? "up" : "down"}>
                  <SignalGlyph index={index} />
                  <span className={styles.signalWeight}>{signal.weight > 0 ? `+${signal.weight}` : `−${Math.abs(signal.weight)}`}</span>
                  <span>{signal.label}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ── Les quêtes ── */}
        {slots.length > 0 && (
          <>
            <span className={styles.rule} aria-hidden />
            <header className={styles.questsHead}>
              <h2 className={styles.questsTitle}>Quêtes</h2>
              <p className={styles.questsSubtitle}>{questsSubtitle}</p>
            </header>
            <ul className={styles.questRow} aria-label="Quêtes de la partie">
              {slots.map((slot, index) => {
                const ratio = Math.min(1, (filled ? slot.after : slot.before) / slot.target);
                return (
                  <li key={slot.key} className={styles.quest} data-done={slot.completed || undefined}>
                    <span className={styles.questMark}>{slot.mark}</span>
                    <span className={styles.questBody}>
                      <span className={styles.questName}>{slot.name}</span>
                      {slot.secondary && <span className={styles.questSecondary}>{slot.secondary}</span>}
                      <span className={styles.questCount}>
                        {Math.min(filled ? slot.after : slot.before, slot.target)}/{slot.target}
                      </span>
                      <span
                        className={styles.questTrack}
                        role="progressbar"
                        aria-valuenow={slot.after}
                        aria-valuemin={0}
                        aria-valuemax={slot.target}
                        aria-label={slot.name}
                      >
                        <span className={styles.questFill} style={{ width: `${ratio * 100}%`, transitionDelay: `${index * FILL_STAGGER_MS}ms` }} />
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </>
        )}

        {/* ── Le gain ── */}
        {reward && (
          <div className={styles.rewards} role="status">
            <span className={styles.rewardXp}>+{reward.xp} XP</span>
            {reward.tides > 0 && (
              <>
                <span className={styles.rewardRule} aria-hidden />
                <span className={styles.rewardTides}>+{reward.tides} Tides</span>
              </>
            )}
            {reward.firstWinOfDay && <span className={styles.rewardNote}>Première victoire du jour</span>}
            {leveledUp && <span className={styles.rewardNote}>Niveau {reward.levelAfter} atteint</span>}
          </div>
        )}

        {/* ── La photo du joueur, collée de travers ── */}
        <figure className={styles.photo} style={windowStyle}>
          <div className={styles.photoWindow}>
            {photo.src && (
              <div className={styles.photoPrint}>
                {/* eslint-disable-next-line @next/next/no-img-element -- illustration locale du joueur */}
                <img src={photo.src} alt="" draggable={false} />
                {photo.debord && !debordFailed && (
                  // eslint-disable-next-line @next/next/no-img-element -- calque de débord de l'avatar Abyssal
                  <img className={styles.photoDebord} src={photo.debord} alt="" draggable={false} onError={() => setDebordFailed(true)} />
                )}
              </div>
            )}
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element -- cadre photo peint, par-dessus l'illustration */}
          <img className={styles.photoFrame} src={`${look.assets}/cadre-photo.webp`} alt="" draggable={false} />
          <figcaption className={styles.photoCaption}>
            <span className={styles.photoName}>{player.name}</span>
            {player.title && <span className={styles.photoTitle}>{player.title}</span>}
          </figcaption>
        </figure>

        {/* ── Les deux boutons peints ── */}
        <nav className={styles.actions} aria-label="Suite">
          <Link href="/" className={styles.buttonBack}>
            <span>Retour au menu</span>
          </Link>
          {exitHref ? (
            <Link href={exitHref} className={styles.buttonNew}>
              <span>Nouvelle partie</span>
            </Link>
          ) : (
            <button type="button" onClick={onExit} className={styles.buttonNew}>
              <span>Nouvelle partie</span>
            </button>
          )}
        </nav>
      </div>
    </div>
  );
}

/** L'œil du compteur de spectateurs, à l'encre. */
function EyeGlyph() {
  return (
    <svg className={styles.eye} viewBox="0 0 48 28" fill="none" aria-hidden>
      <path d="M2 14C8 5 15.5 1.5 24 1.5S40 5 46 14c-6 9-13.5 12.5-22 12.5S8 23 2 14z" stroke="currentColor" strokeWidth={3} strokeLinejoin="round" />
      <circle cx="24" cy="14" r="7.5" stroke="currentColor" strokeWidth={3} />
      <circle cx="24" cy="14" r="3" fill="currentColor" />
    </svg>
  );
}

/**
 * Les petites marques à l'encre devant ce qui a pesé — rose des vents, barre,
 * éclat, coupe —, une par ligne, dans l'ordre de la référence.
 */
function SignalGlyph({ index }: { index: number }) {
  const glyphs = [
    <path key="rose" d="M12 1l2.4 8.6L23 12l-8.6 2.4L12 23l-2.4-8.6L1 12l8.6-2.4z" fill="currentColor" />,
    <g key="barre" stroke="currentColor" strokeWidth={2.2} fill="none">
      <circle cx="12" cy="12" r="6.5" />
      <circle cx="12" cy="12" r="2" fill="currentColor" />
      <path d="M12 1.5v4M12 18.5v4M1.5 12h4M18.5 12h4M4.6 4.6l2.8 2.8M16.6 16.6l2.8 2.8M4.6 19.4l2.8-2.8M16.6 7.4l2.8-2.8" strokeLinecap="round" />
    </g>,
    <path key="eclat" d="M12 2l1.8 7.2L21 12l-7.2 1.8L12 21l-1.8-7.2L3 12l7.2-2.8zM19 3l.7 2.3L22 6l-2.3.7L19 9l-.7-2.3L16 6l2.3-.7z" fill="currentColor" />,
    <path key="coupe" d="M6 2h12v2h3v3c0 3-2 5-4.6 5.4A5 5 0 0 1 13 15.8V19h4v3H7v-3h4v-3.2a5 5 0 0 1-3.4-3.4C5 12 3 10 3 7V4h3zm0 4H5v1c0 1.6.8 2.9 2 3.5zm12 0v4.5c1.2-.6 2-1.9 2-3.5V6z" fill="currentColor" />,
  ];
  return (
    <svg className={styles.signalGlyph} viewBox="0 0 24 24" aria-hidden>
      {glyphs[index % glyphs.length]}
    </svg>
  );
}
