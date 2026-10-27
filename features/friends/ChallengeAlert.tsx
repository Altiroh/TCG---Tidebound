"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { answerBattleInvitation, fetchBattleInvitations } from "@/features/friends/lobbyActions";
import type { BattleInvitation } from "@/features/friends/lobbyService";
import { ChallengeBand } from "@/features/friends/ChallengeBand";
import { useDevMode } from "@/features/admin/useDevMode";
import { socialLocked } from "@/features/friends/socialLock";
import { playButtonClick } from "@/lib/sound";

/**
 * Sondage des défis reçus : assez vif pour qu'un ami qui attend au salon ne
 * patiente pas (le pouls social, lui, ne passe que toutes les 45 s), assez
 * rare pour ne rien coûter — une requête légère, onglet visible seulement.
 */
const CHALLENGE_POLL_MS = 6000;

/**
 * DÉFI REÇU, où qu'on soit — monté une fois dans la mise en page.
 *
 * Un ami a cliqué « Combat » : la bande noire (`ChallengeBand`) s'ouvre au
 * milieu de l'écran. « Accepter » fait entrer dans le salon, où l'ami attend
 * déjà ; « Refuser » ferme l'invitation, et c'est le salon de l'ami qui
 * l'annonce de son côté. Jamais en pleine partie ni dans un salon (le
 * plateau ne doit pas être recouvert) : l'invitation attend la sortie, tant
 * qu'elle n'a pas expiré.
 */
export function ChallengeAlert() {
  const pathname = usePathname();
  const router = useRouter();
  const locked = socialLocked(useDevMode());
  const [invitation, setInvitation] = useState<BattleInvitation | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Invitations déjà répondues : elles ne reviennent pas avant que le serveur les ait closes. */
  const answered = useRef(new Set<string>());
  const busyRef = useRef(false);
  busyRef.current = busy;

  const away = Boolean(pathname?.startsWith("/en-ligne/")) || Boolean(pathname?.startsWith("/tutoriel"));

  useEffect(() => {
    if (locked) return;
    let cancelled = false;
    async function poll() {
      if (document.visibilityState !== "visible" || busyRef.current) return;
      const list = await fetchBattleInvitations().catch(() => null);
      if (cancelled || !list) return;
      setInvitation(list.find((entry) => !answered.current.has(entry.id)) ?? null);
    }
    void poll();
    const id = setInterval(poll, CHALLENGE_POLL_MS);
    const onVisible = () => void poll();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [locked]);

  if (locked || away || !invitation) return null;

  async function answer(accept: boolean) {
    if (!invitation) return;
    playButtonClick();
    setBusy(true);
    setError(null);
    const result = await answerBattleInvitation(invitation.id, accept).catch(() => ({ ok: false as const, error: "Le serveur est injoignable." }));
    setBusy(false);
    answered.current.add(invitation.id);
    if (!result.ok) {
      // Invitation périmée ou retirée : on le dit, puis la bande se ferme d'elle-même.
      setError(result.error);
      setTimeout(() => {
        setError(null);
        setInvitation(null);
      }, 2500);
      return;
    }
    const lobbyId = invitation.id;
    setInvitation(null);
    if (accept) router.push(`/en-ligne/salon/${lobbyId}`);
  }

  return <ChallengeBand fromName={invitation.fromName} busy={busy} error={error} onAccept={() => void answer(true)} onDecline={() => void answer(false)} />;
}
