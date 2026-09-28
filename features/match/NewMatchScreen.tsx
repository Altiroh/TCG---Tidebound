"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  PRECON_DECKS,
  RULES,
  validateDeckList,
  deckProfile,
  type BotDifficulty,
  type DeckList,
} from "@/game";
import Link from "next/link";
import { nameplateArtUrl } from "@/features/decks/nameplateArt";
import { BotSetup } from "@/features/match/BotSetup";
import { ModeTable, PlayTable } from "@/features/match/ModeTable";
import { GameScreen } from "@/features/shell/GameScreen";
import { shipNameOf } from "@/features/ships/ShipPortrait";
import game from "@/features/shell/GameScreen.module.css";
import styles from "@/features/match/NewMatch.module.css";
import { playButtonClick, playGameStart, playTabClick } from "@/lib/sound";
import { usePersistedState } from "@/lib/persistedState";

/**
 * Partie en ligne : recherche rapide (matchmaking au premier arrivé), ou
 * match amical — créé (on reçoit un code à partager) ou rejoint par code.
 */
export type OnlineKind = "quick" | "friend" | "host" | "join";

/** Un ami, tel que l'écran le propose au défi. */
export interface ChallengeableFriend {
  userId: string;
  name: string;
  /** « En ligne », « En partie », « Hors ligne » — déjà mis en mots. */
  presenceLabel: string;
}

/** Un défi reçu d'un ami : le relever, c'est rejoindre son match amical par code. */
export interface ReceivedChallenge {
  id: string;
  fromName: string;
  inviteCode: string;
}

export type MatchOpponent =
  | { type: "pvp" }
  | { type: "bot"; difficulty: BotDifficulty }
  | { type: "online"; kind: OnlineKind; code?: string; friendId?: string };

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
   * Préconstruits que ce joueur a débloqués : le sien, pris avec le choix
   * gratuit, et ceux payés en Jetons. Les autres restent
   * affichés, éteints, avec la raison — un rayon vide n'apprendrait rien
   * (Notion « Progression joueur » §4).
   */
  unlockedDeckIds?: readonly string[];
  /** Compte connecté — dit quoi afficher quand l'onglet « Mes decks » est vide. */
  isSignedIn?: boolean;
  /** Ouvre directement le mode « En ligne » (lien `/partie?mode=en-ligne`, lien d'invitation). */
  initialMode?: Mode;
  /** Code d'un lien d'invitation : le match amical à rejoindre est déjà saisi. */
  initialInviteCode?: string;
  /** Partie laissée ouverte par ce joueur : proposée à la reprise dès l'écran des modes. */
  resumable?: { matchId: string; label: string } | null;
  /** Amis du joueur, pour « Défier un ami ». */
  friends?: readonly ChallengeableFriend[];
  /** Ami présélectionné (bouton « Défier » de la page Amis). */
  initialFriendId?: string;
  /** Défis reçus, proposés dès l'écran des modes. */
  challenges?: readonly ReceivedChallenge[];
  /** Décliner un défi reçu. */
  onDeclineChallenge?: (challengeId: string) => void;
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
const BOT_DECK_POOL: readonly DeckList[] = PRECON_DECKS;

function pickRandomDeck(): DeckList {
  return BOT_DECK_POOL[Math.floor(Math.random() * BOT_DECK_POOL.length)]!;
}

const BOT_DIFFICULTIES: { id: BotDifficulty; label: string; description: string }[] = [
  { id: "facile", label: "Facile", description: "Joue quasiment au hasard, évite juste les pires coups." },
  { id: "moyen", label: "Moyen", description: "Vise généralement le meilleur coup, avec des erreurs occasionnelles." },
  { id: "difficile", label: "Difficile", description: "Cherche systématiquement le meilleur coup possible." },
];

type Mode = "pvp" | "bot" | "online";

const ONLINE_KINDS: { id: OnlineKind; label: string; description: string }[] = [
  { id: "quick", label: "Recherche rapide", description: "Un adversaire tiré au hasard. XP, Tides et quêtes." },
  { id: "friend", label: "Défier un ami", description: "Ton ami reçoit le défi où qu'il soit dans le jeu. Match amical, sans récompenses." },
  { id: "host", label: "Créer un match amical", description: "Tu reçois un code à envoyer à un ami. Pour le plaisir, sans récompenses." },
  { id: "join", label: "Rejoindre un match amical", description: "Entre le code reçu d'un ami. Pour le plaisir, sans récompenses." },
];

/** Alphabet des codes d'invitation (`features/online/inviteCode.ts`) : ce que la saisie garde. */
function normalizeInviteCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
}
/** 1 : mode · 2 : deck du joueur 1 (ou le sien contre le bot) · 3 : deck du joueur 2 (local à deux seulement). */
type Step = 1 | 2 | 3;

