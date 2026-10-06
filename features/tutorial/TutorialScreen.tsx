"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PRECON_DECKS, TUTORIAL_STEPS, getShipDefinition, tutorialProgress, type GameState } from "@/game";
import { beginTutorial, completeTutorial } from "@/features/onboarding/actions";
import { createTutorialMatch } from "@/features/match/createLocalMatch";
import { MatchBoard } from "@/features/match/MatchBoard";
import { MatchEndScreen } from "@/features/match/MatchEndScreen";
import type { MatchEpilogue } from "@/features/match/MatchResultScreen";
import { matchAudienceVerdict } from "@/features/audience/verdict";
import { useAvatarCardId, useDisplayNames, useEquippedTitle } from "@/features/match/useDisplayNames";
import { GameScreen } from "@/features/shell/GameScreen";
import { TutorialCoach } from "@/features/tutorial/TutorialCoach";
import game from "@/features/shell/GameScreen.module.css";
import styles from "@/features/tutorial/Tutorial.module.css";
import { playButtonClick, playGameStart } from "@/lib/sound";

/**
 * Première connexion — proposition du tutoriel, puis partie guidée.
 *
 * Flow verrouillé par la spec (Notion « Progression joueur » §2) :
 *
 *   1. écran de proposition ;
 *   2. **Faire le tutoriel** → partie guidée → 1 booster ;
 *      **Passer** → accès direct, aucun booster ;
 *   3. dans les DEUX cas, redirection vers la Collection, où le joueur
 *      choisit son premier préconstruit.
 *
 * Le booster n'est jamais accordé côté client : `completeTutorial` est une
 * Server Action, et c'est la base qui décide (`finish_tutorial`). La partie
 * guidée étant locale, le serveur ne peut pas prouver qu'elle a été jouée :
 * il exige le ticket signé délivré à son lancement (`beginTutorial`) et une
 * durée minimale (`features/onboarding/tutorialTicket.ts`).
 *
 * La partie du tutoriel est une VRAIE partie locale contre le bot facile,
 * reprise en cours de route sur un scénario préparé (`applyTutorialScenario`)
 * : chaque leçon trouve son exemple sur la table, puis la partie se joue
 * jusqu'au bout avec les deux préconstruits.
 *
 * La fin reprend l'écran de victoire ou de défaite, avec un mot propre au
 * tutoriel et des boutons qui mènent au booster et au premier deck.
 */
