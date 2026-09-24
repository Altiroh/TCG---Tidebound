"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { getShipDefinition } from "@/game";
import { MatchEndScreen } from "@/features/match/MatchEndScreen";
import type { QuestRecapEntry } from "@/features/quests/actions";

/** Relevé fabriqué : une quête qui avance, une qui se termine, une longue. */
const QUETES: QuestRecapEntry[] = [
  quete("prendre-le-large", "Prendre le large", "parties", 0, 1, 3),
  quete("main-sure", "Main sûre", "cartes", 1, 3, 3, true),
  quete("une-longue-semaine", "Une longue semaine", "parties", 6, 7, 20),
];

function quete(
  code: string,
  name: string,
  category: QuestRecapEntry["category"],
  before: number,
  after: number,
  target: number,
  completed = false
): QuestRecapEntry {
  return { questId: code, periodKey: "labo", code, name, category, before, after, target, completed, rewardTides: 40, rewardXp: 0, rewardBoosterId: null };
}

function Ecran() {
  const params = useSearchParams();
  const defaite = params.get("issue") === "defaite";
  return (
    <MatchEndScreen
      outcome={defaite ? "defeat" : "victory"}
      player={{ name: "Alti", ship: getShipDefinition("le-goliath") }}
      onExit={() => window.location.reload()}
      preview={{
        reward: { xp: defaite ? 60 : 125, tides: defaite ? 0 : 30, levelBefore: 4, levelAfter: 4, firstWinOfDay: !defaite },
        quests: params.get("quetes") === "0" ? [] : QUETES,
        // Escale de Traversée : `?escale=0` la retire, `?escale=fin` la boucle.
        voyage:
          params.get("escale") === "0"
            ? null
            : {
                voyageId: "premier-quart",
                voyageName: "Le Premier Quart",
                numeral: "I",
                stepName: "Barre en main",
                stepLabel: "Activer la capacité de votre Navire 3 fois",
                tier: 2,
                before: 1,
                after: params.get("escale") === "fin" ? 3 : 2,
                target: 3,
                completedStep: params.get("escale") === "fin",
              },
      }}
    />
  );
}

/** Labo de l'écran de fin (`/game/fin-preview`), sans partie ni serveur. */
export function FinPreview() {
  return (
    <Suspense>
      <Ecran />
    </Suspense>
  );
}
