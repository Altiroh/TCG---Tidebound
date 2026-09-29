"use client";

import { QuestJournal, QuestJournalError, QuestJournalSkeleton } from "@/features/quests/QuestJournal";
import { previewQuestBoard, previewVoyageBoard } from "@/features/quests/previewQuestBoard";
import { GameScreen } from "@/features/shell/GameScreen";
import game from "@/features/shell/GameScreen.module.css";

/** États montrables au labo (`?etat=`) : le journal, son attente, son échec, son registre vide, ou la Traversée seule en attente. */
export type QuestJournalPreviewState = "journal" | "chargement" | "erreur" | "vide" | "traversee";

/**
 * Le journal de bord seul, sur la coquille commune, pour le labo
 * `/game/quetes-preview` — le vrai vit dans l'onglet « Quêtes » du profil.
 * Rien à relire après une réclamation : les données sont fabriquées.
 */
export function QuestJournalPreview({ state = "journal" }: { state?: QuestJournalPreviewState }) {
  const board = previewQuestBoard();
  const content =
    state === "chargement" ? (
      <QuestJournalSkeleton />
    ) : state === "erreur" ? (
      <QuestJournalError onRetry={() => {}} />
    ) : state === "vide" ? (
      <QuestJournal board={{ ...board, daily: [], weekly: [] }} voyages={previewVoyageBoard()} onChanged={() => {}} />
    ) : (
      <QuestJournal board={board} voyages={previewVoyageBoard()} voyagesPending={state === "traversee"} onChanged={() => {}} />
    );
  return (
    <GameScreen active={null} nav="minimal">
      <div className={game.content}>
        <div className={game.contentInner}>
          {content}
        </div>
      </div>
    </GameScreen>
  );
}
