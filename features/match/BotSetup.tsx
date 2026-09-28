"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { DECK_STYLES, deckProfile, deckStyleFromText, type BotDifficulty, type DeckList, type DeckStyleId } from "@/game";
import { DeckBox } from "@/features/decks/DeckBox";
import { nameplateArtUrl } from "@/features/decks/nameplateArt";
import { LEAVE_MS, prefersReducedMotion } from "@/features/match/ModeTable";
import styles from "@/features/match/BotSetup.module.css";
import { playButtonClick, playTabClick } from "@/lib/sound";

export interface BotLevel {
  id: BotDifficulty;
  label: string;
  description: string;
}

/**
 * Qui est en face : le BOT (son niveau se règle ici), ou un adversaire EN
 * LIGNE — inconnu jusqu'à l'appariement, d'où le point d'interrogation.
 */
export type SetupFoe =
  | {
      kind: "bot";
      levels: readonly BotLevel[];
      difficulty: BotDifficulty;
      onDifficulty: (difficulty: BotDifficulty) => void;
      note?: string;
    }
  | { kind: "online"; note?: string };

/** Durée du geste de la poignée (`BotSetup.module.css`, `pull`). */
const PULL_MS = 720;

/** Une source de decks du panneau « Changer de deck » (Mes decks, Préconstruits). */
export interface DeckSource {
  id: string;
  label: string;
  decks: readonly DeckList[];
  /** Pourquoi un deck n'est pas jouable — la tuile reste visible, éteinte, avec la raison. */
  issueFor: (deck: DeckList) => string | null;
}

/** Style (énumération), libellé écrit et difficulté (1 à 5) d'un deck — écrits pour le catalogue, lus dans la liste sinon. */
export function deckFacts(deck: DeckList): { styleId: DeckStyleId | null; style: string; difficulty: number } {
  const meta = deck as Partial<{ style: string; difficulty: number }>;
  if (typeof meta.style === "string" && typeof meta.difficulty === "number") {
    return { styleId: deckStyleFromText(meta.style), style: meta.style, difficulty: meta.difficulty };
  }
  const profile = deckProfile(deck.cardIds);
  return { styleId: profile?.styleId ?? null, style: profile?.style ?? "Deck personnel", difficulty: profile?.difficulty ?? 3 };
}

function Stars({ value }: { value: number }) {
  const filled = Math.min(5, Math.max(0, Math.round(value)));
  return (
    <span className={styles.stars} role="img" aria-label={`Difficulté ${filled} sur 5`}>
      {Array.from({ length: 5 }, (_, index) => (
        <svg key={index} viewBox="0 0 24 24" data-on={index < filled || undefined} aria-hidden>
          <path d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4L2.8 9.5l6.4-.8z" />
        </svg>
      ))}
    </span>
  );
}

/**
 * JOUER → CONTRE UN BOT, ou EN LIGNE (recherche rapide, `foe.kind`), sur la même table que le choix du mode (retour du
 * 28/09/2026) : les cartes des modes sont parties, les éléments de cette
 * étape arrivent.
 *
 *  - en haut, l'illustration du niveau choisi, qui ÉVOLUE avec lui ;
 *  - à gauche, le niveau (trois plaques qui s'enfoncent), puis le deck,
 *    présenté en boîte comme au Market — le deck par défaut du joueur,
 *    présélectionné — et « Changer de deck », qui ouvre un panneau latéral ;
 *  - à droite, l'adversaire en photo : le bot du niveau choisi, ou — en
 *    ligne — un point d'interrogation, puisqu'on ne sait pas encore qui ;
 *  - en haut à droite, la poignée qui lance la partie (ou la recherche).
 */
