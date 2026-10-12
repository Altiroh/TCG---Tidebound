"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { botHasSomethingToDo, type GameState, type PlayerAction } from "@/game";
import { COIN_TOSS_MS } from "@/features/match/CoinToss";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { advanceBotMatch, fetchMatchCosmetics, fetchMatchView, submitMatchAction } from "@/features/online/actions";
import { OnlineBoard } from "@/features/online/OnlineBoard";
import { MatchCosmeticsProvider, type PlayerCosmetics } from "@/features/cosmetics/MatchCosmeticsProvider";
import type { MatchRow } from "@/features/matches/matchStore";
import { unpackFrames } from "@/features/matches/matchFrames";
import { predictView } from "@/features/online/predictView";
import { BASE_FRAME_MS, framePaceMs } from "@/features/match/framePacing";
import { WaitingRoom } from "@/features/online/WaitingRoom";
import { createChannelRecoveryTracker, useResyncOnReturn } from "@/features/online/resync";
import { isOffline, presentUserIds, useOffline, useOpponentPresence, waitUntilOnline } from "@/features/online/connection";

/*
 * Pause entre deux états successifs du tour adverse (le bot, ou un joueur en
 * ligne) : chaque coup a le temps de SA mise en scène (`framePacing.ts`) —
 * une attaque, un sort, un dé se voient jusqu'au bout avant le coup suivant.
 * Le rythme fixe de 550 ms les coupait en plein vol (12/10/2026).
 */

/** Intervalle des relances tant qu'une échéance passée n'a pas encore été constatée par le serveur. */
const DEADLINE_RETRY_MS = 5_000;

interface OnlineMatchProps {
  matchId: string;
  initialMatch: MatchRow;
  /** Vue projetée pour ce joueur (`toPlayerView`) — jamais l'état complet. */
  initialView: GameState | null;
  myUserId: string;
}

/**
 * Orchestre une partie arbitrée côté serveur : écran d'attente puis plateau.
 *
 * Le client ne reçoit JAMAIS l'état complet. Realtime ne diffuse que les
 * métadonnées de `matches`, dont `state_version` : quand elle dépasse la
 * version affichée, le client redemande SA vue au serveur
 * (`fetchMatchView`). Contre le bot, chaque coup renvoie directement la
 * suite des vues (le coup du joueur, puis chaque action du bot), rejouées
 * une par une.
 */

/**
 * Recharge la page, une fois par période de 20 s au plus : si le serveur
 * lui-même est indisponible, un rechargement en boucle n'arrangerait rien.
 */
function reloadOnce() {
  const KEY = "tidebound:online-reload-at";
  try {
    const last = Number(window.sessionStorage.getItem(KEY) ?? 0);
    if (Date.now() - last < 20_000) return;
    window.sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    // Stockage indisponible : on recharge quand même, une fois.
  }
  window.location.reload();
}

