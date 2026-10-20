"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { pollSocial } from "@/features/friends/actions";
import type { IncomingChallenge } from "@/features/friends/friendService";
import styles from "@/features/friends/SocialPulse.module.css";
import { useDevMode } from "@/features/admin/useDevMode";
import { friendlyMatchLocked } from "@/features/online/friendlyMatchLock";
import { socialLocked } from "@/features/friends/socialLock";
import { requestFriendsPanel } from "@/features/friends/friendsPanelBus";

/** Signe de vie : assez fréquent pour que « En ligne » dise vrai (fenêtre de 2 min), assez rare pour ne rien coûter. */
const PULSE_MS = 45_000;

/**
 * Pouls social de l'appli — monté une fois dans la mise en page.
 *
 * Tant que l'onglet est visible, il signale la présence du joueur à ses amis
 * et relève ses défis et offres d'échange en attente : ils s'annoncent où
 * qu'il soit, sauf en pleine partie (le plateau ne doit pas être recouvert)
 * et sur l'écran Partie pour un défi, qui les affiche déjà. « Voir l'offre »
 * d'un échange ouvre le panneau Amis. Hors connexion, le serveur ne rend rien et il n'y a rien à
 * montrer.
 */
export function SocialPulse() {
  const pathname = usePathname();
  const [challenge, setChallenge] = useState<IncomingChallenge | null>(null);
  const [trade, setTrade] = useState<{ id: string; fromName: string } | null>(null);
  const [invitation, setInvitation] = useState<{ id: string; fromName: string } | null>(null);
  /** Défis et offres déjà annoncés : chacun ne s'annonce qu'une fois. */
  const announced = useRef(new Set<string>());

  useEffect(() => {
    let cancelled = false;

    async function pulse() {
      if (document.visibilityState !== "visible") return;
      const result = await pollSocial().catch(() => null);
      if (cancelled || !result) return;
      const fresh = result.challenges.find((entry) => !announced.current.has(entry.id));
      if (fresh) {
        announced.current.add(fresh.id);
        setChallenge(fresh);
      }
      const freshInvitation = result.invitations.find((entry) => !announced.current.has(entry.id));
      if (freshInvitation) {
        announced.current.add(freshInvitation.id);
        setInvitation(freshInvitation);
      }
      const freshTrade = result.trades.find((entry) => !announced.current.has(entry.id));
      if (freshTrade) {
        announced.current.add(freshTrade.id);
        setTrade(freshTrade);
      }
    }

    void pulse();
    const id = setInterval(pulse, PULSE_MS);
    const onVisible = () => void pulse();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  // Match amical fermé hors mode Dev (`friendlyMatchLock.ts`) : aucun défi à annoncer.
  const devMode = useDevMode();
  const amicalLocked = friendlyMatchLocked(devMode);
  const inMatch = pathname?.startsWith("/en-ligne/");
  const showChallenge = challenge && !amicalLocked && !inMatch && pathname !== "/partie";
  // Volet social réservé au mode Dev (`socialLock.ts`) : le serveur ne rend alors aucune offre, l'écran non plus.
  const showTrade = trade && !socialLocked(devMode) && !inMatch;

  // Invitation au combat : elle se relève depuis le Courrier, qui la montre en tête.
  if (invitation && !socialLocked(devMode) && !inMatch) {
    return (
      <div className={styles.toast} role="alert">
        <span className={styles.text}>
          <strong>{invitation.fromName}</strong> te propose un combat — ouvre ton Courrier pour le rejoindre.
        </span>
        <button type="button" className={styles.close} aria-label="Fermer" onClick={() => setInvitation(null)}>
          ×
        </button>
      </div>
    );
  }
  if (showChallenge) {
    return (
      <div className={styles.toast} role="alert">
        <span className={styles.text}>
          <strong>{challenge.fromName}</strong> te défie en match amical.
        </span>
        <Link href={`/partie?mode=en-ligne&code=${challenge.inviteCode}`} className={styles.accept} onClick={() => setChallenge(null)}>
          Relever le défi
        </Link>
        <button type="button" className={styles.close} aria-label="Fermer" onClick={() => setChallenge(null)}>
          ×
        </button>
      </div>
    );
  }
  if (!showTrade) return null;
  return (
    <div className={styles.toast} role="alert">
      <span className={styles.text}>
        <strong>{trade.fromName}</strong> te propose un échange de cartes.
      </span>
      <button
        type="button"
        className={styles.accept}
        onClick={() => {
          setTrade(null);
          requestFriendsPanel();
        }}
      >
        Voir l&apos;offre
      </button>
      <button type="button" className={styles.close} aria-label="Fermer" onClick={() => setTrade(null)}>
        ×
      </button>
    </div>
  );
}
