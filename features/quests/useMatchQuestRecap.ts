"use client";

import { useEffect, useState } from "react";
import { fetchMatchQuestRecap, type QuestRecapEntry } from "@/features/quests/actions";
import { fetchMatchVoyageRecap, type VoyageRecap } from "@/features/quests/voyageActions";

/**
 * Le RELEVÉ DE QUÊTES d'une partie arbitrée : les quêtes que la partie a
 * fait avancer, et l'escale de Traversée si elle a bougé. Figé côté serveur
 * à l'arbitrage (`fetchMatchQuestRecap`) : il ne bouge plus ensuite.
 *
 * Partagé par le volet de la victoire (`MatchQuestRecap`) et la ligne de
 * quêtes de l'écran de défaite (`DefeatScreen`). Un relevé FABRIQUÉ
 * (`preview`, labo `/game/fin-preview`) évite toute lecture serveur.
 */
export function useMatchQuestRecap(
  matchId?: string,
  preview?: QuestRecapEntry[],
  voyagePreview?: VoyageRecap | null
): { entries: QuestRecapEntry[]; voyage: VoyageRecap | null } {
  const [entries, setEntries] = useState<QuestRecapEntry[]>(() => preview ?? []);
  const [voyage, setVoyage] = useState<VoyageRecap | null>(() => voyagePreview ?? null);

  useEffect(() => {
    if (!matchId || preview) return;
    let cancelled = false;
    void fetchMatchQuestRecap(matchId).then((result) => !cancelled && setEntries(result));
    void fetchMatchVoyageRecap(matchId).then((result) => !cancelled && setVoyage(result));
    return () => {
      cancelled = true;
    };
  }, [matchId, preview]);

  return { entries, voyage };
}
