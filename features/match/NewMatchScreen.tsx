"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  BORROWED_DECKS,
  PRECON_DECKS,
  RULES,
  validateDeckList,
  deckProfile,
  type BotDifficulty,
  type DeckList,
} from "@/game";
import Link from "next/link";
import { nameplateArtUrl } from "@/features/decks/nameplateArt";
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
type DeckTab = "mine" | "borrowed" | "precon";

interface DeckTabDef {
  id: DeckTab;
  label: string;
  hint: string;
  decks: readonly DeckList[];
  /** Pourquoi un deck n'est pas jouable — la tuile reste visible, éteinte, avec la raison. */
  issueFor: (deck: DeckList) => string | null;
}

/** Style, difficulté et mécaniques ÉCRITS — les listes du jeu en ont, un deck personnel non. */
function catalogMeta(deck: DeckList): { style: string; difficulty: number; mechanics: readonly string[] } | null {
  const meta = deck as Partial<{ style: string; difficulty: number; mechanics: string[] }>;
  if (typeof meta.style !== "string" || typeof meta.difficulty !== "number") return null;
  return { style: meta.style, difficulty: meta.difficulty, mechanics: meta.mechanics ?? [] };
}

/**
 * Ce que la fiche affiche, pour N'IMPORTE QUEL deck : les métadonnées
 * écrites si la liste vient du jeu, sinon celles que `deckProfile` lit dans
 * la composition. Un deck monté par le joueur n'avait rien à montrer —
 * même cadre, mêmes cases, mais toutes vides.
 *
 * L'ordre compte : une liste du catalogue garde SON texte. Il dit une
 * intention de design que l'arithmétique ne retrouvera jamais.
 */
function deckMeta(deck: DeckList): { style: string; difficulty: number; mechanics: readonly string[] } | null {
  return catalogMeta(deck) ?? deckProfile(deck.cardIds);
}

/**
 * Les cinq crans de difficulté, en toutes lettres. Les étoiles se comptent,
 * le mot se lit : c'est lui qu'on retient en parcourant une liste. L'échelle
 * est celle de `DeckDifficulty` (1 à 5, `game/cards/decks/catalog.ts`) et
 * n'ajoute aucun réglage — elle ne fait que la NOMMER.
 */
const DIFFICULTY_WORDS = ["Très accessible", "Accessible", "Moyen", "Exigeant", "Expert"] as const;

function difficultyWord(difficulty: number): string {
  return DIFFICULTY_WORDS[Math.min(DIFFICULTY_WORDS.length, Math.max(1, Math.round(difficulty))) - 1]!;
}

