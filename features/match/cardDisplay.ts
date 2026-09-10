import type { CardType } from "@/game";
import type { TideStateName } from "@/game";

// Données pures uniquement dans ce module (pas de hooks React) : il est
// importé depuis des Server Components (ex: app/decks/page.tsx via
// DeckViewer) qui ne peuvent pas transitivement tirer useState/useEffect.
// Le hook de chargement d'image vit dans useImageLoadStatus.ts.

export const CARD_TYPE_LABELS: Record<CardType, string> = {
  marin: "Marin",
  creature: "Créature",
  equipement: "Équipement",
  structure: "Structure",
  objet: "Objet",
  anomalie: "Anomalie",
};

export const TIDE_STATE_LABELS: Record<TideStateName, string> = {
  calme: "Calme",
  houle: "Houle",
  tempete: "Tempête",
  abysses: "Abysses",
};

export const TIDE_STATE_COLORS: Record<TideStateName, string> = {
  calme: "text-sky-300",
  houle: "text-cyan-300",
  tempete: "text-amber-300",
  abysses: "text-fuchsia-300",
};
