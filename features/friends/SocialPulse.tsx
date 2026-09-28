"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { pollSocial } from "@/features/friends/actions";
import type { IncomingChallenge } from "@/features/friends/friendService";
import styles from "@/features/friends/SocialPulse.module.css";

/** Signe de vie : assez fréquent pour que « En ligne » dise vrai (fenêtre de 2 min), assez rare pour ne rien coûter. */
const PULSE_MS = 45_000;

/**
 * Pouls social de l'appli — monté une fois dans la mise en page.
 *
 * Tant que l'onglet est visible, il signale la présence du joueur à ses amis
 * et relève ses défis en attente : un défi reçu s'annonce où qu'il soit,
 * sauf en pleine partie (le plateau ne doit pas être recouvert) et sur
 * l'écran Partie, qui les affiche déjà. Hors connexion, le serveur ne rend
 * rien et il n'y a rien à montrer.
 */
export function SocialPulse() {
  const pathname = usePathname();
  const [challenge, setChallenge] = useState<IncomingChallenge | null>(null);
  /** Défis déjà annoncés : un défi ne s'annonce qu'une fois. */
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

  const hidden = pathname?.startsWith("/en-ligne/") || pathname === "/partie";
  if (!challenge || hidden) return null;

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