/** Les onglets de la sélection de deck, dans l'ordre de lecture. */
type DeckTab = "mine" | "precon";

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
 * ligne ; local à deux ; contre un bot), puis le deck, choisi par
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
  initialMode,
  initialInviteCode,
  resumable = null,
  friends = [],
  initialFriendId,
  challenges = [],
  onDeclineChallenge,
}: NewMatchScreenProps) {
  const openOnline = initialMode === "online" && isSignedIn;
  const [step, setStep] = useState<Step>(openOnline ? 2 : 1);
  const [mode, setMode] = useState<Mode>(openOnline ? "online" : "bot");
  const [onlineKind, setOnlineKind] = useState<OnlineKind>(initialInviteCode ? "join" : initialFriendId ? "friend" : "quick");
  const [friendId, setFriendId] = useState<string | null>(
    () => friends.find((friend) => friend.userId === initialFriendId)?.userId ?? friends[0]?.userId ?? null
  );
  const [inviteCode, setInviteCode] = useState(() => normalizeInviteCode(initialInviteCode ?? ""));
  const [botDifficulty, setBotDifficulty] = useState<BotDifficulty>("moyen");
  /** Retour animé de l'écran « contre un bot » vers le choix du mode (flèche du bandeau). */
  const botBackRef = useRef<(() => void) | null>(null);
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
        // UN SEUL RAYON depuis le 22/09/2026 : « Deck d'emprunt » et
        // « Préconstruits » étaient deux onglets pour la même chose, qui ne
        // se distinguaient que par la façon de l'obtenir.
        //
        // TEMPORAIRE : tous sont ouverts pour tester, sans dépenser de
        // Jeton. Le serveur les accepte déjà tous (`findCatalogDeck`).
        id: "precon",
        label: "Préconstruits",
        hint: "Douze plans, un par grande mécanique — cartes prêtées tant que tu ne les possèdes pas.",
        decks: PRECON_DECKS,
        issueFor: () => null,
      },
    ],
    [personalDecks, personalValidity, unlocked]
  );
  // Premier onglet utile : ses decks s'il en a, sinon les préconstruits.
  // Onglet MÉMORISÉ sur l'appareil — sauf « Mes decks » quand il n'y en a
  // plus aucun : on ne rouvre pas sur une liste vide.
  const [deckTab, setDeckTab] = usePersistedState<DeckTab>(
    "nouvelle-partie:onglet",
    () => (personalDecks.length > 0 ? "mine" : "precon"),
    { decode: (raw) => (raw === "precon" || (raw === "mine" && personalDecks.length > 0) ? raw : undefined) }
  );
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
    // Contre un bot, pas d'onglet : le deck choisi (par défaut, ou dans le
    // panneau « Changer de deck ») vaut quelle que soit sa source.
    if (mode === "bot" && current && tabs.some((tab) => tab.decks.some((deck) => deck.id === current.id))) return;
    const first = activeTab.decks.find((deck) => activeTab.issueFor(deck) === null) ?? null;
    if (first) setCurrent(first);
  }, [activeTab, current, setCurrent, mode, tabs]);

  /** Relever un défi reçu : mode « En ligne », rejoindre, code déjà saisi — reste le deck. */
  function acceptChallenge(code: string) {
    playButtonClick();
    setMode("online");
    setOnlineKind("join");
    setInviteCode(normalizeInviteCode(code));
    setStep(2);
  }

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
      playGameStart();
      void onStart(deck1, deck2, { type: "pvp" });
      return;
    }
    if (mode === "online") {
      if (onlineKind === "join" && inviteCode.length < 6) return;
      if (onlineKind === "friend" && !friendId) return;
      playGameStart();
      void onStart(deck1, deck1, {
        type: "online",
        kind: onlineKind,
        code: onlineKind === "join" ? inviteCode : undefined,
        friendId: onlineKind === "friend" ? (friendId ?? undefined) : undefined,
      });
      return;
    }
    playGameStart();
    // Contre un bot, le tirage a lieu ICI — au lancement, pas à l'affichage : relancer une partie change d'adversaire.
    void onStart(deck1, pickRandomDeck(), { type: "bot", difficulty: botDifficulty });
  }

  const stepLabels: string[] = mode === "pvp" ? ["Mode", "Deck du joueur 1", "Deck du joueur 2"] : ["Mode", "Ton deck"];
  const onlineBlocked = mode === "online" && ((onlineKind === "join" && inviteCode.length < 6) || (onlineKind === "friend" && !friendId));
  const canLaunch = step === 3 ? deck2 !== null : deck1 !== null && !onlineBlocked;
  const onlineLaunchLabel = {
    quick: "Chercher un adversaire",
    friend: "Envoyer le défi",
    host: "Créer le match amical",
    join: "Rejoindre le match",
  }[onlineKind];
  const challengedFriend = friends.find((friend) => friend.userId === friendId);
  const launchLabel =
    mode === "pvp" && step === 2
      ? "Deck du joueur 2 →"
      : starting
        ? "Préparation de la partie…"
        : mode === "online"
          ? onlineLaunchLabel
          : "Lancer la partie";

  // Défi d'un ami, partie laissée ouverte : posés sur la table du choix du mode.
  const notices =
    challenges.length > 0 || resumable ? (
      <>
        {challenges.map((challenge) => (
          <div key={challenge.id} className={game.banner} role="status">
            <div className={game.bannerText}>
              <p className={game.bannerTitle}>{challenge.fromName} te défie en match amical</p>
              <p className={game.muted}>Choisis ton deck, et la partie commence.</p>
            </div>
            <div className={game.bannerActions}>
              <button type="button" className={game.primary} onClick={() => acceptChallenge(challenge.inviteCode)}>
                Relever le défi
              </button>
              {onDeclineChallenge && (
                <button type="button" className={game.ghost} onClick={() => onDeclineChallenge(challenge.id)}>
                  Décliner
                </button>
              )}
            </div>
          </div>
        ))}
        {resumable && (
          <div className={game.banner} role="status">
            <div className={game.bannerText}>
              <p className={game.bannerTitle}>Une partie t&apos;attend</p>
              <p className={game.muted}>{resumable.label}</p>
            </div>
            <div className={game.bannerActions}>
              <Link href={`/en-ligne/${resumable.matchId}`} className={game.primary} onClick={() => playButtonClick()}>
                Reprendre
              </Link>
            </div>
          </div>
        )}
      </>
    ) : null;

  // Étape 1 (choix du mode) et étape « contre un bot » : la même table. Ses
  // éléments partent, ceux de l'étape suivante arrivent (retour du 28/09/2026).
  if (step === 1 || (step === 2 && mode === "bot")) {
    return (
      <GameScreen
        active="partie"
        nav="minimal"
        backdrop="table"
        // Sur l'écran « contre un bot », la flèche du bandeau revient au choix du mode, pas au menu.
        onNavigate={(href) => {
          if (step === 1 || href !== "/" || !botBackRef.current) return false;
          botBackRef.current();
          return true;
        }}
      >
        <PlayTable fill={step !== 1}>
          {step === 1 ? (
            <ModeTable
              onChoose={(choice) => {
                // En ligne : la recherche rapide ; Match amical : défier un ami (le reste se choisit ensuite).
                if (choice !== "bot") setOnlineKind(choice === "amical" ? "friend" : "quick");
                chooseMode(choice === "bot" ? "bot" : "online");
              }}
              notices={notices}
            />
          ) : (
            <BotSetup
              levels={BOT_DIFFICULTIES}
              difficulty={botDifficulty}
              onDifficulty={setBotDifficulty}
              deck={deck1}
              sources={tabs}
              onDeck={setDeck1}
              onBack={() => setStep(1)}
              backRef={botBackRef}
              onLaunch={handleLaunch}
              starting={starting}
              error={error}
              note={botNote}
            />
          )}
        </PlayTable>
      </GameScreen>
    );
  }

  return (
    <GameScreen active="partie" nav="minimal">
      {/* `contentFlush` : sur un écran court, la zone de contenu rend son
          rembourrage bas à la barre de lancement, qui va alors jusqu'au
          bord de l'écran (cf. `NewMatch.module.css`). */}
      <div className={`${game.content} ${styles.contentFlush}`}>
        {/*
          Étape du deck : la colonne fait EXACTEMENT la hauteur visible, ni
          plus ni moins. C'est ce qui permet à la liste de se borner et de
          défiler pour elle seule — avec une hauteur seulement « au moins
          égale » (le `min-height: 100%` de la coquille), quatorze listes de
          test allongeaient la page et passaient sous la barre de lancement.
        */}
        <div className={`${game.contentWide} ${styles.fill}`}>
          <div className={game.pageHead}>
            <div>
              <p className={game.eyebrow}>Jouer</p>
              <h1 className={game.title}>
                {step === 3 ? "Joueur 2 — choisis ton deck" : mode === "pvp" ? "Joueur 1 — choisis ton deck" : "Choisis ton deck"}
              </h1>
              {/* Un filet en vague plutôt qu'un trait : la même signature que
                  les titres de la charte, et elle dit de quelle mer on parle. */}
              <p className={styles.lead}>
                <span className={styles.leadWave} aria-hidden />
                {mode === "pvp"
                  ? "Chacun son deck, à tour de rôle, sur le même écran."
                  : mode === "online"
                    ? "Affronte un autre capitaine à distance, partie arbitrée par le serveur."
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

              {mode === "online" && step === 2 && (
                <section className={`${game.panel} ${styles.group} ${styles.botPanel}`}>
                  <h2 className={game.sectionTitle}>Type de partie</h2>
                  <div className={styles.difficulty} role="radiogroup" aria-label="Type de partie en ligne">
                    {ONLINE_KINDS.map((kind) => (
                      <button
                        key={kind.id}
                        type="button"
                        role="radio"
                        aria-checked={onlineKind === kind.id}
                        className={onlineKind === kind.id ? styles.difficultyChipActive : styles.difficultyChip}
                        onClick={() => {
                          playButtonClick();
                          setOnlineKind(kind.id);
                        }}
                      >
                        <span
                          className={`${game.choiceRadio} ${styles.difficultyRadio}`}
                          data-checked={onlineKind === kind.id ? "true" : "false"}
                          aria-hidden
                        />
                        <span className={styles.difficultyLabel}>{kind.label}</span>
                        <span className={styles.difficultyText}>{kind.description}</span>
                      </button>
                    ))}
                  </div>
                  {onlineKind === "friend" &&
                    (friends.length === 0 ? (
                      <p className={game.muted}>
                        Pas encore d&apos;ami à défier.{" "}
                        <Link href="/amis" className={game.link} onClick={() => playButtonClick()}>
                          Ajouter des amis →
                        </Link>
                      </p>
                    ) : (
                      <label className={game.field}>
                        <span className={game.fieldLabel}>
                          Ami à défier ·{" "}
                          <Link href="/amis" className={game.link} onClick={() => playButtonClick()}>
                            Gérer mes amis
                          </Link>
                        </span>
                        <select className={game.select} value={friendId ?? ""} onChange={(event) => setFriendId(event.target.value)}>
                          {friends.map((friend) => (
                            <option key={friend.userId} value={friend.userId}>
                              {friend.name} — {friend.presenceLabel}
                            </option>
                          ))}
                        </select>
                      </label>
                    ))}
                  {onlineKind === "join" && (
                    <label className={game.field}>
                      <span className={game.fieldLabel}>Code d&apos;invitation</span>
                      <input
                        className={game.input}
                        value={inviteCode}
                        onChange={(event) => setInviteCode(normalizeInviteCode(event.target.value))}
                        placeholder="ABC123"
                        autoCapitalize="characters"
                        autoComplete="off"
                        spellCheck={false}
                        inputMode="text"
                        maxLength={6}
                        style={{ letterSpacing: "0.3em", textTransform: "uppercase" }}
                      />
                    </label>
                  )}
                </section>
              )}

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
                        playTabClick();
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
                        <p className={game.muted}>En attendant, les préconstruits sont prêts à jouer.</p>
                        <Link href="/decks/nouveau" className={game.secondary} onClick={() => playButtonClick()}>
                          + Créer un deck
                        </Link>
                      </>
                    ) : (
                      <>
                        <p className={game.emptyTitle}>Connecte-toi pour jouer tes propres decks</p>
                        <p className={game.muted}>Les préconstruits se jouent sans compte.</p>
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
                  {mode === "online" ? (
                    <Fact
                      icon={LAUNCH_ICONS.duo}
                      label="Mode"
                      value={ONLINE_KINDS.find((kind) => kind.id === onlineKind)!.label}
                      note={onlineKind === "quick" ? "Partie classée, récompensée" : "Match amical, sans récompenses"}
                    />
                  ) : (
                    <Fact
                      icon={mode === "pvp" ? LAUNCH_ICONS.duo : LAUNCH_ICONS.bot}
                      label="Mode"
                      value={mode === "pvp" ? "Local à deux" : `Bot ${BOT_DIFFICULTIES.find((d) => d.id === botDifficulty)?.label.toLowerCase()}`}
                      note={mode === "pvp" ? "Deux joueurs sur le même écran" : "Adversaire contrôlé par l'IA"}
                    />
                  )}

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
                  ) : mode === "online" ? (
                    <Fact
                      icon={LAUNCH_ICONS.versus}
                      label="Adversaire"
                      value={
                        onlineKind === "quick"
                          ? "le premier en file"
                          : onlineKind === "friend"
                            ? (challengedFriend?.name ?? "ami à choisir")
                            : onlineKind === "host"
                              ? "l'ami que tu invites"
                              : inviteCode || "code à saisir"
                      }
                      note={onlineKind === "quick" ? "Appariement au premier arrivé" : "Son deck reste une surprise"}
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
        </div>
      </div>
    </GameScreen>
  );
}

/** Le globe de la tuile « En ligne ». */
const ONLINE_MARK = (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none">
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth={1.5} />
    <path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18" stroke="currentColor" strokeWidth={1.3} />
  </svg>
);

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
