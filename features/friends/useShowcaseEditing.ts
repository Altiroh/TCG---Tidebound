"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { updateShowcase } from "@/features/friends/showcaseActions";
import type { Showcase } from "@/features/friends/showcaseRules";

export type ShowcaseSaveStatus = "idle" | "saving" | "saved" | "error";

/**
 * Vitrine modifiée À L'INSTANT : chaque geste (poser, déplacer, retirer)
 * s'affiche tout de suite, et part au serveur derrière. Un refus remet la
 * dernière vitrine confirmée et dit pourquoi. Plusieurs gestes rapides :
 * seule la réponse du DERNIER compte (les précédentes sont dépassées).
 */
export function useShowcaseEditing(initial: Showcase | null) {
  const [showcase, setShowcase] = useState<Showcase | null>(initial);
  const [status, setStatus] = useState<ShowcaseSaveStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const confirmed = useRef<Showcase | null>(initial);
  const sequence = useRef(0);

  // Une nouvelle lecture du serveur (fiche relue) remplace l'état local.
  const initialKey = JSON.stringify(initial);
  useEffect(() => {
    confirmed.current = initial;
    setShowcase(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `initialKey` résume `initial` (nouvel objet à chaque lecture).
  }, [initialKey]);

  const commit = useCallback(async (next: Showcase) => {
    const id = ++sequence.current;
    setShowcase(next);
    setError(null);
    setStatus("saving");
    const result = await updateShowcase(next).catch(() => ({ ok: false, error: "Le serveur est injoignable." }));
    if (id !== sequence.current) return;
    if (result.ok) {
      confirmed.current = next;
      setStatus("saved");
    } else {
      setShowcase(confirmed.current);
      setError(result.error ?? "Enregistrement impossible.");
      setStatus("error");
    }
  }, []);

  return { showcase, status, error, commit };
}
