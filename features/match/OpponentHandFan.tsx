import type { CardInstance } from "@/game";
import { CardBack } from "@/features/match/CardBack";

interface OpponentHandFanProps {
  cards: CardInstance[];
}

/** Même taille que les cartes de la main du viewer (`HandFan`, `BASE_WIDTH`). */
const WIDTH = "w-40";

const MAX_ROTATION_DEG = 26;
const MAX_ARC_DROP_PX = 26;
const OVERLAP_PX = 42;

/**
 * Main adverse : dos de carte uniquement (information cachée, jamais
 * cliquable), en arc-de-cercle INVERSÉ par rapport à `HandFan` — le
 * centre du rang plonge vers le plateau, les bords remontent — même
 * taille que les cartes du viewer pour rester cohérent visuellement.
 */
export function OpponentHandFan({ cards }: OpponentHandFanProps) {
  const count = cards.length;
  const angleStep = count > 1 ? Math.min(8, MAX_ROTATION_DEG / ((count - 1) / 2)) : 0;

  return (
    <div className="flex items-start justify-center">
      {cards.map((card, index) => {
        const offsetFromCenter = index - (count - 1) / 2;
        const rotation = offsetFromCenter * angleStep;
        const arcRise = Math.min(MAX_ARC_DROP_PX, Math.abs(offsetFromCenter) * 6);

        return (
          <div
            key={card.instanceId}
            className="origin-top"
            style={{
              marginLeft: index === 0 ? 0 : -OVERLAP_PX,
              zIndex: index,
              transform: `translateY(${-arcRise}px) rotate(${rotation}deg)`,
            }}
          >
            <CardBack widthClassName={WIDTH} />
          </div>
        );
      })}
    </div>
  );
}
