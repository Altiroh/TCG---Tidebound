"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { ARCHETYPE_LABELS, DECK_STYLES, getCardDefinition, type DeckList, type DeckStyleId } from "@/game";
import { nameplateArtUrl } from "@/features/decks/nameplateArt";
import { deckFacts, type DeckSource } from "@/features/match/deckFacts";
import { DifficultyStars } from "@/features/shell/GameIcons";
import styles from "@/features/match/DeckPicker.module.css";
import { playButtonClick, playTabClick } from "@/lib/sound";

/** Emblème d'un style de deck (les six styles, `public/assets/decks/styles`). */
const styleEmblem = (id: DeckStyleId) => `/assets/decks/styles/style-${id}.webp`;

/** Penché de chaque fiche épinglée, en degrés : la table n'est pas une grille. */
const TILTS = [-1.6, 1.1, -0.6, 1.5, -1.2, 0.7, -1.8, 1.3];

/**
 * Famille dominante d'un deck (« Archétype : Cra-Poiscail ») : celle qui
 * compte le plus de cartes. `null` sans famille majoritaire lisible.
 */
function dominantArchetype(cardIds: readonly string[]): string | null {
  const counts = new Map<string, number>();
  for (const id of cardIds) {
    let archetype: string | undefined;
    try {
      archetype = getCardDefinition(id).archetype;
    } catch {
      archetype = undefined;
    }
    if (archetype) counts.set(archetype, (counts.get(archetype) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [archetype, count] of counts) {
    if (count > bestCount) {
      best = archetype;
      bestCount = count;
    }
  }
  return best ? (ARCHETYPE_LABELS[best as keyof typeof ARCHETYPE_LABELS] ?? null) : null;
}

/**
 * CHANGER DE DECK (refonte du 05/10/2026, maquette « table du capitaine ») :
 * une surcouche posée PAR-DESSUS l'écran de lancement, qui reste visible,
 * flouté, derrière.
 *
 * - en haut, le titre sur sa bande de parchemin, les sources (Mes decks,
 *   Préconstruits) sur leurs onglets, puis le filtre par style ;
 * - au milieu, les decks en FICHES ÉPINGLÉES : illustration, nom, style,
 *   difficulté. Un toucher CHOISIT (liseré turquoise), un double toucher
 *   équipe directement ;
 * - en bas, le bandeau du deck choisi — médaillon, nom, nombre de cartes,
 *   famille dominante, style et difficulté — et « Équiper ce deck ».
 *
 * Un deck qui ne se joue pas reste visible, éteint, avec la raison.
 */
export function DeckPicker({
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
  const [chosenId, setChosenId] = useState<string | null>(selectedId);
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

  // Le deck du bandeau : celui qu'on vient de toucher, cherché dans TOUTES
  // les sources — changer d'onglet ne fait pas oublier le choix.
  const chosen = useMemo(() => {
    for (const entry of sources) {
      const deck = entry.decks.find((d) => d.id === chosenId);
      if (deck) return { deck, facts: deckFacts(deck), issue: entry.issueFor(deck) };
    }
    return null;
  }, [sources, chosenId]);
  const chosenArt = chosen ? nameplateArtUrl(chosen.deck.cardIds, chosen.deck.shipId) : null;
  const chosenArchetype = chosen ? dominantArchetype(chosen.deck.cardIds) : null;

  function equip(deck: DeckList, issue: string | null) {
    if (issue) return;
    playButtonClick();
    onPick(deck);
  }

  if (!mounted) return null;
  return createPortal(
    <div className={styles.backdrop} onClick={onClose} role="presentation">
      <div className={styles.picker} role="dialog" aria-modal aria-label="Changer de deck" onClick={(event) => event.stopPropagation()}>
        <button type="button" className={styles.close} onClick={onClose} aria-label="Fermer">
          <svg viewBox="0 0 24 24" aria-hidden>
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>

        <h2 className={styles.title}>Changer de deck</h2>

        <div className={styles.sources} role="tablist" aria-label="Decks">
          {sources.map((entry, index) => (
            <span key={entry.id} className={styles.sourceItem}>
              {index > 0 && <span className={styles.diamond} aria-hidden />}
              <button
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
            </span>
          ))}
        </div>

        <div className={styles.styles} role="radiogroup" aria-label="Type de deck">
          <button type="button" role="radio" aria-checked={style === "tous"} className={styles.chip} onClick={() => setStyle("tous")}>
            <svg viewBox="0 0 24 24" aria-hidden className={styles.anchor}>
              <circle cx="12" cy="4.6" r="2" />
              <path d="M12 6.6v14M7.5 10h9M4 13.5c0 4 3.6 6.9 8 6.9s8-2.9 8-6.9M4 13.5l-1.4 2M4 13.5l2.1.8M20 13.5l1.4 2M20 13.5l-2.1.8" />
            </svg>
            Tous <span className={styles.chipCount}>{withFacts.length}</span>
          </button>
          {DECK_STYLES.map((entry) => (
            <button
              key={entry.id}
              type="button"
              role="radio"
              aria-checked={style === entry.id}
              className={styles.chip}
              disabled={!counts.get(entry.id)}
              onClick={() => {
                playTabClick();
                setStyle(entry.id);
              }}
              title={entry.hint}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- emblème de style local */}
              <img src={styleEmblem(entry.id)} alt="" draggable={false} />
              {entry.label} <span className={styles.chipCount}>{counts.get(entry.id) ?? 0}</span>
            </button>
          ))}
        </div>

        {shown.length === 0 ? (
          <p className={styles.empty}>{source.decks.length === 0 ? "Aucun deck ici pour l'instant." : "Aucun deck de ce type."}</p>
        ) : (
          <ul className={styles.grid}>
            {shown.map(({ deck, facts, issue }, index) => {
              const art = nameplateArtUrl(deck.cardIds, deck.shipId);
              return (
                <li
                  key={deck.id}
                  className={styles.slot}
                  style={{ "--i": Math.min(index, 12), "--tilt": `${TILTS[index % TILTS.length]}deg` } as CSSProperties}
                >
                  <button
                    type="button"
                    className={styles.note}
                    data-selected={deck.id === chosenId || undefined}
                    data-equipped={deck.id === selectedId || undefined}
                    data-issue={issue ? "" : undefined}
                    aria-pressed={deck.id === chosenId}
                    title={issue ?? deck.description}
                    onClick={() => {
                      playTabClick();
                      setChosenId(deck.id);
                    }}
                    onDoubleClick={() => equip(deck, issue)}
                  >
                    <span className={styles.art}>
                      {/* eslint-disable-next-line @next/next/no-img-element -- illustration locale */}
                      {art && <img src={art} alt="" draggable={false} loading="lazy" />}
                    </span>
                    <span className={styles.name}>{deck.name}</span>
                    {facts.styleId ? (
                      <span className={styles.stylePill}>
                        {/* eslint-disable-next-line @next/next/no-img-element -- emblème de style local */}
                        <img src={styleEmblem(facts.styleId)} alt="" draggable={false} />
                        {facts.style.split("/")[0]?.trim()}
                      </span>
                    ) : (
                      <span className={styles.stylePill}>{facts.style}</span>
                    )}
                    <DifficultyStars value={facts.difficulty} className={styles.stars} />
                    {issue && <span className={styles.issue}>{issue}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <section className={styles.detail} aria-label="Deck choisi" data-empty={chosen ? undefined : ""}>
          {chosen ? (
            <>
              <span className={styles.medallion}>
                {/* eslint-disable-next-line @next/next/no-img-element -- illustration locale */}
                {chosenArt && <img src={chosenArt} alt="" draggable={false} />}
              </span>
              <div className={styles.detailMain}>
                <strong className={styles.detailName}>{chosen.deck.name}</strong>
                <span className={styles.detailFact}>
                  <svg viewBox="0 0 24 24" aria-hidden>
                    <rect x="4" y="5" width="11" height="15" rx="1.5" />
                    <path d="M9 3.5h9.5A1.5 1.5 0 0 1 20 5v13" />
                  </svg>
                  {chosen.deck.cardIds.length} cartes
                </span>
                {chosenArchetype && (
                  <span className={styles.detailFact}>
                    <svg viewBox="0 0 24 24" aria-hidden>
                      <path d="M12 3v18M6 7c0 4 2.5 6 6 6s6-2 6-6M6 7V4M18 7V4M9 21h6" />
                    </svg>
                    Archétype : {chosenArchetype}
                  </span>
                )}
              </div>
              <span className={styles.separator} aria-hidden />
              <div className={styles.detailStyle}>
                <span className={styles.detailStyleName}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- emblème de style local */}
                  {chosen.facts.styleId && <img src={styleEmblem(chosen.facts.styleId)} alt="" draggable={false} />}
                  {chosen.facts.style.split("/")[0]?.trim()}
                </span>
                <DifficultyStars value={chosen.facts.difficulty} className={`${styles.stars} ${styles.detailStars}`} />
              </div>
              <div className={styles.equipWrap}>
                <button
                  type="button"
                  className={styles.equip}
                  disabled={Boolean(chosen.issue)}
                  onClick={() => equip(chosen.deck, chosen.issue)}
                >
                  Équiper ce deck
                </button>
                {chosen.issue && <span className={styles.detailIssue}>{chosen.issue}</span>}
              </div>
            </>
          ) : (
            <p className={styles.detailHint}>Touche un deck pour le voir ici.</p>
          )}
        </section>
      </div>
    </div>,
    document.body,
  );
}
