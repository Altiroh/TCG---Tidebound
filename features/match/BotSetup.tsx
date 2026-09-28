"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { DECK_STYLES, deckProfile, deckStyleFromText, type BotDifficulty, type DeckList, type DeckStyleId } from "@/game";
import { DeckBox } from "@/features/decks/DeckBox";
import { nameplateArtUrl } from "@/features/decks/nameplateArt";
import { LEAVE_MS, prefersReducedMotion } from "@/features/match/ModeTable";
import { shipNameOf } from "@/features/ships/ShipPortrait";
import styles from "@/features/match/BotSetup.module.css";
import { playButtonClick, playTabClick } from "@/lib/sound";

export interface BotLevel {
  id: BotDifficulty;
  label: string;
  description: string;
}

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
 * JOUER → CONTRE UN BOT, sur la même table que le choix du mode (retour du
 * 28/09/2026) : les cartes des modes sont parties, les éléments de cette
 * étape arrivent.
 *
 *  - en haut, l'illustration du niveau choisi, qui ÉVOLUE avec lui ;
 *  - à gauche, le niveau (trois plaques qui s'enfoncent), puis le deck,
 *    présenté en boîte comme au Market — le deck par défaut du joueur,
 *    présélectionné — et « Changer de deck », qui ouvre un panneau latéral ;
 *  - à droite, le récapitulatif de la partie et le bouton de lancement.
 */
export function BotSetup({
  levels,
  difficulty,
  onDifficulty,
  deck,
  sources,
  onDeck,
  onBack,
  onLaunch,
  starting,
  error,
  note,
}: {
  levels: readonly BotLevel[];
  difficulty: BotDifficulty;
  onDifficulty: (difficulty: BotDifficulty) => void;
  deck: DeckList | null;
  sources: readonly DeckSource[];
  onDeck: (deck: DeckList) => void;
  onBack: () => void;
  onLaunch: () => void;
  starting: boolean;
  error: string | null;
  note?: string;
}) {
  const [picking, setPicking] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const level = levels.find((entry) => entry.id === difficulty) ?? levels[0]!;
  const levelIndex = Math.max(0, levels.indexOf(level));
  const facts = deck ? deckFacts(deck) : null;
  const deckIssue = deck ? (sources.map((source) => (source.decks.includes(deck) ? source.issueFor(deck) : null)).find(Boolean) ?? null) : null;

  function back() {
    if (leaving) return;
    playButtonClick();
    setLeaving(true);
    window.setTimeout(onBack, prefersReducedMotion() ? 0 : LEAVE_MS);
  }

  return (
    <div className={styles.scene} data-leaving={leaving || undefined} data-level={level.id}>
      <button type="button" className={styles.back} onClick={back}>
        <span aria-hidden>←</span> Changer de mode
      </button>

      {/* ── À gauche : le niveau, puis le deck ── */}
      <section className={styles.left}>
        <h2 className={styles.heading}>Niveau du bot</h2>
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
                onDifficulty(entry.id);
              }}
              title={entry.description}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- plaque peinte (nom du niveau compris) */}
              <img src={`/assets/play/bot-level/plaque-${entry.id}.webp`} alt="" draggable={false} />
              <span className={styles.srOnly}>{entry.label}</span>
            </button>
          ))}
        </div>

        <h2 className={styles.heading}>Ton deck</h2>
        <div className={styles.deck}>
          {deck ? (
            <>
              <DeckBox art={nameplateArtUrl(deck.cardIds, deck.shipId)} facing="right" className={styles.deckBox} />
              <span className={styles.deckPlate}>
                <span className={styles.deckName}>{deck.name}</span>
                <span className={styles.deckStyle}>
                  {facts?.styleId && (
                    // eslint-disable-next-line @next/next/no-img-element -- emblème de style local
                    <img src={`/assets/decks/styles/style-${facts.styleId}.webp`} alt="" draggable={false} />
                  )}
                  {facts?.style.split("/")[0]?.trim()}
                </span>
              </span>
            </>
          ) : (
            <p className={styles.noDeck}>Aucun deck choisi.</p>
          )}
        </div>
        <button
          type="button"
          className={styles.changeDeck}
          onClick={() => {
            playButtonClick();
            setPicking(true);
          }}
        >
          Changer de deck
        </button>
      </section>

      {/* ── À droite : la partie — l'adversaire en grand, le récapitulatif, le lancement ── */}
      <aside className={styles.recap} aria-label="Récapitulatif de la partie" style={{ "--level": levelIndex } as React.CSSProperties}>
        <h2 className={styles.recapTitle}>
          <span>Contre un bot</span> La partie
        </h2>
        <div className={styles.recapBody}>
          <div className={styles.foe} aria-live="polite" aria-label={`Bot ${level.label}`}>
            <span className={styles.aura} aria-hidden />
            {/* L'illustration du niveau (`play/bot-level/`) : les trois sont posées, seule la choisie se voit. */}
            <span className={styles.illustration} aria-hidden>
              {levels.map((entry) => (
                // eslint-disable-next-line @next/next/no-img-element -- illustration locale
                <img
                  key={entry.id}
                  src={`/assets/play/bot-level/illustration-${entry.id}.webp`}
                  alt=""
                  draggable={false}
                  data-on={entry.id === level.id || undefined}
                />
              ))}
            </span>
          </div>
          <dl className={styles.facts}>
            <div className={styles.fact}>
              <dt>Adversaire</dt>
              <dd>
                <span>
                  <strong>Bot {level.label.toLowerCase()}</strong>
                  <small>{level.description}</small>
                </span>
              </dd>
            </div>
            <div className={styles.fact}>
              <dt>Son deck</dt>
              <dd>
                <span>
                  <strong>Tiré au sort</strong>
                  <small>Découvert au lancement, parmi les préconstruits.</small>
                </span>
              </dd>
            </div>
            <div className={styles.fact}>
              <dt>Ton deck</dt>
              <dd>
                {deck && facts ? (
                  <span>
                    <strong>{deck.name}</strong>
                    <small>
                      {shipNameOf(deck.shipId)} · {deck.cardIds.length} cartes
                    </small>
                    <Stars value={facts.difficulty} />
                  </span>
                ) : (
                  <span>
                    <strong>À choisir</strong>
                  </span>
                )}
              </dd>
            </div>
            <div className={styles.fact}>
              <dt>Gains</dt>
              <dd>
                <span>
                  <strong>XP et quêtes</strong>
                  {note && <small>{note}</small>}
                </span>
              </dd>
            </div>
          </dl>
        </div>
        {(error || deckIssue) && (
          <p className={styles.error} role="alert">
            {error ?? deckIssue}
          </p>
        )}
        <button type="button" className={styles.launch} onClick={onLaunch} disabled={!deck || Boolean(deckIssue) || starting}>
          {starting ? "Préparation…" : "Lancer la partie"}
        </button>
      </aside>

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
