"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { botHasSomethingToDo, type GameState, type PlayerAction } from "@/game";
import { COIN_TOSS_MS } from "@/features/match/CoinToss";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { advanceBotMatch, fetchMatchCosmetics, fetchMatchView, submitMatchActions } from "@/features/online/actions";
import { OnlineBoard } from "@/features/online/OnlineBoard";
import { MatchCosmeticsProvider, type PlayerCosmetics } from "@/features/cosmetics/MatchCosmeticsProvider";
import type { MatchRow } from "@/features/matches/matchStore";
import { hashEventLog, nextKnownLog, unpackFrames, type PackedFrames } from "@/features/matches/matchFrames";
import { MAX_ACTIONS_PER_BATCH } from "@/features/matches/actionShape";
import { predictView } from "@/features/online/predictView";
import { BASE_FRAME_MS, framePaceMs } from "@/features/match/framePacing";
import { WaitingRoom } from "@/features/online/WaitingRoom";
import { VersusIntro } from "@/features/online/VersusIntro";
import { useDevMode } from "@/features/admin/useDevMode";
import { socialLocked } from "@/features/friends/socialLock";
import { MicroLoader } from "@/features/shell/MicroLoader";
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
/** Filet sous Realtime : intervalle de relecture pendant qu'on attend l'autre joueur. */
const WAITING_POLL_MS = 3_000;

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
  /**
   * Ce que l'écran attend du serveur SANS rien pouvoir montrer d'avance :
   * la réponse à un coup non anticipé, ou la réflexion du bot quand plus rien
   * n'est à rejouer. Un micro-chargement le dit (`MicroLoader`).
   */
  const [waiting, setWaiting] = useState<"coup" | "bot" | null>(null);
  /** États du bot encore à rejouer à l'écran : tant qu'il y en a, le bot ne « réfléchit » pas aux yeux du joueur. */
  const framesToShow = useRef(0);
  /**
   * JOURNAL CONNU : le dernier journal reçu DU SERVEUR (jamais une
   * prédiction) et son empreinte. Annoncé à chaque requête, il permet au
   * serveur de n'envoyer que la suite (`packFrames`). La paire est capturée
   * à l'envoi et c'est elle qui sert à recoller la réponse : une relecture
   * concurrente peut la remplacer entre-temps sans rien casser.
   */
  const serverLog = useRef<{ log: GameState["eventLog"]; hash: string } | null>(null);
  function knownLog() {
    if (!serverLog.current) {
      const log = initialView?.eventLog ?? [];
      serverLog.current = { log, hash: hashEventLog(log) };
    }
    return serverLog.current;
  }
  /** Vues d'une réponse, recollées sur le journal annoncé à l'envoi (`base`), et journal connu mis à jour. */
  function receiveFrames(packed: PackedFrames, base: { log: GameState["eventLog"]; hash: string }): GameState[] {
    try {
      const views = unpackFrames(packed, base.log);
      serverLog.current = nextKnownLog(packed, views, base);
      return views;
    } catch (error) {
      // Impossible en principe (la base est capturée à l'envoi) : la
      // prochaine requête repartira du journal complet.
      serverLog.current = { log: [], hash: hashEventLog([]) };
      throw error;
    }
  }

  /** Appel au bot du serveur, avec le micro-chargement s'il n'y a rien d'autre à regarder. */
  async function askBot(): Promise<{ ok: true; match: MatchRow; views: GameState[]; botToMove: boolean } | { ok: false; error?: string }> {
    if (framesToShow.current === 0) setWaiting("bot");
    const base = knownLog();
    try {
      const slice = await advanceBotMatch(matchId, { length: base.log.length, hash: base.hash });
      if (!slice.ok || !slice.data) return { ok: false, error: slice.error };
      return { ok: true, match: slice.data.match, views: receiveFrames(slice.data.frames, base), botToMove: slice.data.botToMove };
    } catch {
      return { ok: false, error: "Le bot n'a pas pu jouer, réessaie." };
    } finally {
      setWaiting(null);
    }
  }

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
   * à dessiner. Le bot, lui, n'a rien équipé : il joue avec les cosmétiques
   * d'origine, ce que le fournisseur fait pour tout identifiant inconnu. La
   * lecture porte aussi les ÉDITIONS montrées par chaque joueur (Full-Art…),
   * y compris les siennes — d'où sa présence contre le bot.
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
    // Contre le bot aussi : les ÉDITIONS montrées (Full-Art…) sont celles du
    // joueur lui-même, que seule la partie annonce.
    if (!isBotMatch && !opponentUserId) return;
    let cancelled = false;
    void fetchMatchCosmetics(matchId).then((result) => {
      if (!cancelled && result.ok && result.data) setCosmetics(result.data);
    });
    return () => {
      cancelled = true;
    };
  }, [matchId, isBotMatch, opponentUserId]);

  /**
   * PRÉSENTATION des deux capitaines avant une partie entre joueurs
   * (`VersusIntro`) : au premier tour seulement, une fois par partie et par
   * navigateur — recharger la page ne la rejoue pas. Le plateau (et sa pièce
   * de pile ou face) n'est monté qu'après.
   */
  const [versus, setVersus] = useState<"pending" | "showing" | "done">("pending");
  // Volet social réservé au mode Dev (`socialLock.ts`).
  const socialOpen = !socialLocked(useDevMode());
  const versusEligible = socialOpen && !isBotMatch && match.status === "active" && view?.turnNumber === 1;
  useEffect(() => {
    if (versus !== "pending" || !view) return;
    let seen = false;
    try {
      seen = window.sessionStorage.getItem(`tb-versus:${matchId}`) === "1";
    } catch {
      // Stockage refusé (navigation privée) : la présentation se montre, c'est tout.
    }
    setVersus(versusEligible && !seen ? "showing" : "done");
  }, [versus, view, versusEligible, matchId]);
  const finishVersus = useCallback(() => {
    try {
      window.sessionStorage.setItem(`tb-versus:${matchId}`, "1");
    } catch {
      // Sans stockage, rien à retenir.
    }
    setVersus("done");
  }, [matchId]);

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
  /**
   * Vues adverses EN FILE, dans l'ordre d'arrivée. Une vue arrivée pendant la
   * scène d'un coup précédent REMPLAÇAIT la vue qui attendait déjà : le coup
   * qu'elle portait n'était jamais joué à l'écran (une carte posée puis une
   * attaque, et seule l'attaque se voyait). Chacune passe à son tour.
   */
  const remoteQueue = useRef<Array<GameState | null>>([]);
  function drainRemote() {
    pendingRemote.current = null;
    const wait = remoteReadyAt.current - performance.now();
    if (wait > 0) {
      pendingRemote.current = setTimeout(drainRemote, wait);
      return;
    }
    if (remoteQueue.current.length === 0) return;
    const next = remoteQueue.current.shift()!;
    const previous = viewRef.current;
    showView(next);
    remoteReadyAt.current = performance.now() + (previous && next ? framePaceMs(previous, next) : 0);
    if (remoteQueue.current.length > 0) pendingRemote.current = setTimeout(drainRemote, remoteReadyAt.current - performance.now());
  }
  function showPaced(next: GameState | null) {
    remoteQueue.current.push(next);
    if (!pendingRemote.current) drainRemote();
  }
  function cancelPendingRemote() {
    if (pendingRemote.current) clearTimeout(pendingRemote.current);
    pendingRemote.current = null;
    remoteQueue.current = [];
  }
  useEffect(() => cancelPendingRemote, []);

  /** `paced` : vue d'un coup adverse arrivée par Realtime — elle attend la fin de la scène en cours. */
  async function refresh({ paced = false, onlyIfNewer = false }: { paced?: boolean; onlyIfNewer?: boolean } = {}) {
    let result: Awaited<ReturnType<typeof fetchMatchView>>;
    const base = knownLog();
    try {
      // Relecture de garde : la version affichée suffit au serveur pour répondre « rien de neuf » sans vue.
      result = await fetchMatchView(matchId, {
        log: { length: base.log.length, hash: base.hash },
        ...(onlyIfNewer ? { version: shownVersion.current } : {}),
      });
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
    if (!result.ok || !result.data || result.data.unchanged) return;
    // Relecture de garde : rien de neuf, rien ne bouge à l'écran.
    if (onlyIfNewer && result.data.match.state_version <= shownVersion.current) return;
    let next: GameState | null = null;
    try {
      next = result.data.frames ? receiveFrames(result.data.frames, base)[0]! : null;
    } catch (error) {
      // Le journal connu vient d'être oublié : la relecture suivante le reprend en entier.
      console.error("[OnlineMatch] Vue illisible, relecture complète :", error);
      return refresh({ paced, onlyIfNewer });
    }
    shownVersion.current = result.data.match.state_version;
    latestRemoteVersion.current = Math.max(latestRemoteVersion.current, shownVersion.current);
    setMatch(result.data.match);
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
   * FILET SOUS REALTIME (retour du 12/10/2026, partie en ligne à deux) :
   * l'écran n'apprenait le coup adverse QUE par la diffusion Realtime de
   * `matches.state_version`. Quand elle n'arrive pas — publication absente
   * en base, socket qui décroche sans le dire, réseau mobile —, la table
   * restait figée : on ne voyait ni l'autre jouer, ni que c'était à soi.
   *
   * Tant que la partie attend L'AUTRE joueur, on relit donc la vue toutes
   * les `WAITING_POLL_MS`, onglet visible et aucun coup en route. Seule une
   * version plus récente change l'affichage, cadencée comme une vue Realtime.
   */
  // Qui la table attend : son chrono, à défaut la fenêtre, le choix ou le joueur actif.
  const awaitedId = awaiting ?? view?.pendingReaction?.awaitingPlayerId ?? view?.pendingChoice?.playerId ?? view?.activePlayerId;
  const waitingOnOpponent = !isBotMatch && match.status === "active" && Boolean(awaitedId) && awaitedId !== myUserId;
  useEffect(() => {
    if (!waitingOnOpponent) return;
    const id = setInterval(() => {
      if (busy.current || document.visibilityState !== "visible" || isOffline()) return;
      void refresh({ paced: true, onlyIfNewer: true });
    }, WAITING_POLL_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `refresh` est stable pour une partie donnée.
  }, [waitingOnOpponent]);

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
      if (queue.current.some((entry) => !entry.predicted)) setPending(true);
      // Hors ligne, le coup n'est pas encore parti : il attend le réseau
      // (affiché s'il se prédit) plutôt que d'échouer. Un échec EN VOL, lui,
      // n'est jamais renvoyé — le serveur l'a peut-être déjà enregistré.
      await waitUntilOnline();

      // LOT : tous les coups en file partent ensemble — ceux joués pendant
      // que le précédent était en route —, un aller-retour pour toute la
      // file au lieu d'un par coup (`submitMatchActions`).
      const batch = queue.current.splice(0, MAX_ACTIONS_PER_BATCH);
      if (batch.some((entry) => !entry.predicted)) setWaiting("coup");
      const base = knownLog();
      const result = await submitMatchActions(
        matchId,
        batch.map((entry) => entry.action),
        { length: base.log.length, hash: base.hash }
      )
        .catch(() => ({ ok: false as const, error: "Coup non enregistré, réessaie.", data: undefined }))
        .finally(() => setWaiting(null));

      let views: GameState[] | null = null;
      if (result.ok && result.data) {
        try {
          views = receiveFrames(result.data.frames, base);
        } catch (error) {
          console.error("[OnlineMatch] Réponse illisible :", error);
        }
      }
      const consumed = result.data?.frameEnds.length ?? 0;
      if (!result.ok || !result.data || !views || consumed === 0) {
        // Les coups suivants avaient été prédits sur un état qui n'a pas eu
        // lieu : ils sont abandonnés, et l'affichage se réaligne sur le serveur.
        const dropped = queue.current.splice(0);
        if (!result.ok || !result.data) setError(result.error ?? "Action refusée.");
        await refresh();
        batch.forEach((entry) => entry.resolve());
        dropped.forEach((entry) => entry.resolve());
        break;
      }

      const { match: updated, botToMove, frameEnds, rejected } = result.data;
      shownVersion.current = updated.state_version;
      setMatch(updated);
      // Coups NON TENTÉS : le bot a pris la main avant eux. Ils repartent en
      // tête de file, une fois sa réponse jouée — comme coup par coup.
      const refused = rejected ? batch.slice(consumed) : [];
      if (!rejected) queue.current.unshift(...batch.slice(consumed));

      // Les vues de chaque coup, dans l'ordre, rejouées à leur rythme
      // (`paceFrames`) : la première tout de suite, les suivantes — les
      // coups non prédits du lot, puis le bot — chacune après la mise en
      // scène de la précédente.
      const beforeFirst = viewRef.current;
      let replay: ReturnType<typeof paceFrames> | null = null;
      const shownFor: Promise<void>[] = [];
      let start = 0;
      for (let index = 0; index < consumed; index += 1) {
        const group = views.slice(start, frameEnds[index]);
        start = frameEnds[index]!;
        const last = index === consumed - 1;
        const next = last ? (rejected ? undefined : queue.current[0]) : batch[index + 1];
        // Le coup suivant est déjà affiché par prédiction : remettre la vue
        // du serveur maintenant le ferait disparaître un instant. Sa propre
        // réponse fera foi.
        const skip = (next?.predicted ?? false) && group.length === 1 && !(last && botToMove);
        if (!skip && group.length > 0) {
          if (!replay) {
            showView(group[0]!);
            replay = paceFrames(beforeFirst, group[0]!);
            replay.enqueue(group.slice(1));
          } else {
            replay.enqueue(group);
          }
        }
        shownFor.push(replay ? replay.finished() : Promise.resolve());
      }

      // Tour du bot : les tranches suivantes (`advanceBotMatch`) sont
      // demandées PENDANT le rejeu : le bot réfléchit à la suite pendant
      // qu'on regarde ce qu'il vient de jouer. La promesse du coup ne se
      // résout qu'à la fin du rejeu, pour que l'activation enchaînée de
      // plusieurs réactions n'envoie jamais la suivante pendant celui-ci.
      const pacing = replay ?? paceFrames(viewRef.current, viewRef.current);
      let botStillToMove = botToMove;
      while (botStillToMove) {
        const slice = await askBot();
        if (!slice.ok) {
          // La lecture de la table termine le tour du bot côté serveur
          // (`settleExpiredDeadlines`) : on montre ce qui est arrivé, puis l'état final.
          await pacing.finished();
          setError(slice.error ?? "Le bot n'a pas pu jouer.");
          await refresh();
          break;
        }
        shownVersion.current = slice.match.state_version;
        setMatch(slice.match);
        pacing.enqueue(slice.views);
        botStillToMove = slice.botToMove;
      }
      // Chaque coup se résout une fois SES vues montrées ; le dernier, après le bot.
      shownFor.slice(0, -1).forEach((shown, index) => void shown.then(() => batch[index]!.resolve()));
      await pacing.finished();
      batch[consumed - 1]!.resolve();

      if (rejected) {
        // Refusé en cours de lot : ce qui précède est enregistré (et vient
        // d'être montré) ; le coup refusé et tout ce qui le suivait, prédit
        // sur un état qui n'a pas eu lieu, sont abandonnés.
        const dropped = queue.current.splice(0);
        setError(rejected.error);
        await refresh();
        refused.forEach((entry) => entry.resolve());
        dropped.forEach((entry) => entry.resolve());
        break;
      }
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
      const slice = await askBot();
      if (!slice.ok) {
        await replay.finished();
        await refresh();
        break;
      }
      shownVersion.current = slice.match.state_version;
      setMatch(slice.match);
      replay.enqueue(slice.views);
      more = slice.botToMove;
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
          framesToShow.current += 1;
          lastShownAt = at;
          holdAfterLast = lastFrame ? framePaceMs(lastFrame, frame) : BASE_FRAME_MS;
          lastFrame = frame;
          shown.push(
            new Promise<void>((resolve) => {
              const timer = setTimeout(() => {
                framesToShow.current = Math.max(0, framesToShow.current - 1);
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

  if (versusEligible && versus !== "done") {
    return <VersusIntro matchId={matchId} onDone={finishVersus} />;
  }

  return (
    <MatchCosmeticsProvider viewerId={myUserId} byPlayer={cosmetics}>
      {/* Le bot réfléchit souvent un court instant : le micro-chargement ne vient qu'au-delà. */}
      <MicroLoader active={waiting !== null} label={waiting === "bot" ? `${isBotMatch ? "Le bot" : "L'adversaire"} réfléchit…` : "Coup en route…"} delayMs={waiting === "bot" ? 450 : 220} />
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