function stars(difficulty: number): string {
  const filled = Math.min(5, Math.max(0, Math.round(difficulty)));
  return "★".repeat(filled) + "☆".repeat(5 - filled);
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
  // Le deck PAR DÉFAUT du joueur (écran Decks) est présélectionné : on
  // arrive prêt à jouer, pas devant une liste à relire à chaque partie.
  const [deck1, setDeck1] = useState<DeckList | null>(() => personalDecks.find((deck) => deck.isDefault) ?? null);
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
        // TEMPORAIRE : tous les préconstruits sont ouverts pour tester, sans
        // dépenser de Jeton. Le serveur les accepte déjà tous
        // (`findCatalogDeck`).
        id: "precon",
        label: "Préconstruits",
        hint: "Le plan spécialisé de chaque Navire — ouverts le temps des essais.",
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

  /*
   * La liste et la fiche ne peuvent pas se contredire : si rien n'est
   * choisi, ou si le deck choisi n'appartient pas à l'onglet ouvert, on
   * pointe le premier deck JOUABLE de cet onglet. La fiche a donc toujours
   * quelque chose à montrer, et la ligne surlignée est toujours celle dont
   * on lit le détail.
   *
   * Ce n'est pas décider à la place du joueur : la décision reste « Lancer
   * la partie ». C'est le même principe que le deck par défaut, déjà
   * présélectionné à l'arrivée.
   */
  useEffect(() => {
    if (current && activeTab.decks.some((deck) => deck.id === current.id)) return;
    const first = activeTab.decks.find((deck) => activeTab.issueFor(deck) === null) ?? null;
    if (first) setCurrent(first);
  }, [activeTab, current, setCurrent]);

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
        {/*
          Étape du deck : la colonne fait EXACTEMENT la hauteur visible, ni
          plus ni moins. C'est ce qui permet à la liste de se borner et de
          défiler pour elle seule — avec une hauteur seulement « au moins
          égale » (le `min-height: 100%` de la coquille), quatorze listes de
          test allongeaient la page et passaient sous la barre de lancement.
          L'étape du mode garde le comportement ordinaire.
        */}
        <div className={`${game.contentWide} ${step === 1 ? "" : styles.fill}`}>
          <div className={game.pageHead}>
            <div>
              <p className={game.eyebrow}>Jouer</p>
              <h1 className={game.title}>
                {step === 1 ? "Choisis un mode" : step === 3 ? "Joueur 2 — choisis ton deck" : mode === "pvp" ? "Joueur 1 — choisis ton deck" : "Choisis ton deck"}
              </h1>
              {/* Un filet en vague plutôt qu'un trait : la même signature que
                  les titres de la charte, et elle dit de quelle mer on parle. */}
              <p className={styles.lead}>
                <span className={styles.leadWave} aria-hidden />
                {step === 1
                  ? "Choisis comment tu veux jouer, puis ton deck."
                  : mode === "pvp"
                    ? "Chacun son deck, à tour de rôle, sur le même écran."
                    : "Affronte l'IA et perfectionne tes stratégies sur les mers de Tidebound."}
              </p>
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
                <section className={`${game.panel} ${styles.group} ${styles.botPanel}`}>
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
                        {/* Le rond de radio est décoratif : l'état vient du `role="radio"`. */}
                        <span
                          className={`${game.choiceRadio} ${styles.difficultyRadio}`}
                          data-checked={botDifficulty === d.id ? "true" : "false"}
                          aria-hidden
                        />
                        {/* L'emblème du cran : le chemin suit la valeur de
                            `BotDifficulty`, rien à tenir à jour des deux côtés
                            (public/assets/play/bot-difficulty/README.md). */}
                        <img
                          className={styles.difficultyEmblem}
                          src={`/assets/play/bot-difficulty/${d.id}.webp`}
                          alt=""
                          width={44}
                          height={44}
                          draggable={false}
                          aria-hidden
                        />
                        <span className={styles.difficultyLabel}>{d.label}</span>
                        <span className={styles.difficultyText}>{d.description}</span>
                      </button>
                    ))}
                  </div>
                  {botNote && <p className={game.muted}>{botNote}</p>}
                </section>
              )}

              {/* Les decks par onglet : la section qui PREND la place restante.
                  C'est elle qui pousse la barre de lancement jusqu'au bas de
                  l'écran, et la liste comme la fiche s'étirent avec elle. */}
              <section className={`${styles.group} ${styles.deckGroup}`} aria-label="Choix du deck">
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
                  <div className={styles.picker}>
                    {/* La LISTE : un deck par ligne, image, nom, Navire et
                        difficulté. Elle défile pour elle seule — quatorze
                        listes de test ne doivent pas repousser la fiche
                        hors de l'écran. */}
                    <ul className={styles.deckList} role="listbox" aria-label={`Decks — ${activeTab.label}`}>
                      {activeTab.decks.map((deck) => {
                        const issue = activeTab.issueFor(deck);
                        const selected = current?.id === deck.id;
                        const meta = deckMeta(deck);
                        const art = nameplateArtUrl(deck.cardIds, deck.shipId);
                        return (
                          <li key={deck.id}>
                            <button
                              type="button"
                              role="option"
                              aria-selected={selected}
                              disabled={issue !== null}
                              className={styles.deckRow}
                              data-selected={selected || undefined}
                              onClick={() => {
                                playButtonClick();
                                setCurrent(deck);
                              }}
                              title={issue ?? deck.description}
                            >
                              <span
                                className={styles.rowArt}
                                style={art ? { backgroundImage: `url("${art}")` } : undefined}
                                aria-hidden
                              />
                              <span className={styles.rowText}>
                                <span className={styles.rowName}>{deck.name}</span>
                                <span className={styles.rowShip}>{shipNameOf(deck.shipId)}</span>
                                {issue ? (
                                  <span className={styles.rowIssue}>{issue}</span>
                                ) : meta ? (
                                  <span className={styles.rowStars} aria-label={`Difficulté : ${difficultyWord(meta.difficulty)}`}>
                                    {stars(meta.difficulty)}
                                  </span>
                                ) : (
                                  <span className={styles.rowStars}>{deck.cardIds.length} cartes</span>
                                )}
                              </span>
                              {/* Le seul mot de la ligne : ce deck est CELUI qui
                                  partira en partie. */}
                              {selected && <span className={styles.rowMark}>Sélectionné</span>}
                              <span className={styles.rowChevron} aria-hidden>
                                ›
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>

                    <DeckSheet deck={current} family={activeTab.label} issue={current ? activeTab.issueFor(current) : null} />
                  </div>
                )}
              </section>

              {/* LE RÉCAPITULATIF : ce qui va réellement partir en partie, une
                  ligne par élément, chacune avec son pictogramme et sa
                  précision — on relit sans avoir à remonter l'écran. */}
              <div className={`${game.panel} ${styles.launch}`}>
                <div className={styles.launchFacts}>
                  <Fact
                    icon={mode === "pvp" ? LAUNCH_ICONS.duo : LAUNCH_ICONS.bot}
                    label="Mode"
                    value={mode === "pvp" ? "Local à deux" : `Bot ${BOT_DIFFICULTIES.find((d) => d.id === botDifficulty)?.label.toLowerCase()}`}
                    note={mode === "pvp" ? "Deux joueurs sur le même écran" : "Adversaire contrôlé par l'IA"}
                  />

                  <Fact
                    icon={LAUNCH_ICONS.deck}
                    label={mode === "pvp" ? "Joueur 1" : "Ton deck"}
                    value={deck1?.name ?? "—"}
                    note={deck1 ? `${deck1.cardIds.length} cartes` : "Aucun deck choisi"}
                  />

                  {mode === "pvp" ? (
                    <Fact
                      icon={LAUNCH_ICONS.deck}
                      label="Joueur 2"
                      value={deck2?.name ?? "—"}
                      note={deck2 ? `${deck2.cardIds.length} cartes` : "À choisir à l'étape suivante"}
                    />
                  ) : (
                    <Fact
                      icon={LAUNCH_ICONS.versus}
                      label="Adversaire"
                      value="tiré au sort"
                      note="Un deck parmi ceux disponibles"
                    />
                  )}
                </div>

                <button
                  type="button"
                  className={`${game.primary} ${game.buttonLg} ${styles.launchButton}`}
                  onClick={handleLaunch}
                  disabled={!canLaunch || starting}
                >
                  <span className={styles.launchIcon} aria-hidden>
                    {LAUNCH_ICONS.anchor}
                  </span>
                  {launchLabel}
                  <span className={styles.launchArrow} aria-hidden>
                    ›
                  </span>
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

/**
 * Les pictogrammes de la barre de lancement — mode, deck, adversaire — et
 * l'ancre du bouton. Tracés en ligne plutôt que chargés : ils sont quatre,
 * ils suivent la couleur du texte, et une icône de 18 px ne vaut pas une
 * requête.
 */
const LAUNCH_ICONS = {
  bot: (
    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" aria-hidden>
      <rect x="4" y="8" width="16" height="11" rx="3" stroke="currentColor" strokeWidth={1.5} />
      <path d="M12 8V4.5M9.5 4.5h5" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
      <circle cx="9" cy="13" r="1.3" fill="currentColor" />
      <circle cx="15" cy="13" r="1.3" fill="currentColor" />
      <path d="M2.5 12v3M21.5 12v3" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
    </svg>
  ),
  duo: (
    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" aria-hidden>
      <circle cx="9" cy="8.5" r="3" stroke="currentColor" strokeWidth={1.5} />
      <path d="M3.5 19a5.5 5.5 0 0111 0" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
      <path d="M16 6.2a3 3 0 010 4.6M17.5 19a5.6 5.6 0 00-2-4.3" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
    </svg>
  ),
  deck: (
    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" aria-hidden>
      <rect x="8" y="4" width="11" height="15" rx="1.8" stroke="currentColor" strokeWidth={1.5} />
      <path d="M5.5 7v11A1.8 1.8 0 007.3 19.8H15" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
    </svg>
  ),
  versus: (
    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" aria-hidden>
      <path d="M4 4l10.5 10.5M20 4L9.5 14.5M4 4h3l1.5 1.5M20 4h-3l-1.5 1.5" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14.5 14.5l4 4a1.5 1.5 0 01-2 2l-4-4M9.5 14.5l-4 4a1.5 1.5 0 002 2l4-4" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  anchor: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden>
      <circle cx="12" cy="5" r="2.2" stroke="currentColor" strokeWidth={1.6} />
      <path d="M12 7.2V20M8 10h8" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" />
      <path d="M4.5 13.5A7.5 7.5 0 0012 20a7.5 7.5 0 007.5-6.5" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" />
    </svg>
  ),
};

/** Une ligne du récapitulatif : le pictogramme, ce que c'est, et sa précision. */
function Fact({ icon, label, value, note }: { icon: ReactNode; label: string; value: string; note: string }) {
  return (
    <span className={styles.fact}>
      <span className={styles.factIcon} aria-hidden>
        {icon}
      </span>
      <span className={styles.factLines}>
        <span className={styles.factHead}>
          {label} : <strong>{value}</strong>
        </span>
        <span className={styles.factNote}>{note}</span>
      </span>
    </span>
  );
}

/** Les trois pictogrammes des indicateurs de la fiche — rôle, taille, difficulté. */
const SHEET_ICONS = {
  role: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden>
      <path d="M4 4l10.5 10.5M20 4L9.5 14.5M4 4h3l1.5 1.5M20 4h-3l-1.5 1.5" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14.5 14.5l4 4a1.5 1.5 0 01-2 2l-4-4M9.5 14.5l-4 4a1.5 1.5 0 002 2l4-4" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  size: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden>
      <rect x="7.5" y="4" width="11" height="15" rx="1.6" stroke="currentColor" strokeWidth={1.5} />
      <path d="M5 6.5v12A1.5 1.5 0 006.5 20H15" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
    </svg>
  ),
  difficulty: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden>
      <path d="M12 3.6l2.4 4.9 5.4.8-3.9 3.8.9 5.3-4.8-2.5-4.8 2.5.9-5.3L4.2 9.3l5.4-.8L12 3.6z" stroke="currentColor" strokeWidth={1.4} strokeLinejoin="round" />
    </svg>
  ),
};

