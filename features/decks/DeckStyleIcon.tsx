import { deckStyleLabel, type DeckStyleId } from "@/game";

/**
 * L'EMBLÈME d'un style de deck (Agressif, Tempo, Midrange, Contrôle,
 * Défensif, Combo) — un par valeur de `DECK_STYLES`, peint à la main
 * (`public/assets/decks/styles/`, 26/09/2026).
 *
 * Le fichier porte l'IDENTIFIANT du style, jamais son libellé : un
 * libellé se retouche, l'identifiant est figé en base (`deck_style`).
 */
export function deckStyleIconUrl(styleId: DeckStyleId): string {
  return `/assets/decks/styles/style-${styleId}.webp`;
}

/**
 * L'emblème seul. Décoratif par défaut (`alt=""`) : il accompagne toujours
 * le libellé du style, qui le dit en toutes lettres. `labelled` le rend
 * parlant, pour les rares endroits où il s'affiche sans son libellé.
 */
export function DeckStyleIcon({
  styleId,
  className,
  labelled = false,
}: {
  styleId: DeckStyleId;
  className?: string;
  labelled?: boolean;
}) {
  const label = deckStyleLabel(styleId);
  return (
    // eslint-disable-next-line @next/next/no-img-element -- emblème local de 256 px, affiché à taille fixe
    <img
      src={deckStyleIconUrl(styleId)}
      alt={labelled ? label : ""}
      title={label}
      className={className}
      draggable={false}
      loading="lazy"
      decoding="async"
    />
  );
}