export function OnlineMatch({ matchId, initialMatch, initialView, myUserId }: OnlineMatchProps) {
  const [match, setMatch] = useState<MatchRow>(initialMatch);
  const [view, setView] = useState<GameState | null>(initialView);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const shownVersion = useRef(initialMatch.state_version);
  const latestRemoteVersion = useRef(initialMatch.state_version);
  const busy = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const isBotMatch = match.mode === "bot";

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  /**
   * Dos et cadre équipés par l'ADVERSAIRE, par identifiant de joueur. Lus
   * une fois les deux sièges occupés (et relus si le second joueur change de
   * `player2_id`, c'est-à-dire quand il s'assied) : avant, il n'y a personne
   * à dessiner. Contre le bot, rien à lire : il joue avec les cosmétiques
   * d'origine, ce que le fournisseur fait pour tout identifiant inconnu.
   */
  const [cosmetics, setCosmetics] = useState<Record<string, PlayerCosmetics>>({});
  const opponentUserId = match.player1_id === myUserId ? match.player2_id : match.player1_id;
  const opponentIdRef = useRef(opponentUserId);
  opponentIdRef.current = opponentUserId;

  /**
   * CONNEXION — la sienne (le navigateur hors ligne) et celle de
   * l'adversaire (sa présence sur le canal de la partie, grâce comprise).
   * Affichage seulement : voir `features/online/connection.ts`.
   */
  const offline = useOffline();
  const [opponentOnChannel, setOpponentOnChannel] = useState<boolean | null>(null);
  const opponentPresence = useOpponentPresence(isBotMatch ? null : opponentOnChannel);
  useEffect(() => {
    if (isBotMatch || !opponentUserId) return;
    let cancelled = false;
    void fetchMatchCosmetics(matchId).then((result) => {
      if (!cancelled && result.ok && result.data) setCosmetics(result.data);
    });
    return () => {
      cancelled = true;
    };
  }, [matchId, isBotMatch, opponentUserId]);

  /** Vue affichée, lisible sans attendre un rendu : les prédictions s'enchaînent sur la dernière. */
  const viewRef = useRef<GameState | null>(initialView);
  function showView(next: GameState | null) {
    viewRef.current = next;
    setView(next);
  }

  // Stable : la salle d'attente s'en sert comme rythme de sondage.
  const pollWaiting = useCallback(() => {
    if (!busy.current) void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `refresh` est stable pour une partie donnée.
  }, []);

  /**
   * Échecs d'appel consécutifs de `fetchMatchView` (pas un refus : une
   * EXCEPTION). Le cas type est un nouveau déploiement pendant la partie : les
   * actions serveur de l'ancienne version de l'onglet n'existent plus, chaque
   * appel lève une erreur, et l'écran restait figé sans un mot pendant que
   * l'adversaire jouait (04/10/2026). L'état vit sur le serveur : recharger la
   * page reprend la partie là où elle en est.
   */
  const refreshFailures = useRef(0);

  /**
   * Coups de l'ADVERSAIRE en ligne, l'un après l'autre : une vue arrivée par
   * Realtime attend que la mise en scène du coup précédent soit allée au
   * bout (`framePaceMs`) — sinon une attaque suivie aussitôt d'un sort se
   * coupait l'une l'autre. `remoteReadyAt` : quand la scène sera libre.
   */
  const remoteReadyAt = useRef(0);
  const pendingRemote = useRef<ReturnType<typeof setTimeout> | null>(null);
  function showPaced(next: GameState | null) {
    if (pendingRemote.current) clearTimeout(pendingRemote.current);
    pendingRemote.current = null;
    const reveal = () => {
      pendingRemote.current = null;
      const previous = viewRef.current;
      showView(next);
      remoteReadyAt.current = performance.now() + (previous && next ? framePaceMs(previous, next) : 0);
    };
    const wait = remoteReadyAt.current - performance.now();
    if (wait <= 0) reveal();
    else pendingRemote.current = setTimeout(reveal, wait);
  }
  function cancelPendingRemote() {
    if (pendingRemote.current) clearTimeout(pendingRemote.current);
    pendingRemote.current = null;
  }
  useEffect(() => cancelPendingRemote, []);

  /** `paced` : vue d'un coup adverse arrivée par Realtime — elle attend la fin de la scène en cours. */
  async function refresh({ paced = false }: { paced?: boolean } = {}) {
    let result: Awaited<ReturnType<typeof fetchMatchView>>;
    try {
      result = await fetchMatchView(matchId);
      refreshFailures.current = 0;
    } catch (error) {
      // Hors ligne, l'échec est attendu : ni compté, ni suivi d'un
      // rechargement (qui tomberait sur une page d'erreur). Le retour du
      // réseau redemande la vue de lui-même (`useResyncOnReturn`).
      if (isOffline()) return;
      refreshFailures.current += 1;
      console.error("[OnlineMatch] Rafraîchissement impossible :", error);
      if (refreshFailures.current === 1) {
        // Un raté réseau isolé : une seconde chance avant de recharger.
        const retry = setTimeout(() => void refresh(), 1500);
        timers.current.push(retry);
      } else {
        reloadOnce();
      }
      return;
    }
    if (!result.ok || !result.data) return;
    shownVersion.current = result.data.match.state_version;
    latestRemoteVersion.current = Math.max(latestRemoteVersion.current, shownVersion.current);
    setMatch(result.data.match);
    const next = result.data.frames ? unpackFrames(result.data.frames)[0]! : null;
    if (paced) {
      showPaced(next);
      return;
    }
    // Une vue demandée (reprise, rattrapage, réalignement) fait foi tout de suite : une vue cadencée en attente, plus ancienne, est abandonnée.
    cancelPendingRemote();
    showView(next);
  }

  /**
   * RELANCE À L'ÉCHÉANCE — pour que la table ne reste pas figée quand le
   * joueur attendu ne joue plus.
   *
   * Le serveur ne tourne pas en tâche de fond : il constate l'heure quand
   * quelqu'un le sollicite. C'est donc à l'écran ouvert de le solliciter une
   * fois l'échéance passée — `fetchMatchView` applique alors ce qui doit
   * l'être (`settleExpiredDeadlines`).
   *
   * Y compris quand l'échéance est la NÔTRE : contre le bot, personne
   * d'autre ne relancerait, et le chrono annonçait « joue, ou la partie
   * s'arrête » sans que rien ne s'arrête jamais. L'écran ne décide rien
   * pour autant — c'est le serveur, l'heure en main, qui constate le délai.
   *
   * La relance se RÉPÈTE tant que l'échéance n'a pas bougé : l'horloge du
   * navigateur n'est pas celle du serveur, et une relance arrivée un peu
   * trop tôt ne doit pas laisser la partie figée pour de bon.
   */
  const awaiting = view?.turnTimer?.awaitingPlayerId;
  const deadlineAt = view?.turnTimer?.deadlineAt;
  useEffect(() => {
    if (!deadlineAt || !awaiting) return;
    if (match.status !== "active") return;
    let id: ReturnType<typeof setTimeout>;
    const relance = () => {
      if (!busy.current) void refresh();
      id = setTimeout(relance, DEADLINE_RETRY_MS);
    };
    // Une seconde de marge : une relance en avance ne ferait qu'un aller-retour pour rien.
    id = setTimeout(relance, Math.max(1000, deadlineAt - Date.now() + 1000));
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `refresh` est stable pour une partie donnée.
  }, [deadlineAt, awaiting, match.status]);

  /**
   * RATTRAPAGE — iOS suspend l'app en arrière-plan, le réseau tombe, le
   * canal Realtime se coupe : les mises à jour émises entre-temps sont
   * perdues (voir `features/online/resync.ts`). Au retour, on redemande la
   * vue. Pendant un coup en cours, sa réponse fait foi : on note seulement
   * qu'il faudra recharger une fois la file vidée (`drainQueue`).
   */
  const resyncAfterBusy = useRef(false);
  const requestResync = useResyncOnReturn(() => {
    if (busy.current) resyncAfterBusy.current = true;
    else void refresh();
  }, match.status !== "abandoned");

  useEffect(() => {
    // Contre le bot, le seul joueur humain est l'appelant : chaque coup
    // renvoie déjà l'état à jour, Realtime n'apporterait rien.
    if (isBotMatch) return;

    const supabase = createSupabaseBrowserClient();
    const channelRecovered = createChannelRecoveryTracker();
    let unmounted = false;
    // Chaque écran s'annonce sous la clé de SON joueur : les clés présentes sont les joueurs à la table.
    const channel = supabase.channel(`match-${matchId}`, { config: { presence: { key: myUserId } } });
    channel
      .on("presence", { event: "sync" }, () => {
        const opponent = opponentIdRef.current;
        if (!unmounted && opponent) setOpponentOnChannel(presentUserIds(channel.presenceState()).has(opponent));
      })
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "matches", filter: `id=eq.${matchId}` },
        (payload) => {
          const next = payload.new as MatchRow;
          latestRemoteVersion.current = Math.max(latestRemoteVersion.current, next.state_version);
          setMatch((current) => ({ ...current, ...next }));
          // Pendant un coup en cours, sa réponse fera foi ; on ne recharge
          // qu'ensuite, si une version plus récente est apparue entre-temps.
          if (!busy.current && next.state_version > shownVersion.current) void refresh({ paced: true });
        }
      )
      .subscribe((status) => {
        // (Ré)abonné : on se (ré)annonce — une socket rétablie repart sans présence.
        if (!unmounted && status === "SUBSCRIBED") void channel.track({ at: Date.now() });
        // Canal rétabli après une erreur ou une fermeture : ce qui a été
        // diffusé pendant la coupure ne sera jamais rejoué, on le redemande.
        if (!unmounted && channelRecovered(status)) requestResync();
      });

    return () => {
      unmounted = true;
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- abonnement unique par partie.
  }, [matchId, isBotMatch]);

  /**
   * Coups en attente d'envoi, dans l'ordre. `predicted` : la vue affiche déjà
   * leur résultat (`predictView`). `resolve` : l'appelant qui attend ce coup
   * (`activateSelectedReactions` enchaîne ses activations une à une).
   */
  const queue = useRef<Array<{ action: PlayerAction; predicted: boolean; resolve: () => void }>>([]);

  /**
   * Un coup du joueur : affiché TOUT DE SUITE quand il se prédit, puis envoyé
   * au serveur. Les coups joués pendant qu'un autre est en route attendent
   * leur tour dans la file au lieu d'être refusés — on pose ses cartes à son
   * rythme, pas à celui du réseau.
   */
  function handleAction(action: PlayerAction): Promise<void> {
    const current = viewRef.current;
    const predicted = current ? predictView(current, action) : null;
    if (predicted) showView(predicted);
    else setPending(true);
    setError(null);

    return new Promise<void>((resolve) => {
      queue.current.push({ action, predicted: predicted !== null, resolve });
      if (!busy.current) void drainQueue();
    });
  }

  async function drainQueue() {
    busy.current = true;
    // Le coup du joueur part de ce qu'il voit : la réponse du serveur fera foi, pas une vue adverse en attente.
    cancelPendingRemote();

    while (queue.current.length > 0) {
      const item = queue.current.shift()!;
      if (!item.predicted) setPending(true);
      // Hors ligne, le coup n'est pas encore parti : il attend le réseau
      // (affiché s'il se prédit) plutôt que d'échouer. Un échec EN VOL, lui,
      // n'est jamais renvoyé — le serveur l'a peut-être déjà enregistré.
      await waitUntilOnline();

      const result = await submitMatchAction(matchId, item.action).catch(() => ({ ok: false as const, error: "Coup non enregistré, réessaie.", data: undefined }));

      if (!result.ok || !result.data) {
        // Les coups suivants avaient été prédits sur un état qui n'a pas eu
        // lieu : ils sont abandonnés, et l'affichage se réaligne sur le serveur.
        const dropped = queue.current.splice(0);
        setError(result.error ?? "Action refusée.");
        await refresh();
        item.resolve();
        dropped.forEach((entry) => entry.resolve());
        break;
      }

      const { match: updated, frames, botToMove } = result.data;
      const views = unpackFrames(frames);
      shownVersion.current = updated.state_version;
      setMatch(updated);

      const [first, ...botFrames] = views;
      const beforeFirst = viewRef.current;
      // Le coup suivant est déjà affiché par prédiction : remettre la vue du
      // serveur maintenant le ferait disparaître un instant. Sa propre
      // réponse fera foi.
      const nextIsPredicted = queue.current[0]?.predicted ?? false;
      if (first && !(nextIsPredicted && botFrames.length === 0 && !botToMove)) showView(first);

      // Tour du bot : chaque état intermédiaire est rejoué à son rythme
      // (`paceFrames`). Les tranches suivantes (`advanceBotMatch`) sont
      // demandées PENDANT ce rejeu : le bot réfléchit à la suite pendant
      // qu'on regarde ce qu'il vient de jouer. La promesse du coup ne se
      // résout qu'à la fin du rejeu, pour que l'activation enchaînée de
      // plusieurs réactions n'envoie jamais la suivante pendant celui-ci.
      const replay = paceFrames(beforeFirst, first ?? null);
      replay.enqueue(botFrames);
      let botStillToMove = botToMove;
      while (botStillToMove) {
        const slice = await advanceBotMatch(matchId).catch(() => ({ ok: false as const, error: "Le bot n'a pas pu jouer, réessaie.", data: undefined }));
        if (!slice.ok || !slice.data) {
          // La lecture de la table termine le tour du bot côté serveur
          // (`settleExpiredDeadlines`) : on montre ce qui est arrivé, puis l'état final.
          await replay.finished();
          setError(slice.error ?? "Le bot n'a pas pu jouer.");
          await refresh();
          break;
        }
        shownVersion.current = slice.data.match.state_version;
        setMatch(slice.data.match);
        replay.enqueue(unpackFrames(slice.data.frames));
        botStillToMove = slice.data.botToMove;
      }
      await replay.finished();

      item.resolve();
    }

    busy.current = false;
    setPending(false);
    if (resyncAfterBusy.current || latestRemoteVersion.current > shownVersion.current) {
      resyncAfterBusy.current = false;
      await refresh();
    }
  }

  /**
   * LE BOT A LA MAIN À L'OUVERTURE (retour du 12/10/2026) : il a gagné la
   * pièce, ou la table a été rouverte pendant son tour. La page se charge
   * sans rattrapage, et le bot n'était relancé qu'après un coup du joueur —
   * qui attendait donc devant une table figée. On lui demande son tour tout
   * de suite, tranche par tranche, rejouées à leur rythme ; après la pièce
   * d'ouverture si elle tombe encore (`CoinToss`).
   */
  async function playBotTurn() {
    if (busy.current) return;
    busy.current = true;
    const replay = paceFrames(viewRef.current, viewRef.current);
    let more = true;
    while (more) {
      const slice = await advanceBotMatch(matchId).catch(() => ({ ok: false as const, error: "Le bot n'a pas pu jouer, réessaie.", data: undefined }));
      if (!slice.ok || !slice.data) {
        await replay.finished();
        await refresh();
        break;
      }
      shownVersion.current = slice.data.match.state_version;
      setMatch(slice.data.match);
      replay.enqueue(unpackFrames(slice.data.frames));
      more = slice.data.botToMove;
    }
    await replay.finished();
    busy.current = false;
    if (resyncAfterBusy.current || latestRemoteVersion.current > shownVersion.current) {
      resyncAfterBusy.current = false;
      await refresh();
    }
  }

  const botKickedOff = useRef(false);
  useEffect(() => {
    if (botKickedOff.current || initialMatch.mode !== "bot" || !initialView || initialView.status !== "active") return;
    const botId = initialView.players.find((player) => player.id !== myUserId)?.id;
    if (!botId || !botHasSomethingToDo(initialView, botId)) return;
    botKickedOff.current = true;
    // La pièce d'ouverture se lance d'abord : le bot joue une fois qu'elle est retombée.
    const coin = initialView.turnNumber === 1 && initialView.eventLog.some((event) => event.type === "GAME_STARTED" && event.coinToss);
    const timer = setTimeout(() => void playBotTurn(), coin ? COIN_TOSS_MS : 0);
    timers.current.push(timer);
    // Une fois, à l'ouverture de la table.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Rejeu cadencé des états du bot : chacun s'affiche au plus tôt
   * `BOT_FRAME_DELAY_MS` après le précédent. Une tranche arrivée en retard
   * s'affiche dès son arrivée — jamais d'attente ajoutée à la réflexion.
   */
  function paceFrames(shownBefore: GameState | null, shownNow: GameState | null) {
    let lastShownAt = performance.now();
    // Le coup du joueur lui-même (une attaque, un sort) se joue jusqu'au bout avant que le bot ne réponde.
    let holdAfterLast = shownBefore && shownNow ? framePaceMs(shownBefore, shownNow) : BASE_FRAME_MS;
    let lastFrame = shownNow;
    const shown: Promise<void>[] = [];
    return {
      enqueue(frames: GameState[]) {
        for (const frame of frames) {
          const at = Math.max(lastShownAt + holdAfterLast, performance.now());
          lastShownAt = at;
          holdAfterLast = lastFrame ? framePaceMs(lastFrame, frame) : BASE_FRAME_MS;
          lastFrame = frame;
          shown.push(
            new Promise<void>((resolve) => {
              const timer = setTimeout(() => {
                showView(frame);
                resolve();
              }, at - performance.now());
              timers.current.push(timer);
            })
          );
        }
      },
      finished: () => Promise.all(shown).then(() => undefined),
    };
  }

  if (match.status === "abandoned") {
    return (
      <main className="flex min-h-[100dvh] flex-col items-center justify-center gap-3 p-8 text-center text-slate-300">
        <p>Cette partie a été fermée : l&apos;invité a décliné le défi, l&apos;hôte l&apos;a annulée, ou une autre partie l&apos;a remplacée.</p>
        <a href="/partie" className="text-sm text-board-accent hover:underline">
          ← Retour à l&apos;écran Partie
        </a>
      </main>
    );
  }

  if (match.status === "waiting") {
    return <WaitingRoom matchId={matchId} inviteCode={match.invite_code} onPoll={pollWaiting} />;
  }

  if (!view) {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center p-8 text-slate-400">
        Chargement de la partie...
      </main>
    );
  }

  return (
    <MatchCosmeticsProvider viewerId={myUserId} byPlayer={cosmetics}>
      <OnlineBoard
        state={view}
        myUserId={myUserId}
        onAction={handleAction}
        pending={pending}
        error={error}
        onDismissError={() => setError(null)}
        opponentName={isBotMatch ? "Le bot" : "L'adversaire"}
        exitHref="/partie"
        matchId={matchId}
        connection={{ offline, opponent: opponentPresence }}
      />
    </MatchCosmeticsProvider>
  );
}