/** D'où vient la fin : la partie s'est terminée, ou le joueur a quitté la table une fois les leçons vues. */
type TutorialEnding = { kind: "finished"; state: GameState } | { kind: "left"; state: GameState };
export function TutorialScreen({ autoStart = false }: { autoStart?: boolean } = {}) {
  const router = useRouter();
  const [match, setMatch] = useState<GameState | null>(null);
  /** État VIVANT de la partie guidée, publié par `MatchBoard`. */
  const [liveState, setLiveState] = useState<GameState | null>(null);
  /**
   * Rang le plus avancé atteint. Tenu ICI et non dans le guide : l'écran en
   * a besoin lui aussi, pour savoir quelles cartes autoriser — deux
   * compteurs séparés finiraient par diverger d'une étape.
   */
  const [furthest, setFurthest] = useState(0);
  const [outcome, setOutcome] = useState<"completed" | "skipped" | null>(null);
  /** Table au moment où le tutoriel s'est conclu — l'écran de fin la raconte. */
  const [ending, setEnding] = useState<TutorialEnding | null>(null);
  const names = useDisplayNames(ME);
  const myTitle = useEquippedTitle("me");
  const myAvatar = useAvatarCardId("me");
  const [boosterGranted, setBoosterGranted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Ticket signé délivré au lancement de la partie guidée : sa complétion récompensée l'exige. */
  const [ticket, setTicket] = useState<string | undefined>(undefined);
  const [, startTransition] = useTransition();

  // Tiré une fois : un nouveau rendu ne doit pas redistribuer la partie.
  const decks = useMemo(() => {
    const player = PRECON_DECKS[1] ?? PRECON_DECKS[0]!;
    const opponent = PRECON_DECKS.find((deck) => deck.id !== player.id) ?? player;
    return { player, opponent };
  }, []);

  /** Clôt le tutoriel côté serveur, puis conduit à la Collection (étape 4 du flow). */
  const finish = useCallback(
    (completed: boolean) => {
      setError(null);
      startTransition(async () => {
        const result = await completeTutorial(completed, completed ? ticket : undefined);
        if (!result.ok) {
          setError(result.error ?? "Impossible d'enregistrer la fin du tutoriel.");
          // Une partie jouée mérite quand même son écran de fin : l'erreur y est dite.
          if (!completed) return;
        }
        setBoosterGranted(Boolean(result.boosterGranted));
        setOutcome(completed ? "completed" : "skipped");
      });
    },
    [startTransition, ticket]
  );

  const handleSkip = useCallback(() => finish(false), [finish]);
  /** « Terminer le tutoriel » depuis le bandeau discret : la table telle qu'elle est. */
  const handleLeave = useCallback(() => {
    if (!liveState || ending) return;
    setEnding({ kind: "left", state: liveState });
    finish(true);
  }, [liveState, ending, finish]);

  // La partie s'est jouée jusqu'au bout : le tutoriel est accompli, leçons vues ou non.
  useEffect(() => {
    if (!liveState || liveState.status !== "finished" || ending) return;
    setEnding({ kind: "finished", state: liveState });
    finish(true);
  }, [liveState, ending, finish]);

  function startTutorial() {
    playGameStart();
    // Demandé en parallèle : la partie démarre tout de suite, le ticket
    // arrive bien avant la dernière étape.
    void beginTutorial().then((result) => setTicket(result.ticket));
    // Partie SCÉNARISÉE : chaque leçon trouve son exemple sur la table, et
    // aucune main malchanceuse ne peut rendre une étape infranchissable.
    const created = createTutorialMatch(decks.player, decks.opponent);
    setMatch(created);
    setLiveState(created);
  }

  // Lancé depuis les Options (`/tutoriel?lancer=1`) : droit dans la partie
  // guidée, sans l'écran de proposition.
  const autoStarted = useRef(false);
  useEffect(() => {
    if (!autoStart || autoStarted.current) return;
    autoStarted.current = true;
    startTutorial();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- une fois, au montage
  }, [autoStart]);

  function skip() {
    playButtonClick();
    finish(false);
  }

  // --- Fin d'une partie jouée : écran de victoire ou de défaite ---------
  if (outcome === "completed" && ending) {
    const table = ending.state;
    const me = table.players.find((p) => p.id === "p1")!;
    const them = table.players.find((p) => p.id !== "p1")!;
    const won =
      ending.kind === "finished" ? table.winnerId === "p1" : me.anchor / Math.max(1, getShipDefinition(me.shipId).startingAnchor) >= them.anchor / Math.max(1, getShipDefinition(them.shipId).startingAnchor);
    return (
      <MatchEndScreen
        outcome={won ? "victory" : "defeat"}
        player={{ name: names.me ?? "Toi", ship: getShipDefinition(me.shipId), title: myTitle, avatarCardId: myAvatar }}
        audience={matchAudienceVerdict(table, "p1")}
        epilogue={tutorialEpilogue(ending.kind, won, boosterGranted, error, (href) => router.push(href))}
      />
    );
  }

  // --- Tutoriel passé : cap sur la Collection ----------------------------
  if (outcome) {
    return (
      <div className={styles.reward} role="status">
        <h1 className={styles.rewardTitle}>Cap sur la Collection</h1>
        <p className={styles.rewardText}>Tutoriel passé — il n&apos;y a donc pas de booster. Choisis ton premier préconstruit.</p>
        <div className={styles.choiceFoot}>
          <button type="button" className={game.primary} onClick={() => router.push("/collection")}>
            Choisir mon deck
          </button>
        </div>
      </div>
    );
  }

  // --- Partie guidée -----------------------------------------------------
  if (match && liveState) {
    // Étape en cours : seules ses cartes sont jouables. `undefined` quand
    // l'étape ne porte pas sur une pose (attaquer, observer la Marée) —
    // le plateau redevient alors entièrement libre.
    const step = tutorialProgress(liveState, "p1", furthest).step;
    const eligible = step?.eligibleHandCards?.(liveState, "p1");
    const playableHandCards = eligible ? new Set(eligible) : undefined;

    return (
      <>
        {/* `hideEndScreen` : la fin de partie du tutoriel est la nôtre, pas
            l'écran Victoire/Défaite habituel. */}
        <MatchBoard
          initialState={match}
          onExit={handleSkip}
          botPlayerId="p2"
          botDifficulty="facile"
          onStateChange={setLiveState}
          playableHandCards={playableHandCards}
          hideEndScreen
        />
        <TutorialCoach
          state={liveState}
          playerId="p1"
          furthest={furthest}
          onFurthest={setFurthest}
          onSkip={handleSkip}
          onFinish={handleLeave}
        />
      </>
    );
  }

  // --- Proposition -------------------------------------------------------
  return (
    <GameScreen active={null} nav="minimal">
      <div className={game.content}>
        <div className={game.contentWide}>
          <div className={game.pageHead}>
            <div>
              <p className={game.eyebrow}>Premier embarquement</p>
              <h1 className={game.title}>Veux-tu apprendre à bord ?</h1>
            </div>
          </div>

          <div className={styles.choices}>
            <button type="button" className={`${game.tile} ${styles.choice}`} onClick={startTutorial}>
              <span className={styles.choiceTitle}>Faire le tutoriel</span>
              <span className={styles.choiceText}>
                Une vraie partie, reprise en cours de route et guidée pas à pas : l&apos;interface, ton premier tour, les gestes, le combat, la Marée.
              </span>
              <ul className={styles.lessons}>
                {CHAPTERS.map((chapter) => (
                  <li key={chapter} className={styles.lesson}>
                    {chapter}
                  </li>
                ))}
              </ul>
              <span className={styles.choiceFoot}>
                <span className={game.tagBrass}>1 booster à la clé</span>
                <span className={game.link}>Commencer →</span>
              </span>
            </button>

            <button type="button" className={`${game.tile} ${styles.choice}`} onClick={skip}>
              <span className={styles.choiceTitle}>Passer le tutoriel</span>
              <span className={styles.choiceText}>
                Tu connais déjà ce genre de jeu. Tu vas directement à ta Collection choisir ton premier deck.
              </span>
              <span className={styles.choiceFoot}>
                <span className={game.tag}>Sans booster</span>
                <span className={game.link}>Passer →</span>
              </span>
            </button>
          </div>

          {error && <p className={game.error}>{error}</p>}
        </div>
      </div>
    </GameScreen>
  );
}

/** Identifiant stable pour `useDisplayNames` (un tableau neuf à chaque rendu relancerait la requête). */
const ME = ["me"] as const;

/** Les chapitres du tutoriel, dans l'ordre — la liste de l'écran de proposition. */
const CHAPTERS = TUTORIAL_STEPS.reduce<string[]>((list, step) => (list.includes(step.chapter) ? list : [...list, step.chapter]), []);

/** Le mot de la fin : il dit comment la partie s'est terminée, ce qu'on a gagné, et où aller ensuite. */
function tutorialEpilogue(
  kind: TutorialEnding["kind"],
  won: boolean,
  boosterGranted: boolean,
  error: string | null,
  go: (href: string) => void
): MatchEpilogue {
  const title =
    kind === "left" ? "Leçons apprises" : won ? "Premier quart, première victoire" : "La mer a gagné cette fois";
  const story =
    kind === "left"
      ? won
        ? "Tu quittes la table en tête. Tu connais maintenant les rouages : Raison, Garde, Marée, Bris et Sabordage."
        : "Tu quittes la table avant la fin. Tu connais maintenant les rouages : Raison, Garde, Marée, Bris et Sabordage."
      : won
        ? "Tu as coulé l'adversaire en appliquant tout ce que tu viens d'apprendre. Joli premier quart."
        : "Mais tu connais maintenant les rouages : abattre la Garde, surveiller la Marée, garder ta Raison au-dessus de 0.";
  const reward = error
    ? `La récompense n'a pas pu être enregistrée : ${error}`
    : boosterGranted
      ? "Un booster t'attend dans ta réserve : ouvre-le, puis choisis ton premier préconstruit."
      : "Choisis maintenant ton premier préconstruit.";
  return {
    title,
    text: `${story} ${reward}`,
    back: boosterGranted ? { label: "Choisir mon deck", onClick: () => go("/collection") } : { label: "Retour au menu", onClick: () => go("/") },
    next: boosterGranted ? { label: "Ouvrir mon booster", onClick: () => go("/boosters") } : { label: "Choisir mon deck", onClick: () => go("/collection") },
  };
}
