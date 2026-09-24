"use client";

import { QuestJournal } from "@/features/quests/QuestJournal";
import { previewQuestBoard, previewVoyageBoard } from "@/features/quests/previewQuestBoard";
import { GameScreen } from "@/features/shell/GameScreen";
import game from "@/features/shell/GameScreen.module.css";

/**
 * Le journal de bord seul, sur la coquille commune, pour le labo
 * `/game/quetes-preview` — le vrai vit dans l'onglet « Quêtes » du profil.
 * Rien à relire après une réclamation : les données sont fabriquées.
 */
export function QuestJournalPreview() {
  return (
    <GameScreen active={null} nav="minimal">
      <div className={game.content}>
        <div className={game.contentInner}>
          <QuestJournal board={previewQuestBoard()} voyages={previewVoyageBoard()} onChanged={() => {}} />
        </div>
      </div>
    </GameScreen>
  );
}