export function BotSetup({
  foe,
  deck,
  sources,
  onDeck,
  onBack,
  backRef,
  onLaunch,
  starting,
  error,
}: {
  foe: SetupFoe;
  deck: DeckList | null;
  sources: readonly DeckSource[];
  onDeck: (deck: DeckList) => void;
  onBack: () => void;
  /** Reçoit le retour animé : la flèche du bandeau ramène au choix du mode (et non au menu). */
  backRef?: { current: (() => void) | null };
  onLaunch: () => void;
  starting: boolean;
  error: string | null;
}) {
  const [picking, setPicking] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const levels = foe.kind === "bot" ? foe.levels : [];
  const level = foe.kind === "bot" ? (levels.find((entry) => entry.id === foe.difficulty) ?? levels[0]!) : null;
  const levelIndex = level ? Math.max(0, levels.indexOf(level)) : 0;
  const facts = deck ? deckFacts(deck) : null;
  const deckIssue = deck ? (sources.map((source) => (source.decks.includes(deck) ? source.issueFor(deck) : null)).find(Boolean) ?? null) : null;

  function back() {
    if (leaving) return;
    playButtonClick();
    setLeaving(true);
    window.setTimeout(onBack, prefersReducedMotion() ? 0 : LEAVE_MS);
  }
  if (backRef) backRef.current = back;

  // La poignée : tirée, elle descend et remonte ; la partie part pendant le retour.
  const [pulled, setPulled] = useState(false);
  const canLaunch = Boolean(deck) && !deckIssue && !starting && !pulled;
  function pull() {
    if (!canLaunch) return;
    playButtonClick();
    setPulled(true);
    window.setTimeout(onLaunch, prefersReducedMotion() ? 0 : PULL_MS * 0.55);
    window.setTimeout(() => setPulled(false), prefersReducedMotion() ? 0 : PULL_MS);
  }

  const skulls = levelIndex + 1;

  return (
    <div
      className={styles.scene}
      data-leaving={leaving || undefined}
      data-level={level?.id ?? "online"}
      style={{ "--level": levelIndex } as React.CSSProperties}
    >

      {/* ── En haut, à droite de la lanterne : le niveau du bot, trois plaques qui s'enfoncent ── */}
      {foe.kind === "bot" && level ? (
        <section className={styles.levelsPanel} aria-label="Niveau du bot">
          <h2 className={styles.levelsTitle}>Niveau du bot</h2>
          <div className={styles.levels} role="radiogroup" aria-label="Niveau du bot">
            {levels.map((entry) => (
              <button
                key={entry.id}
                type="button"
                role="radio"
                aria-checked={entry.id === level.id}
                className={styles.levelButton}
                data-level={entry.id}
                onClick={() => {
                  playTabClick();
                  foe.onDifficulty(entry.id);
                }}
                title={entry.description}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- plaque peinte (nom du niveau compris) */}
                <img src={`/assets/play/bot-level/plaque-${entry.id}.webp`} alt="" draggable={false} />
                <span className={styles.srOnly}>{entry.label}</span>
              </button>
            ))}
          </div>
        </section>
      ) : (
        // En ligne : rien à régler en face — le titre seul, sur la même banderole.
        <section className={styles.levelsPanel} aria-label="Partie en ligne">
          <h2 className={styles.levelsTitle}>Recherche rapide</h2>
          <p className={styles.levelsNote}>Partie classée · XP, Tides et quêtes</p>
        </section>
      )}

      {/* ── À gauche : ton deck, en boîte, sa plaque, et « Changer de deck » ── */}
      <section className={styles.deckSide} aria-label="Ton deck">
        {deck ? (
          <>
            <span className={styles.deckStack}>
              <span className={styles.deckGhost} aria-hidden />
              <span className={styles.deckGhost} aria-hidden />
              <DeckBox art={nameplateArtUrl(deck.cardIds, deck.shipId)} facing="right" className={styles.deckBox} />
            </span>
            <span className={styles.deckPlate}>
              <span className={styles.deckName}>{deck.name}</span>
              <span className={styles.deckStyle}>
                {facts?.styleId && (
                  // eslint-disable-next-line @next/next/no-img-element -- emblème de style local
                  <img src={`/assets/decks/styles/style-${facts.styleId}.webp`} alt="" draggable={false} />
                )}
                {facts?.style.split("/")[0]?.trim()} · {deck.cardIds.length} cartes
              </span>
            </span>
          </>
        ) : (
          <p className={styles.noDeck}>Aucun deck choisi.</p>
        )}
        <button
          type="button"
          className={styles.changeDeck}
          onClick={() => {
            playButtonClick();
            setPicking(true);
          }}
        >
          <svg viewBox="0 0 24 24" aria-hidden>
            <rect x="4" y="5" width="11" height="15" rx="1.5" />
            <path d="M9 3.5h9.5A1.5 1.5 0 0 1 20 5v13" fill="none" />
          </svg>
          Changer de deck
        </button>
      </section>

      {/* ── Au centre : VS ── */}
      {/* eslint-disable-next-line @next/next/no-img-element -- VS peint */}
      <img className={styles.versus} src="/assets/play/mode/vs.webp" alt="" aria-hidden draggable={false} />

      {/*
        ── À droite : l'adversaire, en PHOTO (le polaroid du profil joueur,
        `profile/photo-frame`) — même taille et même distance du VS que ton
        deck, en miroir ; sous la photo, ce qu'il faut savoir de lui.
      */}
      {foe.kind === "bot" && level ? (
        <aside className={styles.foe} aria-label={`Adversaire : bot ${level.label.toLowerCase()}`} aria-live="polite">
          <span className={styles.polaroid}>
            <span className={styles.polaroidWindow}>
              {levels.map((entry) => (
                <span
                  key={entry.id}
                  className={styles.foeArtLayer}
                  data-on={entry.id === level.id || undefined}
                  style={{ backgroundImage: `url("/assets/play/bot-level/illustration-${entry.id}.webp")` }}
                />
              ))}
            </span>
            {/* eslint-disable-next-line @next/next/no-img-element -- cadre photo local */}
            <img className={styles.polaroidFrame} src="/assets/profile/photo-frame.webp" alt="" draggable={false} />
            <span className={styles.polaroidCaption}>
              <span className={styles.foeName}>Bot {level.label.toLowerCase()}</span>
              <span className={styles.skulls} role="img" aria-label={`Difficulté ${skulls} sur 3`}>
                {Array.from({ length: skulls }, (_, index) => (
                  <span key={index} style={{ backgroundImage: `url("/assets/play/bot-level/plaque-${level.id}.webp")` }} />
                ))}
              </span>
            </span>
          </span>
          <div className={styles.foeCard}>
            <p className={styles.foeText}>{level.description}</p>
            <p className={styles.foeFact}>
              <span>Son deck</span>
              <strong>
                <svg viewBox="0 0 24 24" aria-hidden>
                  <rect x="5" y="4" width="12" height="16" rx="1.5" />
                </svg>
                Tiré au sort
              </strong>
            </p>
            {foe.note && <p className={styles.foeNote}>{foe.note}</p>}
          </div>
        </aside>
      ) : (
        // En ligne : l'adversaire n'existe pas encore — une photo voilée, un point d'interrogation.
        <aside className={styles.foe} aria-label="Adversaire : inconnu">
          <span className={styles.polaroid}>
            <span className={styles.polaroidWindow}>
              <span className={styles.foeArtLayer} data-on data-unknown style={{ backgroundImage: 'url("/assets/play/mode/carte-en-ligne.webp")' }} />
              <span className={styles.foeMystery} aria-hidden>
                ?
              </span>
            </span>
            {/* eslint-disable-next-line @next/next/no-img-element -- cadre photo local */}
            <img className={styles.polaroidFrame} src="/assets/profile/photo-frame.webp" alt="" draggable={false} />
            <span className={styles.polaroidCaption}>
              <span className={styles.foeName}>Adversaire ?</span>
            </span>
          </span>
          <div className={styles.foeCard}>
            <p className={styles.foeText}>Le premier capitaine en file sera ton adversaire.</p>
            <p className={styles.foeFact}>
              <span>Son deck</span>
              <strong>
                <svg viewBox="0 0 24 24" aria-hidden>
                  <rect x="5" y="4" width="12" height="16" rx="1.5" />
                </svg>
                Surprise
              </strong>
            </p>
            {foe.note && <p className={styles.foeNote}>{foe.note}</p>}
          </div>
        </aside>
      )}

      {/* ── En bas, au centre : le lancement ── */}
      {/*
        Au survol de la poignée, tout l'écran se brouille DERRIÈRE elle
        (voile flou) : le regard va à la poignée. Transition douce dans les
        deux sens.
      */}
      <span className={styles.leverVeil} aria-hidden />
      {/*
        ── En haut à droite : la POIGNÉE « Lancer la partie », pendue à ses
        chaînes (`play/mode/poignee-lancer`). On la TIRE : elle descend,
        remonte — et la partie part. Seule la poignée est cliquable.
      */}
      <div className={styles.lever} data-pulled={pulled || undefined} data-disabled={!canLaunch || undefined}>
        {/* eslint-disable-next-line @next/next/no-img-element -- poignée peinte */}
        <img className={styles.leverArt} src="/assets/play/mode/poignee-lancer.webp" alt="" draggable={false} />
        <button type="button" className={styles.leverHandle} onClick={pull} disabled={!canLaunch} aria-label={starting ? "Préparation de la partie" : foe.kind === "online" ? "Chercher un adversaire" : "Lancer la partie"} />
      </div>
      {(error || deckIssue) && (
        <p className={styles.error} role="alert">
          {error ?? deckIssue}
        </p>
      )}

      {picking && (
        <DeckPicker
          sources={sources}
          selectedId={deck?.id ?? null}
          onPick={(picked) => {
            onDeck(picked);
            setPicking(false);
          }}
          onClose={() => setPicking(false)}
        />
      )}
    </div>
  );
}

