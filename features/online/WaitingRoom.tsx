"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { cancelWaitingMatch } from "@/features/online/actions";
import { GameScreen } from "@/features/shell/GameScreen";
import game from "@/features/shell/GameScreen.module.css";
import { playButtonClick } from "@/lib/sound";

/** Sondage de secours pendant l'attente : si Realtime n'est pas actif sur le projet, l'hôte doit quand même voir arriver son invité. */
const WAITING_POLL_MS = 4000;

interface WaitingRoomProps {
  matchId: string;
  inviteCode: string;
  /** Relit la partie : appelé à intervalles réguliers tant que personne n'est arrivé. */
  onPoll: () => void;
}

/**
 * Salle d'attente d'un match amical : le code, le lien à envoyer, et une
 * VRAIE annulation — la partie est fermée côté serveur, son code ne mène
 * plus nulle part.
 */
export function WaitingRoom({ matchId, inviteCode, onPoll }: WaitingRoomProps) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [link, setLink] = useState(`/en-ligne/rejoindre/${inviteCode}`);

  // L'origine n'est connue qu'au navigateur : le lien complet s'écrit après le montage.
  useEffect(() => setLink(`${window.location.origin}/en-ligne/rejoindre/${inviteCode}`), [inviteCode]);

  useEffect(() => {
    const id = setInterval(onPoll, WAITING_POLL_MS);
    return () => clearInterval(id);
  }, [onPoll]);

  async function share() {
    playButtonClick();
    const text = `Rejoins-moi pour un match amical sur Tidebound ! Code : ${inviteCode}`;
    // Le partage natif (téléphone) d'abord, le presse-papiers sinon.
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: "Match amical Tidebound", text, url: link });
        return;
      } catch {
        // Partage refusé ou annulé : on retombe sur la copie.
      }
    }
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  async function cancel() {
    playButtonClick();
    setCancelling(true);
    await cancelWaitingMatch(matchId).catch(() => undefined);
    router.push("/partie?mode=en-ligne");
  }

  return (
    <GameScreen active="partie" nav="minimal">
      <div className={game.content}>
        <div className={game.contentInner}>
          <section className={`${game.panel} ${game.empty}`} role="status" aria-live="polite">
            <p className={game.eyebrow}>Match amical</p>
            <h1 className={game.title}>En attente de ton invité</h1>
            <p className={game.muted}>Envoie-lui ce code, ou le lien : la partie démarre dès qu&apos;il rejoint.</p>
            <p className={game.statValueGold} style={{ fontSize: "2.4rem", letterSpacing: "0.35em" }} aria-label={`Code ${inviteCode.split("").join(" ")}`}>
              {inviteCode}
            </p>
            <button type="button" className={game.primary} onClick={share}>
              {copied ? "Lien copié !" : "Partager l'invitation"}
            </button>
            <p className={game.caption}>Un match amical se joue pour le plaisir : il ne rapporte ni XP, ni Tides, ni quêtes.</p>
            <button type="button" className={game.secondary} onClick={cancel} disabled={cancelling}>
              {cancelling ? "Annulation…" : "Annuler le match"}
            </button>
          </section>
        </div>
      </div>
    </GameScreen>
  );
}
