import type { CardInstance } from "@/game";
import { CardBack } from "@/features/match/CardBack";

interface OpponentHandFanProps {
  cards: CardInstance[];
}

/** Même taille que les cartes de la main du viewer (`HandFan`, `BASE_WIDTH`). */
const WIDTH = "w-36";

const MAX_ROTATION_DEG = 26;
const MAX_ARC_DROP_PX = 26;
const OVERLAP_PX = 38;

/**
 * Main adverse : dos de carte uniquement (information cachée, jamais
 * cliquable), en vraie symétrie horizontale de `HandFan` (reflet dans un
 * miroir posé à plat, pas juste un décalage vertical) — le centre du rang
 * plonge vers le plateau, les bords remontent, ET la rotation de chaque
 * carte est inversée par rapport à son équivalent dans `HandFan` (une
 * réflexion inverse aussi la chiralité de la rotation, sans quoi les
 * cartes gardent la même inclinaison que la main du joueur et l'arc ne se
 * lit pas comme un miroir). Même taille que les cartes du viewer pour
 * rester cohérent visuellement.
 */
export function OpponentHandFan({ cards }: OpponentHandFanProps) {
  const count = cards.length;
  const angleStep = count > 1 ? Math.min(8, MAX_ROTATION_DEG / ((count - 1) / 2)) : 0;

  return (
    <div className="flex items-start justify-center">
      {cards.map((card, index) => {
        const offsetFromCenter = index - (count - 1) / 2;
        const rotation = -offsetFromCenter * angleStep;
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
