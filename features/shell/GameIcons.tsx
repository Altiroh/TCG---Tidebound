/**
 * Les deux monnaies de l'interface, en un seul endroit.
 *
 * Elles apparaissent partout — bandeau de compte, Market, paliers, quêtes,
 * exploits, fiches de deck — et toujours au milieu d'une phrase, à la
 * hauteur du texte. D'où un composant minuscule plutôt qu'une balise
 * `<img>` recopiée : la taille, le repli et le `aria-hidden` se décident
 * une fois.
 *
 * Ce sont les VRAIS objets peints du jeu, pas des pictogrammes de logiciel
 * (même principe que `RewardIcon`) : les boulons jaunes pour les Tides, la
 * capsule aux deux cartes pour le Jeton de Préconstruit.
 *
 * Module à part, et non exporté depuis `HeaderPlayer` comme l'était la
 * pièce : cinq écrans avaient fini par importer tout le bandeau de compte
 * — et ses lectures de progression — pour une icône de 15 px.
 */

/** Jeton de Tides — la monnaie du jeu, reconnaissable d'un coup d'œil. */
export function TideCoin({ size = 15 }: { size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- icône locale, taille fixée par l'appelant
    <img
      src="/assets/ui/icons/tides.webp"
      alt=""
      aria-hidden
      draggable={false}
      width={size}
      height={size}
      className="inline-block shrink-0 select-none object-contain align-[-0.12em] drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]"
    />
  );
}

/** Jeton de Préconstruit — dépensé dans Decks → Préconstruits (§4). */
export function PreconToken({ size = 15 }: { size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- icône locale, taille fixée par l'appelant
    <img
      src="/assets/ui/icons/precon-token.webp"
      alt=""
      aria-hidden
      draggable={false}
      width={size}
      height={size}
      className="inline-block shrink-0 select-none object-contain align-[-0.12em] drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]"
    />
  );
}

/** Étoile de métal peinte, pleine ou vide (`ui/icons/etoile-*.webp`). */
export function StarIcon({ filled, className }: { filled: boolean; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- icône locale, taille fixée par l'appelant
    <img
      src={filled ? "/assets/ui/icons/etoile-pleine.webp" : "/assets/ui/icons/etoile-vide.webp"}
      alt=""
      aria-hidden
      draggable={false}
      className={className}
      style={{ width: "var(--tb-star, 1em)", height: "var(--tb-star, 1em)", objectFit: "contain", flex: "none", userSelect: "none" }}
    />
  );
}

/**
 * La DIFFICULTÉ d'un deck en cinq étoiles peintes. La taille d'une étoile se
 * règle chez l'appelant par `--tb-star` (1em par défaut) ; l'écart, par `gap`.
 */
export function DifficultyStars({ value, className, decorative = false }: { value: number; className?: string; decorative?: boolean }) {
  const filled = Math.min(5, Math.max(0, Math.round(value)));
  return (
    <span
      className={className}
      style={{ display: "inline-flex", alignItems: "center", gap: "0.1em", lineHeight: 1 }}
      {...(decorative ? { "aria-hidden": true } : { role: "img", "aria-label": `Difficulté ${filled} sur 5`, title: `Difficulté ${filled} sur 5` })}
    >
      {Array.from({ length: 5 }, (_, index) => (
        <StarIcon key={index} filled={index < filled} />
      ))}
    </span>
  );
}
