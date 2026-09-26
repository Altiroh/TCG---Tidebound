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
      // Titre sous le nom : `?titre=0` le retire, `?titre=…` en essaie un autre.
      // Illustration de la photo : `?avatar=0` la retire (le Navire la remplace), `?avatar=<carte>` en essaie une autre.
      player={{
        name: "Alti",
        ship: getShipDefinition("le-goliath"),
        title: params.get("titre") === "0" ? null : (params.get("titre") ?? "Amiral des marées"),
        avatarCardId: params.get("avatar") === "0" ? null : (params.get("avatar") ?? "bat-marin-abyssal"),
      }}
      onExit={() => window.location.reload()}
      audience={
        params.get("public") === "0"
          ? undefined
          : defaite
            ? {
                spectacle: 34,
                highlights: ["Trop vite expédiée", "Des hésitations qui ont lassé"],
                signals: [
                  { id: "tempo.expedited", family: "rythme", label: "Trop vite expédiée", weight: -20, salience: 6 },
                  { id: "erreur.timeout", family: "erreur", label: "Des hésitations qui ont lassé", weight: -12, salience: 7 },
                  { id: "maitrise.solid", family: "maitrise", label: "Un jeu solide", weight: 5, salience: 2 },
                ],
                liveDelta: -35,
              }
            : {
                spectacle: 78,
                highlights: ["Un retournement de haut vol", "Un duel indécis jusqu'au bout"],
                signals: [
                  { id: "tension.comeback", family: "tension", label: "Un retournement de haut vol", weight: 25, salience: 10 },
                  { id: "tempo.full", family: "rythme", label: "Une vraie traversée", weight: 12, salience: 2 },
                  { id: "tension.swings", family: "tension", label: "Un duel indécis jusqu'au bout", weight: 8, salience: 7 },
                  { id: "moments.brilliant", family: "maitrise", label: "Des coups d'éclat qui ont porté", weight: 7, salience: 6 },
                ],
                liveDelta: 70,
              }
      }
      preview={{
        // Spectacle 78 : « captivé », la prime du public paie 10 XP et 1 Tide ; 34 ne paie rien.
        audience: defaite ? { spectacle: 34, before: 1240, after: 1162 } : { spectacle: 78, before: 1240, after: 1382, prize: { xp: 10, tides: 1 } },
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
