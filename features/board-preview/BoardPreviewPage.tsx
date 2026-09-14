"use client";

import { useRef, useState } from "react";
import { BackgroundLayer } from "@/features/board-preview/BackgroundLayer";
import { CenterZone } from "@/features/board-preview/CenterZone";
import { DebugOverlay } from "@/features/board-preview/DebugOverlay";
import { EffectsLayer } from "@/features/board-preview/EffectsLayer";
import { GameStage } from "@/features/board-preview/GameStage";
import { GameViewport } from "@/features/board-preview/GameViewport";
import { OpponentZone } from "@/features/board-preview/OpponentZone";
import { PlayerZone } from "@/features/board-preview/PlayerZone";
import { PreviewHud } from "@/features/board-preview/PreviewHud";
import { PREVIEW_FIXTURES } from "@/features/board-preview/previewFixtures";
import { useBoardPreviewMetrics } from "@/features/board-preview/useBoardPreviewMetrics";

/**
 * BOARD PREVIEW — laboratoire de layout, écran temporaire.
 * ========================================================
 *
 * Ce qu'il est : un bac à sable purement visuel pour régler la composition
 * du plateau (proportions, espacements, zones, responsive) sur toutes les
 * résolutions cibles, du 2560×1440 au 740×360 en paysage.
 *
 * Ce qu'il n'est PAS, et ne doit jamais devenir :
 *   - il ne crée aucune partie (`createLocalMatch` & co ne sont pas importés) ;
 *   - il n'appelle aucun matchmaking, aucun backend, aucune Server Action ;
 *   - il n'enregistre aucune progression, ne consomme aucune ressource ;
 *   - il ne lit ni ne modifie aucun deck ;
 *   - il n'a besoin d'aucun adversaire, ni d'aucun compte.
 * Aucun import de `@/game` ni de `@/lib/supabase` ne doit apparaître dans
 * `features/board-preview/` : c'est la garantie de cette isolation.
 *
 * Il ne remplace pas non plus le board réel (`features/match/MatchBoard.tsx`,
 * `features/match/BoardStage.tsx`), qui reste strictement inchangé. Une
 * fois la composition validée ici, elle sera réinjectée progressivement
 * là-bas — d'où le soin mis à ne coupler la disposition à AUCUN
 * placeholder (cf. les props `renderCard` de `PreviewBoard`/`PreviewHand`).
 */
export function BoardPreviewPage() {
  const stageRef = useRef<HTMLDivElement>(null);
  const metrics = useBoardPreviewMetrics(stageRef);
  const [zonesVisible, setZonesVisible] = useState(false);
  const [debugCollapsed, setDebugCollapsed] = useState(false);

  const { opponent, player, tide, opponentBoard, playerBoard, playerHand } = PREVIEW_FIXTURES;

  return (
    <GameViewport debugZones={zonesVisible}>
      <BackgroundLayer />

      <GameStage ref={stageRef}>
        <OpponentZone side={opponent} board={opponentBoard} />
        <CenterZone tide={tide} />
        <PlayerZone side={player} board={playerBoard} hand={playerHand} />

        <PreviewHud turn={3} phaseLabel="Fin de tour" handCount={playerHand.length} />

        <EffectsLayer />
      </GameStage>

      <DebugOverlay
        metrics={metrics}
        zonesVisible={zonesVisible}
        onToggleZones={() => setZonesVisible((visible) => !visible)}
        collapsed={debugCollapsed}
        onToggleCollapsed={() => setDebugCollapsed((collapsed) => !collapsed)}
      />
    </GameViewport>
  );
}
