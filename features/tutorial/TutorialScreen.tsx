"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BORROWED_DECKS, TUTORIAL_OPENING_TYPES, TUTORIAL_STEPS, tutorialProgress, type GameState } from "@/game";
import { completeTutorial } from "@/features/onboarding/actions";
import { createTutorialMatch } from "@/features/match/createLocalMatch";
import { MatchBoard } from "@/features/match/MatchBoard";
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
 *      choisit son premier deck d'emprunt.
 *
 * Le booster n'est jamais accordé côté client : `completeTutorial` est une
 * Server Action, et c'est la base qui décide (`finish_tutorial`) — un
 * navigateur ne peut pas déclarer une complétion qu'il n'a pas jouée.
 *
 * La partie du tutoriel est une VRAIE partie locale contre le bot facile,
 * avec deux decks d'emprunt : le joueur apprend sur le matériel qu'il
 * s'apprête à recevoir, pas sur une main truquée.
 */
export function TutorialScreen() {
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
  const [boosterGranted, setBoosterGranted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // Tiré une fois : un nouveau rendu ne doit pas redistribuer la partie.
  const decks = useMemo(() => {
    const player = BORROWED_DECKS[1] ?? BORROWED_DECKS[0]!;
    const opponent = BORROWED_DECKS.find((deck) => deck.id !== player.id) ?? player;
    return { player, opponent };
  }, []);

  /** Clôt le tutoriel côté serveur, puis conduit à la Collection (étape 4 du flow). */
  const finish = useCallback(
    (completed: boolean) => {
      setError(null);
      startTransition(async () => {
        const result = await completeTutorial(completed);
        if (!result.ok) {
          setError(result.error ?? "Impossible d'enregistrer la fin du tutoriel.");
          return;
        }
        setBoosterGranted(Boolean(result.boosterGranted));
        setOutcome(completed ? "completed" : "skipped");
      });
    },
    [startTransition]
  );

  const handleComplete = useCallback(() => finish(true), [finish]);
  const handleSkip = useCallback(() => finish(false), [finish]);

  function startTutorial() {
    playGameStart();
    // Main d'ouverture GARANTIE : chaque étape demande un geste précis, et
    // une main malchanceuse rendait la suivante infranchissable.
    const created = createTutorialMatch(decks.player, decks.opponent, TUTORIAL_OPENING_TYPES);
    setMatch(created);
    setLiveState(created);
  }

  function skip() {
    playButtonClick();
    finish(false);
  }

  // --- Fin du tutoriel : récompense, puis Collection ---------------------
  if (outcome) {
    const completed = outcome === "completed";
    return (
      <div className={styles.reward} role="status">
        <h1 className={styles.rewardTitle}>{completed ? "Bienvenue à bord" : "Cap sur la Collection"}</h1>
        <p className={styles.rewardText}>
          {completed
            ? boosterGranted
              ? "Tu as terminé ton premier quart. Un booster t'attend dans ta réserve — ouvre-le, puis choisis le deck que tu emprunteras pour tes premières parties."
              : "Tu as terminé ton premier quart. Choisis maintenant le deck que tu emprunteras pour tes premières parties."
            : "Tutoriel passé — il n'y a donc pas de booster. Choisis le deck que tu emprunteras pour tes premières parties."}
        </p>
        <div className={styles.choiceFoot}>
          {completed && boosterGranted && (
            <button type="button" className={game.primary} onClick={() => router.push("/boosters")}>
              Ouvrir mon booster
            </button>
          )}
          <button
            type="button"
            className={completed && boosterGranted ? game.secondary : game.primary}
            onClick={() => router.push("/collection")}
          >
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
          onComplete={handleComplete}
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
                Une vraie partie, guidée pas à pas. Sept gestes à apprendre, dans l&apos;ordre où ils arrivent.
              </span>
              <ul className={styles.lessons}>
                {TUTORIAL_STEPS.map((step) => (
                  <li key={step.id} className={styles.lesson}>
                    {step.title}
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
