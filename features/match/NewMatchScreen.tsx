"use client";

import { useMemo, useState } from "react";
import {
  BORROWED_DECKS,
  PRECON_DECKS,
  RULES,
  validateDeckList,
  type BotDifficulty,
  type DeckList,
} from "@/game";
import Link from "next/link";
import { DeckCarousel } from "@/features/match/DeckCarousel";
import { nameplateArtUrl } from "@/features/decks/nameplateArt";
import { ArtPlate } from "@/features/shell/ArtPlate";
import { GameScreen } from "@/features/shell/GameScreen";
import { shipNameOf } from "@/features/ships/ShipPortrait";
import game from "@/features/shell/GameScreen.module.css";
import styles from "@/features/match/NewMatch.module.css";
import { playButtonClick } from "@/lib/sound";

export type MatchOpponent = { type: "pvp" } | { type: "bot"; difficulty: BotDifficulty };

interface NewMatchScreenProps {
  onStart: (deck1: DeckList, deck2: DeckList, opponent: MatchOpponent) => void | Promise<void>;
  /** Démarrage en cours (création d'une partie serveur) : le bouton est désactivé. */
  starting?: boolean;
  error?: string | null;
  /** Précision affichée en mode bot (partie serveur récompensée, ou entraînement local). */
  botNote?: string;
  /** Decks personnels du joueur connecté (`listPlayerDeckLists`) — vide hors connexion. */
  personalDecks?: readonly DeckList[];
  /**
   * Decks FOURNIS par le jeu que ce joueur a débloqués : son deck
   * d'emprunt et ses préconstruits payés en Jetons. Les autres restent
   * affichés, éteints, avec la raison — un rayon vide n'apprendrait rien
   * (Notion « Progression joueur » §4).
   */
  unlockedDeckIds?: readonly string[];
  /** Compte connecté — dit quoi afficher quand l'onglet « Mes decks » est vide. */
  isSignedIn?: boolean;
}

/**
 * Deck du BOT : toujours tiré au sort, jamais choisi — on ne règle que le
 * sien, on découvre ce qui arrive en face. Tirage au LANCEMENT et non à
 * l'affichage, pour que deux parties d'affilée donnent bien deux
 * adversaires différents.
 *
 * Tiré parmi TOUS les decks fournis, y compris ceux que le joueur n'a pas
 * débloqués : l'adversaire n'est pas limité par la collection du joueur.
 *
 * `Math.random` est ici un choix d'INTERFACE, pas un aléa de moteur : il
 * ne touche pas `GameState.rngState`, qui doit rester déterministe.
 */
const BOT_DECK_POOL: readonly DeckList[] = [...BORROWED_DECKS, ...PRECON_DECKS];

function pickRandomDeck(): DeckList {
  return BOT_DECK_POOL[Math.floor(Math.random() * BOT_DECK_POOL.length)]!;
}

const BOT_DIFFICULTIES: { id: BotDifficulty; label: string; description: string }[] = [
  { id: "facile", label: "Facile", description: "Joue quasiment au hasard, évite juste les pires coups." },
  { id: "moyen", label: "Moyen", description: "Vise généralement le meilleur coup, avec des erreurs occasionnelles." },
  { id: "difficile", label: "Difficile", description: "Cherche systématiquement le meilleur coup possible." },
];

type Mode = "pvp" | "bot";
/** 1 : mode · 2 : deck du joueur 1 (ou le sien contre le bot) · 3 : deck du joueur 2 (local à deux seulement). */
type Step = 1 | 2 | 3;

/** Les onglets de la sélection de deck, dans l'ordre de lecture. */
type DeckTab = "mine" | "borrowed" | "test";

interface DeckTabDef {
  id: DeckTab;
  label: string;
  hint: string;
  decks: readonly DeckList[];
  /** Pourquoi un deck n'est pas jouable — la tuile reste visible, éteinte, avec la raison. */
  issueFor: (deck: DeckList) => string | null;
}

/** Style et difficulté des listes du jeu — un deck personnel n'en a pas. */
function catalogMeta(deck: DeckList): { style: string; difficulty: number } | null {
  const meta = deck as Partial<{ style: string; difficulty: number }>;
  return typeof meta.style === "string" && typeof meta.difficulty === "number" ? { style: meta.style, difficulty: meta.difficulty } : null;
}

