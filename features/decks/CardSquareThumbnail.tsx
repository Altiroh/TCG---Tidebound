import { getCardDefinition } from "@/game";
import { useImageOk } from "@/features/match/useImageOk";

interface CardSquareThumbnailProps {
  cardId: string;
  className?: string;
}

/**
 * Vignette carrée d'une carte (liste de deck) — illustration seule, pas le
 * cadre complet de `CardTile` (hors de propos pour une ligne de liste).
 * Pour une Abyssale, superpose le calque de débord par-dessus l'illustration
 * de base ("le montage"), même principe que `CardTile` en plus simple : pas
 * de zones calées sur un cadre, juste les deux images empilées plein cadre.
 */
export function CardSquareThumbnail({ cardId, className = "" }: CardSquareThumbnailProps) {
  const def = getCardDefinition(cardId);
  const isAbyssal = def.subtype === "abyssal";
  const illustrationUrl = `/assets/cards/illustrations/${cardId}.png`;
  const debordUrl = `/assets/cards/illustrations/${cardId}-debord.png`;
  const debordOk = useImageOk(isAbyssal ? debordUrl : "");

  return (
    <div className={`relative aspect-square shrink-0 overflow-hidden rounded-sm bg-black/40 ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- vignette de liste, pas une CardTile complète */}
      <img src={illustrationUrl} alt="" className="h-full w-full object-cover" />
      {isAbyssal && debordOk && (
        // eslint-disable-next-line @next/next/no-img-element -- calque de débord Abyssal, cf. CardTile
        <img src={debordUrl} alt="" className="pointer-events-none absolute inset-0 h-full w-full object-contain" />
      )}
    </div>
  );
}
