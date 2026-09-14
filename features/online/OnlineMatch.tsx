"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { GameState, PlayerAction } from "@/game";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { fetchMatchView, submitMatchAction } from "@/features/online/actions";
import { OnlineBoard } from "@/features/online/OnlineBoard";
import { OnlineBoardLegacy } from "@/features/online/legacy/OnlineBoardLegacy";
import { useLegacyBoard } from "@/features/match/legacy/useLegacyBoard";
import { MatchRewardBanner } from "@/features/progression/MatchRewardBanner";
import type { MatchRow } from "@/features/matches/matchStore";
import { unpackFrames } from "@/features/matches/matchFrames";

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
  /** `?plateau=ancien` : ancien plateau, le temps de valider le nouveau. */
  const legacyBoard = useLegacyBoard();
  const [pending, setPending] = useState(false);
  const [replaying, setReplaying] = useState(false);

  const shownVersion = useRef(initialMatch.state_version);
  const latestRemoteVersion = useRef(initialMatch.state_version);
  const busy = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const isBotMatch = match.mode === "bot";

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  async function refresh() {
    const result = await fetchMatchView(matchId);
    if (!result.ok || !result.data) return;
    shownVersion.current = result.data.match.state_version;
    latestRemoteVersion.current = Math.max(latestRemoteVersion.current, shownVersion.current);
    setMatch(result.data.match);
    setView(result.data.frames ? unpackFrames(result.data.frames)[0]! : null);
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

  async function handleAction(action: PlayerAction) {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError(null);

    const result = await submitMatchAction(matchId, action);

    if (!result.ok || !result.data) {
      busy.current = false;
      setPending(false);
      setError(result.error ?? "Action refusée.");
      // Un conflit de version signifie que l'affichage est périmé.
      await refresh();
      return;
    }

    const { match: updated, frames } = result.data;
    const views = unpackFrames(frames);
    shownVersion.current = updated.state_version;
    setMatch(updated);

    const [first, ...botFrames] = views;
    if (first) setView(first);

    if (botFrames.length === 0) {
      busy.current = false;
      setPending(false);
      if (latestRemoteVersion.current > shownVersion.current) await refresh();
      return;
    }

    // Tour du bot : rejoue chaque état intermédiaire avec un délai. La
    // promesse ne se résout qu'à la fin du rejeu, pour que l'activation
    // enchaînée de plusieurs réactions (`OnlineBoard.activateSelectedReactions`,
    // qui attend chaque coup) n'envoie jamais la suivante pendant le rejeu.
    setReplaying(true);
    await new Promise<void>((resolve) => {
      botFrames.forEach((frame, index) => {
        const timer = setTimeout(() => {
          setView(frame);
          if (index === botFrames.length - 1) {
            busy.current = false;
            setPending(false);
            setReplaying(false);
            resolve();
          }
        }, BOT_FRAME_DELAY_MS * (index + 1));
        timers.current.push(timer);
      });
    });
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
  const Board = legacyBoard ? OnlineBoardLegacy : OnlineBoard;

  return (
    <>
      <Board
        state={view}
        myUserId={myUserId}
        onAction={handleAction}
        pending={pending}
        error={error}
        onDismissError={() => setError(null)}
        opponentName={isBotMatch ? "Le bot" : "L'adversaire"}
        exitHref={isBotMatch ? "/partie" : "/en-ligne"}
      />
      {finishedOnScreen && <MatchRewardBanner matchId={matchId} />}
    </>
  );
}
