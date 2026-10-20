"use client";

import { useEffect, useState } from "react";
import { fetchShowcaseEditor } from "@/features/friends/showcaseActions";
import { ShowcaseEditor } from "@/features/friends/ShowcaseEditor";
import game from "@/features/shell/GameScreen.module.css";

type EditorData = NonNullable<Awaited<ReturnType<typeof fetchShowcaseEditor>>>;

/**
 * Composer sa vitrine (panneau Amis, depuis le « + » de sa fiche ; profil) : six cartes de sa collection, dans l'édition
 * choisie, que voient ses amis (panneau Amis) et ses adversaires (avant une
 * partie en ligne). Lue à l'ouverture de l'onglet ; rien hors volet social.
 */
export function ShowcaseSection({ initialSlot, onSaved }: { initialSlot?: number; onSaved?: () => void } = {}) {
  const [data, setData] = useState<EditorData | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    fetchShowcaseEditor()
      .then((result) => !cancelled && setData(result))
      .catch(() => !cancelled && setData(null));
    return () => {
      cancelled = true;
    };
  }, []);

  if (data === undefined) return <p className={game.muted}>Chargement de ta vitrine…</p>;
  if (data === null) return <p className={game.error}>Vitrine indisponible pour le moment.</p>;
  return <ShowcaseEditor initialShowcase={data.showcase} ownedCounts={data.ownedCounts} ownedEditions={data.ownedEditions} initialSlot={initialSlot} onSaved={onSaved} />;
}
