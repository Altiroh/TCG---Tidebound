"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { fetchProfile, type ProfileSummary } from "@/features/progression/profileActions";
import { ProfileView, type ProfileTab } from "@/features/progression/ProfileView";
import styles from "@/features/progression/Profile.module.css";

interface ProfileDrawerProps {
  onClose: () => void;
  initialTab?: ProfileTab;
}

/**
 * Le profil en PANNEAU, glissé depuis la droite par-dessus l'écran en cours
 * — ouvert depuis l'avatar ou le pseudo du bandeau. On consulte son niveau,
 * on réclame ses récompenses, et on revient là où l'on était, sans
 * changement de page.
 */
export function ProfileDrawer({ onClose, initialTab }: ProfileDrawerProps) {
  const [profile, setProfile] = useState<ProfileSummary | null>(null);
  const [failed, setFailed] = useState(false);
  const [mounted, setMounted] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    fetchProfile()
      .then(setProfile)
      .catch((cause) => {
        console.error("[ProfileDrawer] Lecture du profil impossible :", cause);
        setFailed(true);
      });
  }, []);

  useEffect(() => {
    setMounted(true);
    load();
  }, [load]);

  useEffect(() => {
    panelRef.current?.focus();
  }, [mounted]);

  // Échap ferme le panneau — sauf quand une fenêtre posée dessus (révélation,
  // sélecteur d'illustration) est ouverte : elle se ferme d'abord.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (document.querySelector('[role="dialog"][aria-modal="true"]:not([data-profile-drawer])')) return;
      onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!mounted) return null;

  return createPortal(
    <>
      <div className={styles.drawerScrim} onClick={onClose} aria-hidden />
      <div ref={panelRef} className={styles.drawer} role="dialog" aria-modal="true" aria-label="Profil" data-profile-drawer tabIndex={-1}>
        <button type="button" className={styles.drawerClose} onClick={onClose} aria-label="Fermer le profil">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden>
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
          </svg>
        </button>
        {profile?.isSignedIn ? (
          <ProfileView profile={profile} initialTab={initialTab} onRefresh={load} onLeave={onClose} />
        ) : (
          <div className={styles.drawerLoading}>{failed || profile ? "Profil indisponible pour l'instant." : "Chargement du profil…"}</div>
        )}
      </div>
    </>,
    document.body
  );
}