/**
 * Jouer — un parcours en étapes, pas un formulaire : d'abord le mode (en
 * ligne, bientôt ; local à deux ; contre un bot), puis le deck, choisi par
 * son Navire. En local à deux, chaque joueur choisit le sien à tour de rôle.
 *
 * Les decks personnels sont proposés s'ils sont jouables
 * (`validateDeckList`, la même règle que le serveur) ; les autres restent
 * visibles, éteints, avec la raison. Contre le bot, l'adversaire est tiré
 * au sort au lancement parmi les listes du jeu.
 */
export function NewMatchScreen({
  onStart,
  starting = false,
  error = null,
  botNote,
  personalDecks = [],
  unlockedDeckIds = [],
  isSignedIn = false,
}: NewMatchScreenProps) {
  const [step, setStep] = useState<Step>(1);
  const [mode, setMode] = useState<Mode>("bot");
  const [botDifficulty, setBotDifficulty] = useState<BotDifficulty>("moyen");
  const [deck1, setDeck1] = useState<DeckList | null>(null);
  const [deck2, setDeck2] = useState<DeckList | null>(null);

  const personalValidity = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const deck of personalDecks) {
      const result = validateDeckList(deck);
      map.set(deck.id, result.ok ? null : result.error);
    }
    return map;
  }, [personalDecks]);

  const unlocked = useMemo(() => new Set(unlockedDeckIds), [unlockedDeckIds]);

  const tabs: DeckTabDef[] = useMemo(
    () => [
      {
        id: "mine",
        label: "Mes decks",
        hint: `Tes decks montés — ${RULES.DECK_SIZE_MIN} à ${RULES.DECK_SIZE_MAX} cartes pour être jouables.`,
        decks: personalDecks,
        issueFor: (deck) => personalValidity.get(deck.id) ?? null,
      },
      {
        id: "borrowed",
        label: "Deck d'emprunt",
        hint: "Cartes prêtées tant que tu ne les possèdes pas.",
        decks: BORROWED_DECKS,
        // Les deux autres ne sont pas « verrouillés » : ils ne sont simplement pas le sien.
        issueFor: (deck) => (unlocked.has(deck.id) ? null : "Pas ton deck d'emprunt — il se choisit une seule fois, dans Decks."),
      },
      {
        // TEMPORAIRE : toutes les listes d'archétype, ouvertes pour tester.
        // Le serveur les accepte déjà toutes (`findCatalogDeck`).
        id: "test",
        label: "Decks de test",
        hint: "Listes d'archétype ouvertes le temps des essais.",
        decks: PRECON_DECKS,
        issueFor: () => null,
      },
    ],
    [personalDecks, personalValidity, unlocked]
  );
  // Premier onglet utile : ses decks s'il en a, sinon l'emprunt.
  const [deckTab, setDeckTab] = useState<DeckTab>(() => (personalDecks.length > 0 ? "mine" : "borrowed"));
  const activeTab = tabs.find((tab) => tab.id === deckTab) ?? tabs[0]!;

  const current = step === 3 ? deck2 : deck1;
  const setCurrent = step === 3 ? setDeck2 : setDeck1;

  function chooseMode(next: Mode) {
    playButtonClick();
    setMode(next);
    setStep(2);
  }

  function handleLaunch() {
    if (!deck1) return;
    if (mode === "pvp") {
      if (step === 2) {
        playButtonClick();
        setStep(3);
        return;
      }
      if (!deck2) return;
      playButtonClick();
      void onStart(deck1, deck2, { type: "pvp" });
      return;
    }
    playButtonClick();
    // Contre un bot, le tirage a lieu ICI — au lancement, pas à l'affichage : relancer une partie change d'adversaire.
    void onStart(deck1, pickRandomDeck(), { type: "bot", difficulty: botDifficulty });
  }

  const stepLabels: string[] = mode === "pvp" ? ["Mode", "Deck du joueur 1", "Deck du joueur 2"] : ["Mode", "Ton deck"];
  const canLaunch = step === 3 ? deck2 !== null : deck1 !== null;
  const launchLabel = mode === "pvp" && step === 2 ? "Deck du joueur 2 →" : starting ? "Préparation de la partie…" : "Lancer la partie";

  return (
    <GameScreen active="partie" nav="minimal">
      <div className={game.content}>
        <div className={game.contentWide}>
          <div className={game.pageHead}>
            <div>
              <p className={game.eyebrow}>Jouer</p>
              <h1 className={game.title}>
                {step === 1 ? "Choisis un mode" : step === 3 ? "Joueur 2 — choisis ton deck" : mode === "pvp" ? "Joueur 1 — choisis ton deck" : "Choisis ton deck"}
              </h1>
            </div>
            <ol className={styles.steps} aria-label="Étapes">
              {stepLabels.map((label, index) => {
                const number = (index + 1) as Step;
                return (
                  <li key={label} className={`${styles.step} ${number === step ? styles.stepActive : number < step ? styles.stepDone : ""}`}>
                    {index > 0 && <span className={styles.stepSep} aria-hidden />}
                    <span className={styles.stepIndex}>{number}</span>
                    {label}
                  </li>
                );
              })}
            </ol>
          </div>

          {step === 1 ? (
            <div className={styles.modes}>
              <div className={`${game.tileDisabled} ${styles.mode}`} aria-disabled title="Bientôt disponible">
                <span className={styles.modeMark} aria-hidden>
                  <svg viewBox="0 0 24 24" width="22" height="22" fill="none">
                    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth={1.5} />
                    <path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18" stroke="currentColor" strokeWidth={1.3} />
                  </svg>
                </span>
                <span className={styles.modeTitle}>En ligne</span>
                <span className={styles.modeText}>Affronte un autre joueur à distance, partie arbitrée par le serveur.</span>
                <span className={styles.modeFoot}>
                  <span className={game.tag}>Bientôt disponible</span>
                </span>
              </div>

              <button type="button" className={`${game.tile} ${styles.mode}`} onClick={() => chooseMode("pvp")}>
                <span className={styles.modeMark} aria-hidden>
                  <svg viewBox="0 0 24 24" width="22" height="22" fill="none">
                    <circle cx="8" cy="9" r="3" stroke="currentColor" strokeWidth={1.5} />
                    <circle cx="16" cy="9" r="3" stroke="currentColor" strokeWidth={1.5} />
                    <path d="M2.5 20c.6-3.2 2.7-5 5.5-5s4.9 1.8 5.5 5M10.5 20c.6-3.2 2.7-5 5.5-5s4.9 1.8 5.5 5" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
                  </svg>
                </span>
                <span className={styles.modeTitle}>Local — joueur contre joueur</span>
                <span className={styles.modeText}>Deux joueurs sur le même écran, à tour de rôle. Chacun choisit son deck.</span>
                <span className={styles.modeFoot}>
                  <span className={game.tagCyan}>Sans XP</span>
                  <span className={game.link}>Choisir →</span>
                </span>
              </button>

              <button type="button" className={`${game.tile} ${styles.mode}`} onClick={() => chooseMode("bot")}>
                <span className={styles.modeMark} aria-hidden>
                  <svg viewBox="0 0 24 24" width="22" height="22" fill="none">
                    <rect x="4" y="7" width="16" height="12" rx="3" stroke="currentColor" strokeWidth={1.5} />
                    <path d="M12 3v4M9 13h.01M15 13h.01M9 16h6" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" />
                  </svg>
                </span>
                <span className={styles.modeTitle}>Contre un bot</span>
                <span className={styles.modeText}>Trois niveaux de difficulté. Le deck adverse est tiré au sort au lancement.</span>
                <span className={styles.modeFoot}>
                  <span className={game.tagBrass}>XP et quêtes</span>
                  <span className={game.link}>Choisir →</span>
                </span>
              </button>
            </div>
          ) : (
            <>
              <div>
                <button
                  type="button"
                  className={game.link}
                  onClick={() => {
                    playButtonClick();
                    setStep(step === 3 ? 2 : 1);
                  }}
                >
                  <span aria-hidden>←</span> {step === 3 ? "Deck du joueur 1" : "Changer de mode"}
                </button>
              </div>

              {mode === "bot" && step === 2 && (
                <section className={`${game.panel} ${styles.group}`} style={{ padding: "clamp(12px, 1.2vw, 18px)" }}>
                  <h2 className={game.sectionTitle}>Difficulté du bot</h2>
                  <div className={styles.difficulty} role="radiogroup" aria-label="Difficulté du bot">
                    {BOT_DIFFICULTIES.map((d) => (
                      <button
                        key={d.id}
                        type="button"
                        role="radio"
                        aria-checked={botDifficulty === d.id}
                        className={botDifficulty === d.id ? styles.difficultyChipActive : styles.difficultyChip}
                        onClick={() => {
                          playButtonClick();
                          setBotDifficulty(d.id);
                        }}
                      >
                        <span className={styles.difficultyLabel}>{d.label}</span>
                        <span className={styles.difficultyText}>{d.description}</span>
                      </button>
                    ))}
                  </div>
                  {botNote && <p className={game.muted}>{botNote}</p>}
                </section>
              )}

              {/* Les decks par onglet, en rangée qui défile : les mêmes plaques
                  que l'écran Decks — un deck se reconnaît partout à son image. */}
              <section className={styles.group} aria-label="Choix du deck">
                <div className={styles.deckTabs} role="tablist" aria-label="Familles de decks">
                  {tabs.map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      aria-selected={deckTab === tab.id}
                      className={deckTab === tab.id ? styles.deckTabActive : styles.deckTab}
                      onClick={() => {
                        if (deckTab === tab.id) return;
                        playButtonClick();
                        setDeckTab(tab.id);
                      }}
                    >
                      {tab.label}
                      <span className={styles.deckTabCount}>{tab.decks.length}</span>
                    </button>
                  ))}
                  <span className={`${game.muted} ${styles.deckTabHint}`}>{activeTab.hint}</span>
                </div>

                {activeTab.decks.length === 0 ? (
                  <div className={`${game.panel} ${game.empty}`}>
                    {isSignedIn ? (
                      <>
                        <p className={game.emptyTitle}>Tu n&apos;as pas encore monté de deck</p>
                        <p className={game.muted}>En attendant, ton deck d&apos;emprunt et les decks de test sont prêts à jouer.</p>
                        <Link href="/decks/nouveau" className={game.secondary} onClick={() => playButtonClick()}>
                          + Créer un deck
                        </Link>
                      </>
                    ) : (
                      <>
                        <p className={game.emptyTitle}>Connecte-toi pour jouer tes propres decks</p>
                        <p className={game.muted}>Le deck d&apos;emprunt et les decks de test se jouent sans compte.</p>
                      </>
                    )}
                  </div>
                ) : (
                  <DeckCarousel label={activeTab.label} resetKey={`${activeTab.id}-${step}`}>
                    {activeTab.decks.map((deck) => {
                      const issue = activeTab.issueFor(deck);
                      const selected = current?.id === deck.id;
                      const className = issue ? game.tileDisabled : selected ? game.tileActive : game.tile;
                      const meta = catalogMeta(deck);
                      return (
                        <button
                          key={deck.id}
                          type="button"
                          role="option"
                          aria-selected={selected}
                          disabled={issue !== null}
                          className={`${className} ${styles.deckTile}`}
                          onClick={() => {
                            playButtonClick();
                            setCurrent(deck);
                          }}
                          title={issue ?? deck.description}
                        >
                          <ArtPlate artUrl={nameplateArtUrl(deck.cardIds, deck.shipId)} className={styles.deckPlate}>
                            <span className={styles.deckName}>{deck.name}</span>
                            <span className={styles.deckShip}>{shipNameOf(deck.shipId)}</span>
                          </ArtPlate>
                          <span className={styles.deckBody}>
                            <span className={styles.deckMeta}>
                              <span>{deck.cardIds.length} cartes</span>
                              {meta && (
                                <span>
                                  {meta.style} · <span className={styles.deckStars}>{"★".repeat(meta.difficulty)}{"☆".repeat(Math.max(0, 5 - meta.difficulty))}</span>
                                </span>
                              )}
                            </span>
                            <span className={styles.deckText}>{issue ?? deck.description}</span>
                            <span className={styles.deckFoot}>
                              {issue ? (
                                <span className={game.tagDanger}>{activeTab.id === "mine" ? "Non valide" : "Indisponible"}</span>
                              ) : selected ? (
                                <span className={game.tagCyan}>Choisi</span>
                              ) : (
                                <span className={game.tag}>Choisir</span>
                              )}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </DeckCarousel>
                )}
              </section>

              <div className={`${game.panel} ${styles.launch}`}>
                <div className={styles.launchSummary}>
                  <span>
                    Mode : <strong>{mode === "pvp" ? "Local à deux" : `Bot ${BOT_DIFFICULTIES.find((d) => d.id === botDifficulty)?.label.toLowerCase()}`}</strong>
                  </span>
                  <span>
                    {mode === "pvp" ? "Joueur 1" : "Ton deck"} : <strong>{deck1?.name ?? "—"}</strong>
                  </span>
                  {mode === "pvp" && (
                    <span>
                      Joueur 2 : <strong>{deck2?.name ?? "—"}</strong>
                    </span>
                  )}
                  {mode === "bot" && (
                    <span>
                      Adversaire : <strong>tiré au sort</strong>
                    </span>
                  )}
                </div>
                <button type="button" className={`${game.primary} ${styles.launchButton}`} onClick={handleLaunch} disabled={!canLaunch || starting}>
                  {launchLabel}
                </button>
              </div>
              {error && <p className={game.error}>{error}</p>}
            </>
          )}
        </div>
      </div>
    </GameScreen>
  );
}