/**
 * LA FICHE du deck pointé — ce qu'on lit avant de lancer.
 *
 * Elle accompagne la liste plutôt que de vivre dans chaque tuile : une
 * rangée de tuiles répétait le même bloc de texte quinze fois, chacun trop
 * court pour dire quoi que ce soit. Ici la liste sert à PARCOURIR, la fiche
 * à COMPARER — nom, Navire, ce que le deck fait, ses trois indicateurs et
 * ses archétypes, dans une seule lecture.
 *
 * L'illustration est posée en fond à droite et s'éteint vers le texte : un
 * deck se reconnaît d'abord à son image, mais rien ne doit passer devant ce
 * qui se lit.
 */
function DeckSheet({ deck, family, issue }: { deck: DeckList | null; family: string; issue: string | null }) {
  if (!deck) {
    return (
      <aside className={`${game.panel} ${styles.sheet}`} data-empty="true">
        <p className={game.emptyTitle}>Choisis un deck</p>
        <p className={game.muted}>Sa fiche s&apos;affiche ici : rôle, taille, difficulté et archétypes.</p>
      </aside>
    );
  }

  const meta = deckMeta(deck);
  const art = nameplateArtUrl(deck.cardIds, deck.shipId);
  const size = deck.cardIds.length;
  const complete = size >= RULES.DECK_SIZE_MIN && size <= RULES.DECK_SIZE_MAX;

  return (
    <aside className={`${game.panel} ${styles.sheet}`} aria-live="polite">
      {art && <span className={styles.sheetArt} style={{ backgroundImage: `url("${art}")` }} aria-hidden />}

      <div className={styles.sheetBody}>
        <p className={game.eyebrow}>{family}</p>
        <h3 className={styles.sheetName}>{deck.name}</h3>
        <p className={styles.sheetShip}>{shipNameOf(deck.shipId)}</p>
        <p className={styles.sheetText}>{deck.description}</p>
        {issue && <p className={styles.sheetIssue}>{issue}</p>}

        <div className={styles.sheetStats}>
          {meta && (
            <span className={styles.stat}>
              <span className={styles.statIcon} aria-hidden>
                {SHEET_ICONS.role}
              </span>
              <span className={styles.statLines}>
                <span className={styles.statLabel}>Rôle principal</span>
                <span className={styles.statValue}>{meta.style}</span>
              </span>
            </span>
          )}

          <span className={styles.stat}>
            <span className={styles.statIcon} aria-hidden>
              {SHEET_ICONS.size}
            </span>
            <span className={styles.statLines}>
              <span className={styles.statLabel}>{size} cartes</span>
              <span className={styles.statValue}>{complete ? "Deck complet" : `${RULES.DECK_SIZE_MIN} minimum`}</span>
            </span>
          </span>

          {meta && (
            <span className={styles.stat}>
              <span className={styles.statIcon} aria-hidden>
                {SHEET_ICONS.difficulty}
              </span>
              <span className={styles.statLines}>
                <span className={styles.statLabel}>
                  <span className={styles.statStars} aria-hidden>
                    {stars(meta.difficulty)}
                  </span>{" "}
                  Difficulté
                </span>
                <span className={styles.statValue}>{difficultyWord(meta.difficulty)}</span>
              </span>
            </span>
          )}
        </div>

        {meta && meta.mechanics.length > 0 && (
          <div className={styles.sheetTags}>
            {/* « Mécaniques » et non « Archétypes », malgré la maquette :
                l Éditeur de deck appelle déjà cette donnée ainsi, et le moteur
                réserve le mot « archétype » aux familles de cartes, qui ne
                doivent JAMAIS être nommées au joueur (game/cards/archetypes.ts).
                Deux noms pour la même chose sur deux écrans serait pire. */}
            <p className={game.sectionTitle}>Mécaniques</p>
            <ul className={styles.tagList}>
              {meta.mechanics.map((mechanic) => (
                <li key={mechanic} className={styles.tag}>
                  {mechanic}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </aside>
  );
}
