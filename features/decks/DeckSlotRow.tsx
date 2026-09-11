import { getCardDefinition } from "@/game";
import { TEXT_PRIMARY, TEXT_SECONDARY, TRANSITION } from "@/components/game-ui/tokens";
import { CardSquareThumbnail } from "@/features/decks/CardSquareThumbnail";

interface DeckSlotRowProps {
  index: number;
  cardId: string;
  onRemove: () => void;
}

/** Une ligne du deck en cours d'édition : numéro, vignette, nom, coût — clic ou icône = retire cet exemplaire. */
export function DeckSlotRow({ index, cardId, onRemove }: DeckSlotRowProps) {
  const def = getCardDefinition(cardId);

  return (
    <button
      type="button"
      onClick={onRemove}
      title="Retirer cet exemplaire"
      className={`group flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left ${TRANSITION} hover:bg-[var(--danger)]/10`}
    >
      <span className={`flex h-[1.6em] w-[1.6em] shrink-0 items-center justify-center rounded-full text-[0.75em] ${TEXT_SECONDARY}`}>
        {index}
      </span>
      <CardSquareThumbnail cardId={cardId} className="h-[2.1em] w-[2.1em]" />
      <span className={`min-w-0 flex-1 truncate text-[0.95em] ${TEXT_PRIMARY}`}>{def.name}</span>
      <span className="shrink-0 text-[0.85em] tabular-nums text-[var(--accent-hover)]">{def.cost}</span>
      <svg viewBox="0 0 24 24" fill="none" className="h-[1em] w-[1em] shrink-0 text-[var(--danger)] opacity-0 transition-opacity group-hover:opacity-100">
        <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
      </svg>
    </button>
  );
}