/**
 * CHANGER DE DECK : un panneau à gauche de l'écran, sur son décor, comme la
 * scène des Mécènes. Les sources (Mes decks, Préconstruits) en onglets, un
 * filtre par type de deck (les six styles et leurs emblèmes), les decks en
 * boîtes. Un deck qui ne se joue pas reste visible, éteint, avec la raison.
 */
function DeckPicker({
  sources,
  selectedId,
  onPick,
  onClose,
}: {
  sources: readonly DeckSource[];
  selectedId: string | null;
  onPick: (deck: DeckList) => void;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const initialSource =
    sources.find((source) => source.decks.some((deck) => deck.id === selectedId)) ?? sources.find((source) => source.decks.length > 0) ?? sources[0]!;
  const [sourceId, setSourceId] = useState(initialSource.id);
  const [style, setStyle] = useState<DeckStyleId | "tous">("tous");
  const source = sources.find((entry) => entry.id === sourceId) ?? sources[0]!;

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const withFacts = useMemo(() => source.decks.map((deck) => ({ deck, facts: deckFacts(deck), issue: source.issueFor(deck) })), [source]);
  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of withFacts) if (entry.facts.styleId) map.set(entry.facts.styleId, (map.get(entry.facts.styleId) ?? 0) + 1);
    return map;
  }, [withFacts]);
  const shown = style === "tous" ? withFacts : withFacts.filter((entry) => entry.facts.styleId === style);

  if (!mounted) return null;
  return createPortal(
    <div className={styles.pickerBackdrop} onClick={onClose} role="presentation">
      <div className={styles.picker} role="dialog" aria-modal aria-label="Changer de deck" onClick={(event) => event.stopPropagation()}>
        <header className={styles.pickerHead}>
          <h2 className={styles.pickerTitle}>Changer de deck</h2>
          <button type="button" className={styles.pickerClose} onClick={onClose} aria-label="Fermer">
            ×
          </button>
        </header>

        <div className={styles.sourceTabs} role="tablist" aria-label="Decks">
          {sources.map((entry) => (
            <button
              key={entry.id}
              type="button"
              role="tab"
              aria-selected={entry.id === source.id}
              className={styles.sourceTab}
              onClick={() => {
                playTabClick();
                setSourceId(entry.id);
                setStyle("tous");
              }}
            >
              {entry.label} <span className={styles.count}>{entry.decks.length}</span>
            </button>
          ))}
        </div>

        <div className={styles.styleFilter} role="radiogroup" aria-label="Type de deck">
          <button type="button" role="radio" aria-checked={style === "tous"} className={styles.styleChip} onClick={() => setStyle("tous")}>
            Tous <span className={styles.count}>{withFacts.length}</span>
          </button>
          {DECK_STYLES.map((entry) => (
            <button
              key={entry.id}
              type="button"
              role="radio"
              aria-checked={style === entry.id}
              className={styles.styleChip}
              disabled={!counts.get(entry.id)}
              onClick={() => {
                playTabClick();
                setStyle(entry.id);
              }}
              title={entry.hint}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- emblème de style local */}
              <img src={`/assets/decks/styles/style-${entry.id}.webp`} alt="" draggable={false} />
              {entry.label} <span className={styles.count}>{counts.get(entry.id) ?? 0}</span>
            </button>
          ))}
        </div>

        {shown.length === 0 ? (
          <p className={styles.pickerEmpty}>{source.decks.length === 0 ? "Aucun deck ici pour l'instant." : "Aucun deck de ce type."}</p>
        ) : (
          <ul className={styles.pickerGrid}>
            {shown.map(({ deck, facts, issue }) => (
              <li key={deck.id}>
                <button
                  type="button"
                  className={styles.tile}
                  data-selected={deck.id === selectedId || undefined}
                  disabled={Boolean(issue)}
                  title={issue ?? deck.description}
                  onClick={() => {
                    playButtonClick();
                    onPick(deck);
                  }}
                >
                  <DeckBox art={nameplateArtUrl(deck.cardIds, deck.shipId)} facing="right" className={styles.tileBox} />
                  <span className={styles.tileName}>{deck.name}</span>
                  <span className={styles.tileStyle}>{facts.style.split("/")[0]?.trim()}</span>
                  <Stars value={facts.difficulty} />
                  {issue && <span className={styles.tileIssue}>{issue}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>,
    document.body,
  );
}
