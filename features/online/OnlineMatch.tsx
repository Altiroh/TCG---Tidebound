"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { GameState, PlayerAction } from "@/game";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { fetchMatchCosmetics, fetchMatchView, submitMatchAction } from "@/features/online/actions";
import { OnlineBoard } from "@/features/online/OnlineBoard";
import { MatchCosmeticsProvider, type PlayerCosmetics } from "@/features/cosmetics/MatchCosmeticsProvider";
import { MatchRewardBanner } from "@/features/progression/MatchRewardBanner";
import type { MatchRow } from "@/features/matches/matchStore";
import { unpackFrames } from "@/features/matches/matchFrames";
import { predictView } from "@/features/online/predictView";

/**
 * Pause entre deux états successifs renvoyés par le serveur pour le tour du
 * bot — même rythme que la partie locale (`MatchBoard`), assez long pour voir
 * chaque pioche/pose/attaque se jouer avant l'action suivante.
 */
const BOT_FRAME_DELAY_MS = 1100;

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
export function OnlineMatch({ matchId, initialMatch, initialView, myUserId }: OnlineMatchProps) {
  const [match, setMatch] = useState<MatchRow>(initialMatch);
  const [view, setView] = useState<GameState | null>(initialView);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [replaying, setReplaying] = useState(false);

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

  async function refresh() {
    const result = await fetchMatchView(matchId);
    if (!result.ok || !result.data) return;
    shownVersion.current = result.data.match.state_version;
    latestRemoteVersion.current = Math.max(latestRemoteVersion.current, shownVersion.current);
    setMatch(result.data.match);
    showView(result.data.frames ? unpackFrames(result.data.frames)[0]! : null);
  }

  useEffect(() => {
    // Contre le bot, le seul joueur humain est l'appelant : chaque coup
    // renvoie déjà l'état à jour, Realtime n'apporterait rien.
    if (isBotMatch) return;

    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel(`match-${matchId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "matches", filter: `id=eq.${matchId}` },
        (payload) => {
          const next = payload.new as MatchRow;
          latestRemoteVersion.current = Math.max(latestRemoteVersion.current, next.state_version);
          setMatch((current) => ({ ...current, ...next }));
          // Pendant un coup en cours, sa réponse fera foi ; on ne recharge
          // qu'ensuite, si une version plus récente est apparue entre-temps.
          if (!busy.current && next.state_version > shownVersion.current) void refresh();
        }
      )
      .subscribe();

    return () => {
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

    while (queue.current.length > 0) {
      const item = queue.current.shift()!;
      if (!item.predicted) setPending(true);

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

      const { match: updated, frames } = result.data;
      const views = unpackFrames(frames);
      shownVersion.current = updated.state_version;
      setMatch(updated);

      const [first, ...botFrames] = views;
      // Le coup suivant est déjà affiché par prédiction : remettre la vue du
      // serveur maintenant le ferait disparaître un instant. Sa propre
      // réponse fera foi.
      const nextIsPredicted = queue.current[0]?.predicted ?? false;
      if (first && !(nextIsPredicted && botFrames.length === 0)) showView(first);

      if (botFrames.length > 0) {
        // Tour du bot : rejoue chaque état intermédiaire avec un délai. La
        // promesse ne se résout qu'à la fin du rejeu, pour que l'activation
        // enchaînée de plusieurs réactions n'envoie jamais la suivante
        // pendant le rejeu.
        setReplaying(true);
        await new Promise<void>((resolve) => {
          botFrames.forEach((frame, index) => {
            const timer = setTimeout(() => {
              showView(frame);
              if (index === botFrames.length - 1) resolve();
            }, BOT_FRAME_DELAY_MS * (index + 1));
            timers.current.push(timer);
          });
        });
        setReplaying(false);
      }

      item.resolve();
    }

    busy.current = false;
    setPending(false);
    if (latestRemoteVersion.current > shownVersion.current) await refresh();
  }

  if (match.status === "waiting") {
    return (
      <main className="mx-auto flex min-h-screen max-w-sm flex-col items-center justify-center gap-4 p-8 text-center">
        <h1 className="text-2xl font-bold">En attente d&apos;un adversaire</h1>
        <p className="text-4xl font-bold tracking-widest text-board-accent">{match.invite_code}</p>
        <p className="text-sm text-slate-400">Partage ce code. La partie démarre dès qu&apos;il/elle rejoint.</p>
        <Link href="/en-ligne" className="text-sm text-board-accent hover:underline">
          ← Annuler
        </Link>
      </main>
    );
  }

  if (!view) {
    return (
      <main className="flex min-h-screen items-center justify-center p-8 text-slate-400">
        Chargement de la partie...
      </main>
    );
  }

  // Le bandeau n'attend pas la fin du rejeu : il ne s'affiche qu'une fois
  // l'écran de victoire à l'écran, donc quand la dernière vue est posée.
  const finishedOnScreen = view.status === "finished" && !replaying;

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
        exitHref={isBotMatch ? "/partie" : "/en-ligne"}
        matchId={matchId}
      />
      {finishedOnScreen && <MatchRewardBanner matchId={matchId} />}
    </MatchCosmeticsProvider>
  );
}
